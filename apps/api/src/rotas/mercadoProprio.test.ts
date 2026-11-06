// Testes do software "Bolso Certo - Mercado":
// - o mercado se cadastra sozinho só com e-mail e senha;
// - o mercado (nome, endereço completo, telefone) é cadastrado depois, em "Meu mercado"; um usuário pode ter vários;
// - cada usuário só vê e edita os mercados dele; o administrador (desenvolvedor) enxerga todos;
// - produto novo cadastrado à mão.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../app';
import { criarEmailMemoria } from '../email';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { comToken, corpoMultipart } from './apoioTeste';
import { MAXIMO_DE_MERCADOS_POR_CONTA } from './meusMercados';

const SENHA = 'senha-boa-123';
const EAN_LEITE = '7891000100103';
const EAN_ARROZ = '7891234567895';
const PLANILHA_EXEMPLO = path.resolve(__dirname, '../../../../exemplos/planilha-exemplo-para-subir.xlsx');

let app: FastifyInstance;
let emails: ReturnType<typeof criarEmailMemoria>;
let repo: ReturnType<typeof criarRepositorioMemoria>;

beforeEach(async () => {
  repo = criarRepositorioMemoria();
  emails = criarEmailMemoria();
  app = await construirApp({ repo, email: emails, jwtSecret: 'segredo-de-teste' });
});

const post = (url: string, corpo: unknown, token?: string) =>
  app.inject({ method: 'POST', url, payload: corpo as object, headers: token ? comToken(token) : {} });
const get = (url: string, token: string) => app.inject({ method: 'GET', url, headers: comToken(token) });
const patch = (url: string, corpo: unknown, token: string) =>
  app.inject({ method: 'PATCH', url, payload: corpo as object, headers: comToken(token) });

/** Dados completos de um mercado; `n` muda a rua para gerar mercados diferentes. */
const dadosMercado = (nome: string, n = 1, extra: Record<string, unknown> = {}) => ({
  nome,
  logradouro: `Rua das Flores ${n}`,
  numero: '120',
  complemento: 'Loja 2',
  bairro: 'Vila Sônia',
  cidade: 'São Paulo',
  uf: 'sp',
  cep: '05501-000',
  telefone: '(11) 91234-5678',
  ...extra,
});

/** Cria a conta (só e-mail e senha) e devolve o token de quem entrou. */
async function criarUsuarioMercado(email: string) {
  const res = await post('/auth/cadastro-mercado', { email, senha: SENHA });
  expect(res.statusCode).toBe(201);
  const login = await post('/auth/login', { email, senha: SENHA });
  return (login.json() as { token: string }).token;
}

/** Cadastra um mercado (endereço completo) na conta; devolve o id. */
async function cadastrarMercado(token: string, nome: string, n = 1) {
  const res = await post('/painel/meus-mercados', dadosMercado(nome, n), token);
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: number }).id;
}

/** Conta + um mercado. */
async function mercadoCompleto(nome: string, email: string, n = 1) {
  const token = await criarUsuarioMercado(email);
  return { token, mercadoId: await cadastrarMercado(token, nome, n) };
}

async function criarAdmin() {
  const u = await repo.criarUsuario({ email: 'dev@exemplo.com', senhaHash: 'x', papel: 'admin', emailVerificado: true });
  return app.jwt.sign({ id: u.id, papel: u.papel, inst: app.instancia });
}

async function criarCliente() {
  await post('/auth/cadastro', { email: 'cli@exemplo.com', senha: SENHA });
  return ((await post('/auth/login', { email: 'cli@exemplo.com', senha: SENHA })).json() as { token: string }).token;
}

const produto = (extra: Record<string, unknown> = {}) => ({ codigoBarras: EAN_LEITE, nome: 'Leite Integral 1 L', preco: 5.5, quantidade: '1 L', ...extra });

describe('POST /auth/cadastro-mercado (só e-mail e senha)', () => {
  it('cria a conta de mercado, já verificada e ainda sem mercado, sem mandar e-mail', async () => {
    const res = await post('/auth/cadastro-mercado', { email: 'Dono@Exemplo.com', senha: SENHA });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: 'dono@exemplo.com', papel: 'mercado' });
    expect(res.json()).not.toHaveProperty('senha');
    expect(emails.enviados).toHaveLength(0);
    expect((await repo.acharUsuarioPorEmail('dono@exemplo.com'))?.emailVerificado).toBe(true);
    expect(await repo.listarMercados()).toHaveLength(0);

    const { token } = (await post('/auth/login', { email: 'dono@exemplo.com', senha: SENHA })).json() as { token: string };
    expect((await get('/painel/meus-mercados', token)).json()).toEqual([]);
    const painel = await get('/painel/mercado', token);
    expect(painel.statusCode).toBe(403);
    expect(painel.json()).toEqual({ erro: 'Sua conta não está ligada a um mercado ativo' });
  });

  it.each([
    [{ email: 'nao-e-email', senha: SENHA }, 'E-mail inválido'],
    [{ email: 'a@b.com', senha: 'curta' }, 'A senha deve ter pelo menos 8 caracteres'],
    [{ senha: SENHA }, 'E-mail inválido'],
  ])('recusa dados inválidos %#', async (corpo, mensagem) => {
    const res = await post('/auth/cadastro-mercado', corpo);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: mensagem });
  });

  it('e-mail já cadastrado: 409', async () => {
    await post('/auth/cadastro', { email: 'ana@exemplo.com', senha: SENHA });
    const res = await post('/auth/cadastro-mercado', { email: 'ana@exemplo.com', senha: SENHA });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'E-mail já cadastrado' });
  });
});

describe('POST /painel/meus-mercados (cadastrar o mercado, com endereço completo)', () => {
  it('cria o mercado ligado à conta, monta o endereço em uma linha e guarda as partes e o telefone', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const res = await post('/painel/meus-mercados', dadosMercado('Mercado Bom Preço'), token);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      nome: 'Mercado Bom Preço',
      endereco: 'Rua das Flores 1, 120, Loja 2 - Vila Sônia, São Paulo - SP, CEP 05501-000',
      totalProdutos: 0,
      perfilCompleto: true,
    });

    const meu = (await get('/painel/mercado', token)).json();
    expect(meu).toMatchObject({
      nome: 'Mercado Bom Preço',
      telefone: '11912345678',
      perfilCompleto: true,
      detalhes: { logradouro: 'Rua das Flores 1', numero: '120', complemento: 'Loja 2', bairro: 'Vila Sônia', cidade: 'São Paulo', uf: 'SP', cep: '05501000' },
    });
  });

  it('o complemento é opcional', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const res = await post('/painel/meus-mercados', dadosMercado('Mercado A', 1, { complemento: '' }), token);
    expect(res.statusCode).toBe(201);
    expect(res.json().endereco).toBe('Rua das Flores 1, 120 - Vila Sônia, São Paulo - SP, CEP 05501-000');
  });

  it.each([
    ['nome', { nome: '' }, 'Informe o nome do mercado'],
    ['rua', { logradouro: '' }, 'Informe a rua ou avenida'],
    ['número', { numero: '' }, 'Informe o número (ou S/N)'],
    ['bairro', { bairro: ' ' }, 'Informe o bairro'],
    ['cidade', { cidade: '' }, 'Informe a cidade'],
    ['UF vazia', { uf: '' }, 'Informe o estado (UF), por exemplo SP'],
    ['UF que não existe', { uf: 'XX' }, 'Informe o estado (UF), por exemplo SP'],
    ['CEP curto', { cep: '123' }, 'CEP inválido (use 8 números, por exemplo 05501-000)'],
    ['CEP de zeros', { cep: '00000-000' }, 'CEP inválido (use 8 números, por exemplo 05501-000)'],
    ['telefone sem DDD', { telefone: '91234-5678' }, 'Telefone inválido (use DDD + número, por exemplo (11) 91234-5678)'],
    ['telefone vazio', { telefone: '' }, 'Telefone inválido (use DDD + número, por exemplo (11) 91234-5678)'],
    ['complemento que não é texto', { complemento: 5 }, 'O complemento é longo demais'],
  ])('recusa %s', async (_rotulo, troca, mensagem) => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const res = await post('/painel/meus-mercados', dadosMercado('Mercado A', 1, troca), token);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: mensagem });
    expect(await repo.listarMercados()).toHaveLength(0);
  });

  it('recusa campos que não existem e corpo sem objeto', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    expect((await post('/painel/meus-mercados', { ...dadosMercado('Mercado A'), usuarioId: 1 }, token)).json()).toEqual({ erro: 'Campo não permitido: usuarioId' });
    expect((await post('/painel/meus-mercados', {}, token)).statusCode).toBe(400);
  });

  it('mesmo nome e endereço de outro mercado: 409', async () => {
    await mercadoCompleto('Mercado A', 'a@exemplo.com', 1);
    const outro = await criarUsuarioMercado('b@exemplo.com');
    const res = await post('/painel/meus-mercados', dadosMercado('MERCADO a', 1, { uf: 'SP' }), outro);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'Já existe um mercado com esse nome e endereço' });
  });

  it('exige conta de mercado: sem login 401, cliente e administrador 403', async () => {
    expect((await post('/painel/meus-mercados', dadosMercado('Mercado A'))).statusCode).toBe(401);
    expect((await post('/painel/meus-mercados', dadosMercado('Mercado A'), await criarCliente())).statusCode).toBe(403);
    expect((await post('/painel/meus-mercados', dadosMercado('Mercado A'), await criarAdmin())).statusCode).toBe(403);
  });
});

describe('um usuário com vários mercados', () => {
  it('lista os mercados dele (do mais antigo ao mais novo); o primeiro vale se nada for escolhido', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const a = await cadastrarMercado(token, 'Mercado A', 1);
    const b = await cadastrarMercado(token, 'Mercado B', 2);
    const lista = (await get('/painel/meus-mercados', token)).json() as { id: number; nome: string }[];
    expect(lista.map((m) => [m.id, m.nome])).toEqual([[a, 'Mercado A'], [b, 'Mercado B']]);
    expect((await get('/painel/mercado', token)).json()).toMatchObject({ id: a });
  });

  it('?mercadoId= escolhe com qual deles trabalhar: produtos de um não aparecem no outro', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const a = await cadastrarMercado(token, 'Mercado A', 1);
    const b = await cadastrarMercado(token, 'Mercado B', 2);
    expect((await post(`/painel/produtos?mercadoId=${b}`, produto(), token)).statusCode).toBe(201);

    expect((await get(`/painel/produtos?mercadoId=${b}`, token)).json()).toMatchObject({ total: 1 });
    expect((await get(`/painel/produtos?mercadoId=${a}`, token)).json()).toEqual({ itens: [], total: 0 });
    expect((await get('/painel/produtos', token)).json()).toEqual({ itens: [], total: 0 }); // sem escolha: o primeiro (A)
    expect((await get(`/painel/mercado?mercadoId=${b}`, token)).json()).toMatchObject({ id: b, totalProdutos: 1 });
  });

  it('não consegue escolher o mercado de outra pessoa (403) nem um id inválido (400)', async () => {
    const dono = await criarUsuarioMercado('dono@exemplo.com');
    await cadastrarMercado(dono, 'Mercado A', 1);
    const outro = await mercadoCompleto('Mercado B', 'b@exemplo.com', 2);
    const res = await get(`/painel/produtos?mercadoId=${outro.mercadoId}`, dono);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ erro: 'Você não tem acesso a esse mercado' });
    expect((await post(`/painel/produtos?mercadoId=${outro.mercadoId}`, produto(), dono)).statusCode).toBe(403);
    expect((await get('/painel/produtos?mercadoId=abc', dono)).statusCode).toBe(400);
    expect((await get('/painel/produtos?mercadoId=999', dono)).statusCode).toBe(403);
  });

  it('a planilha vai para o mercado escolhido; a aba Mercado dela é ignorada (nome e endereço não mudam)', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const a = await cadastrarMercado(token, 'Mercado A', 1);
    const b = await cadastrarMercado(token, 'Mercado B', 2);
    const { payload, headers } = corpoMultipart('arquivo', readFileSync(PLANILHA_EXEMPLO));
    const res = await app.inject({ method: 'POST', url: `/planilhas?mercadoId=${b}`, payload, headers: { ...headers, ...comToken(token) } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mercadoId: b, mercadoCriado: false, importadas: 20, erros: [] });
    expect(await repo.listarOfertasDoMercado(a)).toHaveLength(0);
    expect(await repo.listarOfertasDoMercado(b)).toHaveLength(20);
    expect((await repo.acharMercado(b))?.nome).toBe('Mercado B'); // a planilha dizia "Mercado Exemplo"
  });

  it('a planilha sem ?mercadoId= vai para o primeiro mercado da conta', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const a = await cadastrarMercado(token, 'Mercado A', 1);
    await cadastrarMercado(token, 'Mercado B', 2);
    const { payload, headers } = corpoMultipart('arquivo', readFileSync(PLANILHA_EXEMPLO));
    const res = await app.inject({ method: 'POST', url: '/planilhas', payload, headers: { ...headers, ...comToken(token) } });
    expect(res.json()).toMatchObject({ mercadoId: a, importadas: 20 });
  });

  it(`cada conta pode ter até ${MAXIMO_DE_MERCADOS_POR_CONTA} mercados`, async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    for (let i = 1; i <= MAXIMO_DE_MERCADOS_POR_CONTA; i++) await cadastrarMercado(token, `Mercado ${i}`, i);
    const res = await post('/painel/meus-mercados', dadosMercado('Mercado a mais', 99), token);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: `Cada conta pode ter até ${MAXIMO_DE_MERCADOS_POR_CONTA} mercados` });
  });

  it('mercado removido some da lista e deixa de poder ser escolhido', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const a = await cadastrarMercado(token, 'Mercado A', 1);
    const b = await cadastrarMercado(token, 'Mercado B', 2);
    await repo.atualizarMercado(a, { status: 'removido' });
    expect(((await get('/painel/meus-mercados', token)).json() as { id: number }[]).map((m) => m.id)).toEqual([b]);
    expect((await get(`/painel/produtos?mercadoId=${a}`, token)).statusCode).toBe(403);
    expect((await get('/painel/produtos', token)).statusCode).toBe(200); // cai no que sobrou
  });
});

describe('PATCH /painel/mercado (editar nome, endereço completo e telefone)', () => {
  it('altera só o telefone e mantém o resto; o endereço em uma linha continua igual', async () => {
    const { token } = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    const res = await patch('/painel/mercado', { telefone: '(11) 3333-4444' }, token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ telefone: '1133334444', nome: 'Mercado A', endereco: 'Rua das Flores 1, 120, Loja 2 - Vila Sônia, São Paulo - SP, CEP 05501-000' });
  });

  it('trocar o CEP e o número remonta o endereço e as chaves de comparação', async () => {
    const { token, mercadoId } = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    const res = await patch('/painel/mercado', { cep: '01001-000', numero: '300' }, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().endereco).toBe('Rua das Flores 1, 300, Loja 2 - Vila Sônia, São Paulo - SP, CEP 01001-000');
    expect(await repo.acharMercado(mercadoId)).toMatchObject({
      enderecoNorm: expect.stringContaining('01001'),
      detalhes: { numero: '300', cep: '01001000' },
    });
  });

  it('valor inválido: 400 com a mesma mensagem do cadastro e nada muda', async () => {
    const { token, mercadoId } = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    const res = await patch('/painel/mercado', { cep: '12' }, token);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'CEP inválido (use 8 números, por exemplo 05501-000)' });
    expect((await repo.acharMercado(mercadoId))?.detalhes?.cep).toBe('05501000');
  });

  it('mercado criado só por planilha (sem endereço por partes) precisa completar tudo de uma vez', async () => {
    const token = await criarUsuarioMercado('dono@exemplo.com');
    const u = await repo.acharUsuarioPorEmail('dono@exemplo.com');
    const m = await repo.criarMercado({ nome: 'Antigo', endereco: 'Rua velha, 1', nomeNorm: 'antigo', enderecoNorm: 'rua velha 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: u!.id });
    expect((await get('/painel/mercado', token)).json()).toMatchObject({ perfilCompleto: false, detalhes: null, telefone: null });
    const parcial = await patch('/painel/mercado', { telefone: '11912345678' }, token);
    expect(parcial.statusCode).toBe(400);
    expect(parcial.json()).toEqual({ erro: 'Informe a rua ou avenida' });
    const completo = await patch('/painel/mercado', dadosMercado('Antigo', 7), token);
    expect(completo.statusCode).toBe(200);
    expect(completo.json()).toMatchObject({ perfilCompleto: true });
    expect((await repo.acharMercado(m.id))?.detalhes?.logradouro).toBe('Rua das Flores 7');
  });
});

describe('cada usuário vê só os mercados dele', () => {
  it('produtos de um mercado não aparecem nem podem ser mexidos pelo outro', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com', 1);
    const b = await mercadoCompleto('Mercado B', 'b@exemplo.com', 2);
    expect((await post('/painel/produtos', produto(), a.token)).statusCode).toBe(201);

    expect((await get('/painel/produtos', a.token)).json()).toMatchObject({ total: 1 });
    expect((await get('/painel/produtos', b.token)).json()).toEqual({ itens: [], total: 0 });

    const editar = await patch(`/painel/produtos/${EAN_LEITE}`, { preco: 1 }, b.token);
    expect(editar.statusCode).toBe(404);
    const remover = await app.inject({ method: 'DELETE', url: `/painel/produtos/${EAN_LEITE}`, headers: comToken(b.token) });
    expect(remover.statusCode).toBe(404);
    expect((await get('/painel/produtos', a.token)).json()).toMatchObject({ total: 1 }); // continua lá
  });

  it('pedir o mercado de outra pessoa com ?mercadoId= é recusado (403)', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com', 1);
    const b = await mercadoCompleto('Mercado B', 'b@exemplo.com', 2);
    await post('/painel/produtos', produto(), a.token);
    expect((await get(`/painel/produtos?mercadoId=${a.mercadoId}`, b.token)).statusCode).toBe(403);
    expect((await get(`/painel/mercado?mercadoId=${a.mercadoId}`, b.token)).statusCode).toBe(403);
    expect((await patch(`/painel/mercado?mercadoId=${a.mercadoId}`, { telefone: '11912345678' }, b.token)).statusCode).toBe(403);
  });

  it('cliente (app) não entra no painel; o administrador (desenvolvedor) vê qualquer mercado', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com', 1);
    const b = await mercadoCompleto('Mercado B', 'b@exemplo.com', 2);
    await post('/painel/produtos', produto(), a.token);
    await post('/painel/produtos', produto({ codigoBarras: EAN_ARROZ, nome: 'Arroz 5 kg', quantidade: '5 kg', preco: 25 }), b.token);

    expect((await get('/painel/produtos', await criarCliente())).statusCode).toBe(403);

    const admin = await criarAdmin();
    expect((await get(`/painel/produtos?mercadoId=${a.mercadoId}`, admin)).json()).toMatchObject({ total: 1, itens: [{ nome: 'Leite Integral 1 L' }] });
    expect((await get(`/painel/produtos?mercadoId=${b.mercadoId}`, admin)).json()).toMatchObject({ total: 1, itens: [{ nome: 'Arroz 5 kg' }] });
    expect((await get('/painel/produtos', admin)).statusCode).toBe(400); // precisa escolher o mercado
  });
});

describe('POST /painel/produtos (produto novo à mão)', () => {
  it('cria o produto, que já aparece no painel, na busca do cliente e no catálogo do app', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    const res = await post('/painel/produtos', produto({ categoria: ' Laticínios ' }), a.token);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      codigoBarras: EAN_LEITE,
      nome: 'Leite Integral 1 L',
      preco: 5.5,
      quantidadeTexto: '1 L',
      categoria: 'Laticínios',
      disponivel: true,
      desatualizado: false,
    });

    const cliente = await criarCliente();
    const busca = (await get('/busca?q=leite', cliente)).json() as { codigoBarras: string; ofertas: { mercadoNome: string; precoPorUnidade: number }[] }[];
    expect(busca).toHaveLength(1);
    expect(busca[0].ofertas[0]).toMatchObject({ mercadoNome: 'Mercado A', precoPorUnidade: 5.5 });
    const catalogo = (await get('/catalogo', cliente)).json() as { ofertas: { codigoBarras: string }[] };
    expect(catalogo.ofertas.map((o) => o.codigoBarras)).toEqual([EAN_LEITE]);
  });

  it('só código de barras, nome e preço são obrigatórios; o resto é opcional', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    const res = await post('/painel/produtos', { codigoBarras: EAN_LEITE, nome: 'Leite', preco: '5,50' }, a.token);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ preco: 5.5, quantidadeTexto: null, categoria: null, disponivel: true });
  });

  it('produto indisponível é guardado, mas não vai para o cliente', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    await post('/painel/produtos', produto({ disponivel: false }), a.token);
    const cliente = await criarCliente();
    expect((await get('/painel/produtos', a.token)).json()).toMatchObject({ total: 1 });
    expect(((await get('/catalogo', cliente)).json() as { ofertas: unknown[] }).ofertas).toHaveLength(0);
  });

  it.each([
    [{ nome: 'Leite', preco: 5 }, 'Código de barras obrigatório'],
    [{ codigoBarras: '123', nome: 'Leite', preco: 5 }, 'O código de barras deve ter 8, 12 ou 13 dígitos'],
    [{ codigoBarras: '7891000100104', nome: 'Leite', preco: 5 }, 'Dígito verificador do código de barras inválido'],
    [{ codigoBarras: EAN_LEITE, nome: '   ', preco: 5 }, 'Nome inválido'],
    [{ codigoBarras: EAN_LEITE, preco: 5 }, 'Nome inválido'],
    [{ codigoBarras: EAN_LEITE, nome: 'Leite' }, 'Preço inválido'],
    [{ codigoBarras: EAN_LEITE, nome: 'Leite', preco: -1 }, 'Preço inválido'],
    [{ codigoBarras: EAN_LEITE, nome: 'Leite', preco: 'abc' }, 'Preço inválido'],
    [{ codigoBarras: EAN_LEITE, nome: 'Leite', preco: 5, quantidade: 5 }, 'Quantidade inválida'],
    [{ codigoBarras: EAN_LEITE, nome: 'Leite', preco: 5, disponivel: 'sim' }, 'Disponível inválido'],
    [{ codigoBarras: EAN_LEITE, nome: 'Leite', preco: 5, mercadoId: 2 }, 'Campo não permitido: mercadoId'],
  ])('recusa %j', async (corpo, mensagem) => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    const res = await post('/painel/produtos', corpo, a.token);
    expect(res.statusCode).toBe(400);
    expect((res.json() as { erro: string }).erro).toContain(mensagem);
    expect(await repo.listarOfertasDoMercado(a.mercadoId)).toHaveLength(0);
  });

  it('código que já existe no mesmo mercado: 409 e o produto antigo continua igual', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    await post('/painel/produtos', produto(), a.token);
    const res = await post('/painel/produtos', produto({ nome: 'Outro nome', preco: 9 }), a.token);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'Já existe um produto com esse código de barras neste mercado' });
    expect((await repo.acharOferta(a.mercadoId, EAN_LEITE))?.nome).toBe('Leite Integral 1 L');
  });

  it('o mesmo código em outro mercado é permitido (é assim que a comparação funciona)', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com', 1);
    const b = await mercadoCompleto('Mercado B', 'b@exemplo.com', 2);
    expect((await post('/painel/produtos', produto(), a.token)).statusCode).toBe(201);
    expect((await post('/painel/produtos', produto({ preco: 4.9 }), b.token)).statusCode).toBe(201);
  });

  it('exige login de mercado ou administrador, e o mercado precisa estar cadastrado', async () => {
    expect((await post('/painel/produtos', produto())).statusCode).toBe(401);
    expect((await post('/painel/produtos', produto(), await criarCliente())).statusCode).toBe(403);
    const semMercado = await criarUsuarioMercado('novo@exemplo.com');
    const res = await post('/painel/produtos', produto(), semMercado);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ erro: 'Sua conta não está ligada a um mercado ativo' });
  });

  it('o administrador cria produto no mercado que escolher (mercadoId)', async () => {
    const a = await mercadoCompleto('Mercado A', 'a@exemplo.com');
    const admin = await criarAdmin();
    expect((await post('/painel/produtos', produto(), admin)).statusCode).toBe(400);
    expect((await post(`/painel/produtos?mercadoId=${a.mercadoId}`, produto(), admin)).statusCode).toBe(201);
    expect(await repo.acharOferta(a.mercadoId, EAN_LEITE)).not.toBeNull();
  });
});
