import ExcelJS from 'exceljs';
import { normalizarTexto, type GrupoProduto, type ProdutoMercado, type ProdutoPainel } from '@mercado/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { abrirBancoDeTeste, URL_BANCO_TESTE, type BancoDeTeste } from './banco/apoioTeste';
import { lerConfig } from './config';
import { criarEmailMemoria } from './email';
import { comToken, enviarPlanilha, lerPlanilha } from './rotas/apoioTeste';
import { montarServidor } from './servidor';

/**
 * Roteiro fim a fim: a história inteira do produto contra a API real (repositório em memória),
 * só por `app.inject`. A única escrita direta no repositório é o passo 8 (envelhecer ofertas);
 * `listarBuscas` (passo 11) é só leitura. Os passos dependem uns dos outros e rodam em ordem:
 * o nome de cada `it` diz qual passo falhou.
 */

const DIA = 24 * 60 * 60 * 1000;

const ADMIN = { email: 'admin@exemplo.com', senha: 'senha-do-admin-1' };
const CLIENTE = { email: 'maria@exemplo.com', senha: 'senha-da-maria-1' };
const EMAIL_BOM_PRECO = 'bompreco@exemplo.com';
const EMAIL_ATACAREJO = 'atacarejo@exemplo.com';

const PLANILHAS = [
  { arquivo: 'mercado-1-bom-preco.xlsx', nome: 'Mercado Bom Preço', importadas: 26 },
  { arquivo: 'mercado-2-estrela-da-vila.xlsx', nome: 'Supermercado Estrela da Vila', importadas: 29 },
  { arquivo: 'mercado-3-emporio-sonia.xlsx', nome: 'Empório Sonia', importadas: 29 },
  { arquivo: 'mercado-4-atacarejo-economico.xlsx', nome: 'Atacarejo Econômico', importadas: 29 },
];

// Códigos de barras dos produtos usados no roteiro.
const FOX_12 = '7890070035629';
const FOX_4 = '7890070036992';
const PAPEL_X = '7890070038361';
const NEVE = '7890070039733';
const SABONETE = '7890070041101';

// Ids dos mercados, na ordem em que as planilhas são enviadas (confirmados no passo 2).
const BOM_PRECO = 1;
const ESTRELA = 2;
const EMPORIO = 3;
const ATACAREJO = 4;

/** Resumo de uma busca para comparar de uma vez: código, nome do grupo e `[mercado, preço, preço por unidade]`. */
const resumo = (grupos: GrupoProduto[]) =>
  grupos.map((g) => ({
    codigo: g.codigoBarras,
    nome: g.nome,
    ofertas: g.ofertas.map((o) => [o.mercadoId, o.preco, o.precoPorUnidade]),
  }));

describe('roteiro fim a fim', () => {
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

  let app: Awaited<ReturnType<typeof montarServidor>>['app'];
  let repo: Awaited<ReturnType<typeof montarServidor>>['repo'];
  let banco: BancoDeTeste | undefined;
  const email = criarEmailMemoria();

  let tokenAdmin = '';
  let tokenMercado = '';
  let tokenCliente = '';
  let idCliente = 0;
  let buscasDoCliente = 0;

  beforeAll(async () => {
    const config = lerConfig({
      JWT_SECRET: 'segredo-do-roteiro-fim-a-fim-com-mais-de-32-caracteres',
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_SENHA: ADMIN.senha,
      CARREGAR_DADOS_DE_TESTE: '0',
    });
    expect(config.carregarDadosDeTeste).toBe(false);
    // Com BANCO_TESTE_URL definida, o mesmo roteiro roda contra um SQL Server de verdade (o banco de testes é apagado antes).
    if (URL_BANCO_TESTE) {
      banco = await abrirBancoDeTeste();
      ({ app, repo } = await montarServidor(config, { email, repo: await banco.esvaziar() }));
    } else {
      ({ app, repo } = await montarServidor(config, { email }));
    }
  });

  afterAll(async () => {
    await app.close();
    await banco?.fechar();
  });

  const entrar = async (credenciais: { email: string; senha: string }) => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: credenciais });
    expect(res.statusCode).toBe(200);
    return res.json() as { token: string; papel: string; emailVerificado: boolean };
  };

  const pegar = (url: string, token: string, query?: Record<string, string>) =>
    app.inject({ method: 'GET', url, headers: comToken(token), ...(query ? { query } : {}) });

  const buscar = async (q: string, ordem?: 'unidade' | 'embalagem'): Promise<GrupoProduto[]> => {
    buscasDoCliente += 1;
    const res = await pegar('/busca', tokenCliente, { q, ...(ordem ? { ordem } : {}) });
    expect(res.statusCode).toBe(200);
    return res.json() as GrupoProduto[];
  };

  const produtosDoPainel = async (): Promise<{ itens: ProdutoPainel[]; total: number }> => {
    const res = await pegar('/painel/produtos', tokenMercado);
    expect(res.statusCode).toBe(200);
    return res.json() as { itens: ProdutoPainel[]; total: number };
  };

  it('passo 1: o administrador entra', async () => {
    const login = await entrar(ADMIN);
    expect(login.papel).toBe('admin');
    tokenAdmin = login.token;

    // Sem dados de teste: nada de mercados até as planilhas chegarem.
    const res = await pegar('/admin/mercados', tokenAdmin);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('passo 2: o administrador envia as 4 planilhas de teste', async () => {
    for (const [i, p] of PLANILHAS.entries()) {
      const res = await enviarPlanilha(app, tokenAdmin, lerPlanilha(p.arquivo));
      expect(res.statusCode, p.arquivo).toBe(200);
      expect(res.json(), p.arquivo).toEqual({
        mercadoId: i + 1,
        mercadoCriado: true,
        importadas: p.importadas,
        erros: [],
      });
    }

    const lista = await pegar('/admin/mercados', tokenAdmin);
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toEqual([
      expect.objectContaining({ id: BOM_PRECO, nome: 'Mercado Bom Preço', status: 'ativo', totalProdutos: 26, temLogin: false }),
      expect.objectContaining({ id: ESTRELA, nome: 'Supermercado Estrela da Vila', status: 'ativo', totalProdutos: 29, temLogin: false }),
      expect.objectContaining({ id: EMPORIO, nome: 'Empório Sonia', status: 'ativo', totalProdutos: 29, temLogin: false }),
      expect.objectContaining({ id: ATACAREJO, nome: 'Atacarejo Econômico', status: 'ativo', totalProdutos: 29, temLogin: false }),
    ]);
  });

  it('passo 3: o administrador cria o acesso do Mercado Bom Preço e o mercado entra', async () => {
    const criar = await app.inject({
      method: 'POST',
      url: `/admin/mercados/${BOM_PRECO}/acesso`,
      headers: comToken(tokenAdmin),
      payload: { email: EMAIL_BOM_PRECO },
    });
    expect(criar.statusCode).toBe(201);
    const { senhaTemporaria } = criar.json() as { senhaTemporaria: string };
    expect(senhaTemporaria).toHaveLength(12);

    const login = await entrar({ email: EMAIL_BOM_PRECO, senha: senhaTemporaria });
    expect(login.papel).toBe('mercado');
    tokenMercado = login.token;

    const painel = await pegar('/painel/mercado', tokenMercado);
    expect(painel.statusCode).toBe(200);
    expect(painel.json()).toEqual({
      id: BOM_PRECO,
      nome: 'Mercado Bom Preço',
      endereco: 'Rua dos Ipês, 120 – Vila Sônia, São Paulo – SP',
      telefone: null,
      detalhes: null,
      perfilCompleto: false,
      totalProdutos: 26,
      produtosDesatualizados: 0,
    });

    // Um segundo acesso para o mesmo mercado é recusado.
    const outra = await app.inject({
      method: 'POST',
      url: `/admin/mercados/${BOM_PRECO}/acesso`,
      headers: comToken(tokenAdmin),
      payload: { email: 'outro@exemplo.com' },
    });
    expect(outra.statusCode).toBe(409);
  });

  it('passo 4: o mercado corrige o preço do papel Neve à mão e o painel mostra o novo preço', async () => {
    const antes = (await produtosDoPainel()).itens.find((p) => p.codigoBarras === NEVE);
    expect(antes).toMatchObject({ nome: 'Papel Higiênico Neve Folha Dupla', preco: 15.49, quantidadeTexto: '12 rolos' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/painel/produtos/${NEVE}`,
      headers: comToken(tokenMercado),
      payload: { preco: 13.2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ codigoBarras: NEVE, preco: 13.2, desatualizado: false });

    const lista = await produtosDoPainel();
    expect(lista.total).toBe(26);
    expect(lista.itens.find((p) => p.codigoBarras === NEVE)).toMatchObject({ preco: 13.2, desatualizado: false });
    // Os outros produtos ficam como estavam.
    expect(lista.itens.find((p) => p.codigoBarras === SABONETE)).toMatchObject({ preco: 2, disponivel: true });
  });

  it('passo 5: o cliente se cadastra (sem confirmar e-mail) e busca papel higiênico (com o preço corrigido)', async () => {
    const cadastro = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: CLIENTE });
    expect(cadastro.statusCode).toBe(201);
    const novo = cadastro.json() as { id: number; email: string; papel: string };
    expect(novo).toMatchObject({ email: CLIENTE.email, papel: 'cliente' });
    idCliente = novo.id;

    // Sem confirmação de e-mail: nenhum e-mail é enviado e a conta já entra verificada.
    expect(email.enviados).toHaveLength(0);

    const login = await entrar(CLIENTE);
    expect(login).toMatchObject({ papel: 'cliente', emailVerificado: true });
    tokenCliente = login.token;

    // Nome do grupo: o mais comprido; em empate, o do mercado de menor id.
    // Grupos pelo menor preço por unidade: Neve (Bom Preço 13,20/12 = 1,10), Fox 12, X 12, Fox 4.
    const grupos = await buscar('papel higienico');
    expect(resumo(grupos)).toEqual([
      {
        codigo: NEVE,
        nome: 'Papel Higiênico Neve Folha Dupla',
        ofertas: [
          [BOM_PRECO, 13.2, 1.1],
          [ESTRELA, 14.79, 1.23],
          [EMPORIO, 16.2, 1.35],
        ],
      },
      {
        codigo: FOX_12,
        nome: 'PAPEL HIGIENICO FOX FOLHA DUPLA',
        ofertas: [
          [ATACAREJO, 14.7, 1.23],
          [EMPORIO, 18.5, 1.54],
        ],
      },
      {
        codigo: PAPEL_X,
        nome: 'PAPEL HIGIENICO X FOLHA SIMPLES',
        ofertas: [
          [EMPORIO, 16.6, 1.38],
          [ESTRELA, 14, null], // sem quantidade: sem preço por unidade, vai para o fim
        ],
      },
      {
        codigo: FOX_4,
        nome: 'PAPEL HIGIENICO FOX FOLHA DUPLA',
        ofertas: [
          [ATACAREJO, 5.79, 1.45],
          [EMPORIO, 6.89, null],
        ],
      },
    ]);

    // As ofertas trazem unidade, quantidade, mercado e a marca de "desatualizado".
    const neve = grupos[0]!.ofertas;
    expect(neve[0]).toMatchObject({
      mercadoNome: 'Mercado Bom Preço',
      endereco: 'Rua dos Ipês, 120 – Vila Sônia, São Paulo – SP',
      nomeNoMercado: 'Papel Higiênico Neve Folha Dupla',
      quantidadeTexto: '12 rolos',
      unidade: 'rolo',
      diasDesdeAtualizacao: 0,
      desatualizado: false,
    });
    expect(neve[1]).toMatchObject({ mercadoNome: 'Supermercado Estrela da Vila', nomeNoMercado: 'Papel Hig. Neve Folha Dupla' });
    expect(grupos.flatMap((g) => g.ofertas).every((o) => o.desatualizado === false)).toBe(true);

    // Pela embalagem: o mais barato da embalagem primeiro.
    const porEmbalagem = await buscar('papel higienico', 'embalagem');
    expect(porEmbalagem.map((g) => [g.codigoBarras, g.ofertas[0]!.mercadoId, g.ofertas[0]!.preco])).toEqual([
      [FOX_4, ATACAREJO, 5.79],
      [NEVE, BOM_PRECO, 13.2],
      [PAPEL_X, ESTRELA, 14],
      [FOX_12, ATACAREJO, 14.7],
    ]);
  });

  it('passo 6: o mercado reenvia a planilha original e a planilha vence a correção manual', async () => {
    const res = await enviarPlanilha(app, tokenMercado, lerPlanilha(PLANILHAS[0]!.arquivo));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mercadoId: BOM_PRECO, mercadoCriado: false, importadas: 26, erros: [] });

    expect((await produtosDoPainel()).itens.find((p) => p.codigoBarras === NEVE)?.preco).toBe(15.49);

    const grupos = await buscar('papel higienico');
    expect(resumo(grupos)).toEqual([
      {
        codigo: FOX_12,
        nome: 'PAPEL HIGIENICO FOX FOLHA DUPLA',
        ofertas: [
          [ATACAREJO, 14.7, 1.23],
          [EMPORIO, 18.5, 1.54],
        ],
      },
      {
        codigo: NEVE,
        nome: 'Papel Higiênico Neve Folha Dupla',
        ofertas: [
          [ESTRELA, 14.79, 1.23],
          [BOM_PRECO, 15.49, 1.29],
          [EMPORIO, 16.2, 1.35],
        ],
      },
      {
        codigo: PAPEL_X,
        nome: 'PAPEL HIGIENICO X FOLHA SIMPLES',
        ofertas: [
          [EMPORIO, 16.6, 1.38],
          [ESTRELA, 14, null],
        ],
      },
      {
        codigo: FOX_4,
        nome: 'PAPEL HIGIENICO FOX FOLHA DUPLA',
        ofertas: [
          [ATACAREJO, 5.79, 1.45],
          [EMPORIO, 6.89, null],
        ],
      },
    ]);
  });

  it('passo 7: o mercado envia a planilha com o sabonete "não disponível" e ele some da busca e da lista', async () => {
    // Antes: o sabonete aparece nos 4 mercados.
    const antes = await buscar('sabonete');
    expect(resumo(antes)).toEqual([
      {
        codigo: SABONETE,
        nome: 'Sabonete Suave Aloe',
        ofertas: [
          [ATACAREJO, 1.8, 20], // 90 g: preço por kg
          [ESTRELA, 1.9, 21.11],
          [BOM_PRECO, 2, 22.22],
          [EMPORIO, 2.29, 25.44],
        ],
      },
    ]);

    // Copia a planilha real e troca só a célula "Disponível" do sabonete.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(lerPlanilha(PLANILHAS[0]!.arquivo) as unknown as ArrayBuffer);
    const aba = wb.getWorksheet('Produtos')!;
    let trocadas = 0;
    aba.eachRow((linha, n) => {
      if (n > 1 && String(linha.getCell(1).value) === SABONETE) {
        linha.getCell(6).value = 'não';
        trocadas += 1;
      }
    });
    expect(trocadas).toBe(1);
    const modificada = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await enviarPlanilha(app, tokenMercado, modificada);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mercadoId: BOM_PRECO, mercadoCriado: false, importadas: 26, erros: [] });

    // Some da busca: sobram 3 mercados.
    const depois = await buscar('sabonete');
    expect(depois.map((g) => g.ofertas.map((o) => o.mercadoId))).toEqual([[ATACAREJO, ESTRELA, EMPORIO]]);

    // Some da lista do cliente (25 de 26), mas o mercado ainda o vê no painel, como indisponível.
    const lista = await pegar(`/mercados/${BOM_PRECO}/produtos`, tokenCliente);
    expect(lista.statusCode).toBe(200);
    const { itens, total } = lista.json() as { itens: ProdutoMercado[]; total: number };
    expect(total).toBe(25);
    expect(itens).toHaveLength(25);
    expect(itens.some((p) => p.codigoBarras === SABONETE)).toBe(false);

    const painel = await produtosDoPainel();
    expect(painel.total).toBe(26);
    expect(painel.itens.find((p) => p.codigoBarras === SABONETE)).toMatchObject({ preco: 2, disponivel: false });
  });

  it('passo 8: preço de 8 dias fica desatualizado (continua na busca); 7 dias exatos não', async () => {
    // A única escrita direta no repositório do roteiro: mudar a data do preço.
    const agora = Date.now();
    const neveBomPreco = (await repo.acharOferta(BOM_PRECO, NEVE))!;
    await repo.salvarOferta({ ...neveBomPreco, precoAtualizadoEm: new Date(agora - 8 * DIA) });
    const neveEstrela = (await repo.acharOferta(ESTRELA, NEVE))!;
    await repo.salvarOferta({ ...neveEstrela, precoAtualizadoEm: new Date(agora - 7 * DIA) });

    const grupos = await buscar('papel higienico');
    const neve = grupos.find((g) => g.codigoBarras === NEVE)!;
    // O preço velho continua nos resultados, só marcado.
    expect(neve.ofertas.map((o) => [o.mercadoId, o.preco, o.diasDesdeAtualizacao, o.desatualizado])).toEqual([
      [ESTRELA, 14.79, 7, false],
      [BOM_PRECO, 15.49, 8, true],
      [EMPORIO, 16.2, 0, false],
    ]);
    const marcadas = grupos.flatMap((g) => g.ofertas.filter((o) => o.desatualizado).map((o) => [g.codigoBarras, o.mercadoId]));
    expect(marcadas).toEqual([[NEVE, BOM_PRECO]]);

    // Na lista de produtos do cliente a mesma marca.
    const lista = await pegar(`/mercados/${BOM_PRECO}/produtos`, tokenCliente);
    const { itens } = lista.json() as { itens: ProdutoMercado[] };
    expect(itens.find((p) => p.codigoBarras === NEVE)).toMatchObject({ preco: 15.49, diasDesdeAtualizacao: 8, desatualizado: true });

    // E no painel do mercado.
    const resumoPainel = (await pegar('/painel/mercado', tokenMercado)).json();
    expect(resumoPainel).toMatchObject({ totalProdutos: 26, produtosDesatualizados: 1 });
    expect((await produtosDoPainel()).itens.find((p) => p.codigoBarras === NEVE)).toMatchObject({ desatualizado: true });
  });

  it('passo 9: o administrador remove o Atacarejo Econômico, que some da lista e da busca, e o login dele perde o acesso', async () => {
    // Antes: o cliente vê os 4 mercados; o Atacarejo ganha um acesso.
    expect(((await pegar('/mercados', tokenCliente)).json() as unknown[]).length).toBe(4);
    const criar = await app.inject({
      method: 'POST',
      url: `/admin/mercados/${ATACAREJO}/acesso`,
      headers: comToken(tokenAdmin),
      payload: { email: EMAIL_ATACAREJO },
    });
    expect(criar.statusCode).toBe(201);
    const loginAtacarejo = await entrar({ email: EMAIL_ATACAREJO, senha: (criar.json() as { senhaTemporaria: string }).senhaTemporaria });
    expect(loginAtacarejo.papel).toBe('mercado');
    const tokenAtacarejo = loginAtacarejo.token;
    expect((await pegar('/painel/mercado', tokenAtacarejo)).statusCode).toBe(200);

    const remover = await app.inject({
      method: 'POST',
      url: `/admin/mercados/${ATACAREJO}/remover`,
      headers: comToken(tokenAdmin),
    });
    expect(remover.statusCode).toBe(204);

    // Some da lista do cliente e da busca.
    const mercados = (await pegar('/mercados', tokenCliente)).json() as { id: number; nome: string }[];
    expect(mercados.map((m) => m.id).sort()).toEqual([BOM_PRECO, ESTRELA, EMPORIO]);
    expect(mercados.some((m) => m.nome === 'Atacarejo Econômico')).toBe(false);
    expect((await pegar(`/mercados/${ATACAREJO}/produtos`, tokenCliente)).statusCode).toBe(404);

    const grupos = await buscar('papel higienico');
    expect(grupos.flatMap((g) => g.ofertas).some((o) => o.mercadoId === ATACAREJO)).toBe(false);
    expect(resumo(grupos)).toEqual([
      { codigo: NEVE, nome: 'Papel Higiênico Neve Folha Dupla', ofertas: [[ESTRELA, 14.79, 1.23], [BOM_PRECO, 15.49, 1.29], [EMPORIO, 16.2, 1.35]] },
      { codigo: PAPEL_X, nome: 'PAPEL HIGIENICO X FOLHA SIMPLES', ofertas: [[EMPORIO, 16.6, 1.38], [ESTRELA, 14, null]] },
      { codigo: FOX_12, nome: 'PAPEL HIGIENICO FOX FOLHA DUPLA', ofertas: [[EMPORIO, 18.5, 1.54]] },
      { codigo: FOX_4, nome: 'PAPEL HIGIENICO FOX FOLHA DUPLA', ofertas: [[EMPORIO, 6.89, null]] },
    ]);

    // O administrador o vê como removido.
    const adminMercados = (await pegar('/admin/mercados', tokenAdmin)).json() as { id: number; status: string }[];
    expect(adminMercados.find((m) => m.id === ATACAREJO)?.status).toBe('removido');

    // O login criado para ele continua existindo, mas não abre o painel (403) nem aceita planilha (403: ele não tem mais nenhum mercado ativo).
    expect((await entrar({ email: EMAIL_ATACAREJO, senha: (criar.json() as { senhaTemporaria: string }).senhaTemporaria })).papel).toBe('mercado');
    expect((await pegar('/painel/mercado', tokenAtacarejo)).statusCode).toBe(403);
    expect((await pegar('/painel/produtos', tokenAtacarejo)).statusCode).toBe(403);
    expect((await pegar('/painel/cobranca', tokenAtacarejo)).statusCode).toBe(403);
    const envio = await enviarPlanilha(app, tokenAtacarejo, lerPlanilha(PLANILHAS[3]!.arquivo));
    expect(envio.statusCode).toBe(403);
    // Nem o administrador reabre um mercado removido por planilha.
    const envioAdmin = await enviarPlanilha(app, tokenAdmin, lerPlanilha(PLANILHAS[3]!.arquivo));
    expect(envioAdmin.statusCode).toBe(422);
  });

  it('passo 10: o cliente lista os 3 mercados ativos e abre os produtos de um deles', async () => {
    const res = await pegar('/mercados', tokenCliente);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({ id: EMPORIO, nome: 'Empório Sonia', totalProdutos: 28 }), // o óleo está "não"
      expect.objectContaining({ id: BOM_PRECO, nome: 'Mercado Bom Preço', totalProdutos: 25 }), // o sabonete está "não"
      expect.objectContaining({ id: ESTRELA, nome: 'Supermercado Estrela da Vila', totalProdutos: 29 }),
    ]);

    const pagina1 = await pegar(`/mercados/${ESTRELA}/produtos`, tokenCliente, { pagina: '1' });
    expect(pagina1.statusCode).toBe(200);
    const { itens, total } = pagina1.json() as { itens: ProdutoMercado[]; total: number };
    expect(total).toBe(29);
    expect(itens).toHaveLength(29); // cabem todos numa página (50 por página)
    const nomes = itens.map((p) => p.nome);
    const chaves = nomes.map(normalizarTexto);
    expect(chaves).toEqual([...chaves].sort()); // em ordem de nome
    expect(itens.find((p) => p.codigoBarras === NEVE)).toMatchObject({
      nome: 'Papel Hig. Neve Folha Dupla',
      preco: 14.79,
      quantidadeTexto: '12 rolos',
      precoPorUnidade: 1.23,
      unidade: 'rolo',
      diasDesdeAtualizacao: 7,
      desatualizado: false,
    });

    // A página 2 existe, mas está vazia; página inválida é recusada.
    const pagina2 = await pegar(`/mercados/${ESTRELA}/produtos`, tokenCliente, { pagina: '2' });
    expect(pagina2.statusCode).toBe(200);
    expect(pagina2.json()).toEqual({ itens: [], total: 29 });
    expect((await pegar(`/mercados/${ESTRELA}/produtos`, tokenCliente, { pagina: '0' })).statusCode).toBe(400);
  });

  it('passo 11: o cliente exclui a conta; o acesso acaba, as buscas ficam anônimas e o e-mail pode voltar', async () => {
    // Antes: todas as buscas do roteiro são do cliente.
    const antes = await repo.listarBuscas();
    expect(antes).toHaveLength(buscasDoCliente);
    expect(buscasDoCliente).toBe(7);
    expect(antes.every((b) => b.usuarioId === idCliente)).toBe(true);

    // O e-mail ainda está em uso.
    const duplicado = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: CLIENTE });
    expect(duplicado.statusCode).toBe(409);

    const excluir = await app.inject({ method: 'DELETE', url: '/conta', headers: comToken(tokenCliente) });
    expect(excluir.statusCode).toBe(204);

    // O token não vale mais para a conta; as rotas públicas (mercados, busca) o ignoram e respondem como para quem não entrou.
    expect((await pegar('/conta', tokenCliente)).statusCode).toBe(401);
    expect((await pegar('/mercados', tokenCliente)).statusCode).toBe(200);
    const loginAntigo = await app.inject({ method: 'POST', url: '/auth/login', payload: CLIENTE });
    expect(loginAntigo.statusCode).toBe(401);

    // As buscas continuam registradas, sem ligação com ninguém.
    const buscas = await repo.listarBuscas();
    expect(buscas).toHaveLength(7);
    expect(buscas.every((b) => b.usuarioId === null)).toBe(true);
    expect(buscas.map((b) => [b.termo, b.resultados])).toEqual([
      ['papel higienico', 4], // passo 5, por unidade
      ['papel higienico', 4], // passo 5, por embalagem
      ['papel higienico', 4], // passo 6
      ['sabonete', 1], // passo 7, antes
      ['sabonete', 1], // passo 7, depois
      ['papel higienico', 4], // passo 8
      ['papel higienico', 4], // passo 9
    ]);
    expect(buscas.at(-1)).toMatchObject({ resultados: 4, mercadosDistintos: 3 });

    // O mesmo e-mail pode abrir uma conta nova (outro id, sem o histórico).
    const novo = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: CLIENTE });
    expect(novo.statusCode).toBe(201);
    expect((novo.json() as { id: number }).id).not.toBe(idCliente);
    expect((await entrar(CLIENTE)).papel).toBe('cliente');
  });
});
