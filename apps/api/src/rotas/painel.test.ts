import { normalizarTexto, type ProdutoPainel } from '@mercado/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { importarPlanilha } from '../planilha/importar';
import type { Mercado, OfertaArmazenada } from '../repositorio';
import { type Ambiente, comToken, criarAmbiente, lerPlanilha } from './apoioTeste';

let amb: Ambiente;

beforeEach(async () => {
  amb = await criarAmbiente();
});

const DIA = 86_400_000;

async function criarMercadoComLogin(
  nome: string,
  endereco: string,
  email: string,
): Promise<{ mercado: Mercado; token: string }> {
  const { id, token } = await amb.criarComPapel('mercado', email);
  const mercado = await amb.repo.criarMercado({
    nome,
    endereco,
    nomeNorm: normalizarTexto(nome),
    enderecoNorm: normalizarTexto(endereco),
    status: 'ativo',
    contaSituacao: 'gratuita',
    usuarioId: id,
  });
  return { mercado, token };
}

function oferta(mercadoId: number, codigoBarras: string, extra: Partial<OfertaArmazenada> = {}): OfertaArmazenada {
  const nome = extra.nome ?? `Produto ${codigoBarras}`;
  return {
    mercadoId,
    codigoBarras,
    nome,
    nomeNorm: normalizarTexto(nome),
    preco: 10,
    quantidadeTexto: '1 kg',
    quantidadeValor: 1,
    quantidadeUnidade: 'kg',
    categoria: 'Mercearia',
    disponivel: true,
    precoAtualizadoEm: new Date(),
    promocaoPreco: null,
    promocaoInicio: null,
    promocaoFim: null,
    ...extra,
  };
}

const get = (token: string, url: string) => amb.app.inject({ method: 'GET', url, headers: comToken(token) });
const patch = (token: string, url: string, payload: unknown) =>
  amb.app.inject({ method: 'PATCH', url, headers: comToken(token), payload: payload as object });
const del = (token: string, url: string) => amb.app.inject({ method: 'DELETE', url, headers: comToken(token) });

describe('/painel/*: acesso', () => {
  const rotas: [string, string][] = [
    ['GET', '/painel/mercado'],
    ['PATCH', '/painel/mercado'],
    ['GET', '/painel/produtos'],
    ['PATCH', '/painel/produtos/123'],
    ['DELETE', '/painel/produtos/123'],
    ['GET', '/painel/cobranca'],
  ];
  const chamar = (method: string, url: string, token: string | null) =>
    amb.app.inject({
      method: method as 'GET',
      url,
      headers: token ? comToken(token) : {},
      payload: method === 'PATCH' ? { nome: 'x' } : undefined,
    });

  it.each(rotas)('%s %s sem token → 401', async (method, url) => {
    expect((await chamar(method, url, null)).statusCode).toBe(401);
  });

  it.each(rotas)('%s %s com papel admin → 403', async (method, url) => {
    const { token } = await amb.criarComPapel('admin');
    expect((await chamar(method, url, token)).statusCode).toBe(403);
  });

  it.each(rotas)('%s %s com papel cliente → 403', async (method, url) => {
    const { token } = await amb.criarComPapel('cliente');
    expect((await chamar(method, url, token)).statusCode).toBe(403);
  });

  it.each(rotas)('%s %s de usuário mercado sem mercado → 403 com mensagem (R19)', async (method, url) => {
    const { token } = await amb.criarComPapel('mercado');
    const res = await chamar(method, url, token);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ erro: 'Sua conta não está ligada a um mercado ativo' });
  });

  it.each(rotas)('%s %s de mercado removido → 403 com mensagem (R19)', async (method, url) => {
    const { mercado, token } = await criarMercadoComLogin('Mercado X', 'Rua X, 1', 'x@exemplo.com');
    await amb.repo.atualizarMercado(mercado.id, { status: 'removido' });
    const res = await chamar(method, url, token);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ erro: 'Sua conta não está ligada a um mercado ativo' });
  });
});

describe('GET /painel/mercado', () => {
  it('devolve os dados e as contagens (7 dias exatos não conta, 8 conta; indisponível entra no total)', async () => {
    const { mercado, token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    const agora = Date.now();
    await amb.repo.salvarOferta(oferta(mercado.id, '1000000000001'));
    await amb.repo.salvarOferta(oferta(mercado.id, '1000000000002', { precoAtualizadoEm: new Date(agora - 7 * DIA) }));
    await amb.repo.salvarOferta(oferta(mercado.id, '1000000000003', { precoAtualizadoEm: new Date(agora - 8 * DIA) }));
    await amb.repo.salvarOferta(
      oferta(mercado.id, '1000000000004', { precoAtualizadoEm: new Date(agora - 30 * DIA), disponivel: false }),
    );

    const res = await get(token, '/painel/mercado');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: mercado.id,
      nome: 'Mercado Um',
      endereco: 'Rua Um, 10',
      totalProdutos: 4,
      produtosDesatualizados: 2,
    });
  });

  it('com planilha real (mercado-2): 29 produtos, nenhum desatualizado', async () => {
    await importarPlanilha(amb.repo, lerPlanilha('mercado-2-estrela-da-vila.xlsx'), { papel: 'admin' });
    const [mercado] = await amb.repo.listarMercados();
    const dono = await amb.criarComPapel('mercado', 'dono@exemplo.com');
    await amb.repo.atualizarMercado(mercado!.id, { usuarioId: dono.id });

    const res = await get(dono.token, '/painel/mercado');
    expect(res.json()).toMatchObject({ id: mercado!.id, totalProdutos: 29, produtosDesatualizados: 0 });
  });
});

describe('PATCH /painel/mercado', () => {
  it('altera nome e endereço, atualiza as chaves normalizadas e devolve o mesmo formato do GET', async () => {
    const { mercado, token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    await amb.repo.salvarOferta(oferta(mercado.id, '1000000000001'));

    const res = await patch(token, '/painel/mercado', { nome: '  Empório Ação  ', endereco: ' Av. Nova, 99 ' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: mercado.id,
      nome: 'Empório Ação',
      endereco: 'Av. Nova, 99',
      totalProdutos: 1,
      produtosDesatualizados: 0,
    });
    expect(await amb.repo.acharMercado(mercado.id)).toMatchObject({
      nomeNorm: normalizarTexto('Empório Ação'),
      enderecoNorm: normalizarTexto('Av. Nova, 99'),
    });
    expect(
      await amb.repo.acharMercadoPorChave(normalizarTexto('Empório Ação'), normalizarTexto('Av. Nova, 99')),
    ).not.toBeNull();
  });

  it('alterar só o nome mantém o endereço', async () => {
    const { mercado, token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    const res = await patch(token, '/painel/mercado', { nome: 'Outro Nome' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ nome: 'Outro Nome', endereco: 'Rua Um, 10' });
    expect(await amb.repo.acharMercado(mercado.id)).toMatchObject({
      nomeNorm: 'outro nome',
      enderecoNorm: normalizarTexto('Rua Um, 10'),
    });
  });

  it('colisão com outro mercado → 409 e nada muda', async () => {
    const a = await criarMercadoComLogin('Mercado A', 'Rua A, 1', 'a@exemplo.com');
    await criarMercadoComLogin('Mercado B', 'Rua B, 2', 'b@exemplo.com');
    const res = await patch(a.token, '/painel/mercado', { nome: 'MERCADO b', endereco: 'rua b, 2' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'Já existe um mercado com esse nome e endereço' });
    expect(await amb.repo.acharMercado(a.mercado.id)).toMatchObject({ nome: 'Mercado A', endereco: 'Rua A, 1' });
  });

  it('corpo vazio → 400 "Nada para alterar"', async () => {
    const { token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    const res = await patch(token, '/painel/mercado', {});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Nada para alterar' });
  });

  it.each([
    ['chave desconhecida', { id: 3 }],
    ['nome em branco', { nome: '   ' }],
    ['endereço vazio', { endereco: '' }],
    ['nome que não é texto', { nome: 5 }],
  ])('%s → 400', async (_rotulo, corpo) => {
    const { mercado, token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    const res = await patch(token, '/painel/mercado', corpo);
    expect(res.statusCode).toBe(400);
    expect(typeof res.json().erro).toBe('string');
    expect(await amb.repo.acharMercado(mercado.id)).toMatchObject({ nome: 'Mercado Um', endereco: 'Rua Um, 10' });
  });
});

describe('GET /painel/produtos', () => {
  it('lista ordenada por nome normalizado e depois código, com o formato ProdutoPainel', async () => {
    const { mercado, token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    const quando = new Date('2026-10-01T10:00:00.000Z');
    await amb.repo.salvarOferta(oferta(mercado.id, '2000000000002', { nome: 'Banana', precoAtualizadoEm: quando }));
    await amb.repo.salvarOferta(oferta(mercado.id, '2000000000003', { nome: 'Arroz', precoAtualizadoEm: quando }));
    await amb.repo.salvarOferta(oferta(mercado.id, '2000000000001', { nome: 'Arroz', precoAtualizadoEm: quando }));
    await amb.repo.salvarOferta(
      oferta(mercado.id, '2000000000004', {
        nome: 'Água',
        preco: 3.5,
        quantidadeTexto: null,
        quantidadeValor: null,
        quantidadeUnidade: null,
        categoria: null,
        disponivel: false,
        precoAtualizadoEm: quando,
      }),
    );

    const res = await get(token, '/painel/produtos');
    expect(res.statusCode).toBe(200);
    const corpo = res.json() as { itens: ProdutoPainel[]; total: number };
    expect(corpo.total).toBe(4);
    expect(corpo.itens.map((i) => i.codigoBarras)).toEqual([
      '2000000000004',
      '2000000000001',
      '2000000000003',
      '2000000000002',
    ]);
    expect(corpo.itens[0]).toEqual({
      codigoBarras: '2000000000004',
      nome: 'Água',
      preco: 3.5,
      quantidadeTexto: null,
      categoria: null,
      disponivel: false,
      atualizadoEm: '2026-10-01T10:00:00.000Z',
      desatualizado: true,
    });
  });

  it('50 por página: 51 produtos → página 2 tem o restante; sem pagina é a página 1', async () => {
    const { mercado, token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    for (let i = 1; i <= 51; i++) {
      const codigo = String(3000000000000 + i);
      await amb.repo.salvarOferta(oferta(mercado.id, codigo, { nome: `Item ${String(i).padStart(3, '0')}` }));
    }
    const p1 = (await get(token, '/painel/produtos')).json() as { itens: ProdutoPainel[]; total: number };
    expect(p1.total).toBe(51);
    expect(p1.itens).toHaveLength(50);
    expect(p1.itens[0]!.nome).toBe('Item 001');

    const p1b = (await get(token, '/painel/produtos?pagina=1')).json() as { itens: ProdutoPainel[] };
    expect(p1b.itens).toEqual(p1.itens);

    const p2 = (await get(token, '/painel/produtos?pagina=2')).json() as { itens: ProdutoPainel[]; total: number };
    expect(p2.total).toBe(51);
    expect(p2.itens.map((i) => i.nome)).toEqual(['Item 051']);

    const p3 = (await get(token, '/painel/produtos?pagina=3')).json() as { itens: ProdutoPainel[]; total: number };
    expect(p3).toEqual({ itens: [], total: 51 });
  });

  it.each(['0', 'x', '-1', '1.5', '', '1e2'])('pagina=%s → 400 "Página inválida"', async (p) => {
    const { token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    const res = await get(token, `/painel/produtos?pagina=${p}`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Página inválida' });
  });

  it('não mostra produtos de outro mercado', async () => {
    const a = await criarMercadoComLogin('Mercado A', 'Rua A, 1', 'a@exemplo.com');
    const b = await criarMercadoComLogin('Mercado B', 'Rua B, 2', 'b@exemplo.com');
    await amb.repo.salvarOferta(oferta(a.mercado.id, '4000000000001'));
    await amb.repo.salvarOferta(oferta(b.mercado.id, '4000000000002'));
    const res = (await get(a.token, '/painel/produtos')).json() as { itens: ProdutoPainel[]; total: number };
    expect(res.total).toBe(1);
    expect(res.itens.map((i) => i.codigoBarras)).toEqual(['4000000000001']);
  });
});

describe('PATCH /painel/produtos/:codigo', () => {
  const CODIGO = '5000000000001';
  const url = `/painel/produtos/${CODIGO}`;
  const antigo = new Date('2026-10-20T08:00:00.000Z');
  let token: string;
  let mercadoId: number;

  beforeEach(async () => {
    const m = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    token = m.token;
    mercadoId = m.mercado.id;
    await amb.repo.salvarOferta(oferta(mercadoId, CODIGO, { nome: 'Arroz 5kg', preco: 25.9, precoAtualizadoEm: antigo }));
  });

  it('preço novo atualiza precoAtualizadoEm e o GET mostra o novo valor', async () => {
    const antes = Date.now();
    const res = await patch(token, url, { preco: '27,50' });
    expect(res.statusCode).toBe(200);
    const corpo = res.json() as ProdutoPainel;
    expect(corpo).toMatchObject({ codigoBarras: CODIGO, preco: 27.5, desatualizado: false });
    expect(new Date(corpo.atualizadoEm).getTime()).toBeGreaterThanOrEqual(antes);

    const lista = (await get(token, '/painel/produtos')).json() as { itens: ProdutoPainel[] };
    expect(lista.itens[0]).toEqual(corpo);
    const gravada = await amb.repo.acharOferta(mercadoId, CODIGO);
    expect(gravada!.precoAtualizadoEm.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('preço numérico também é aceito', async () => {
    const res = await patch(token, url, { preco: 19.99 });
    expect(res.statusCode).toBe(200);
    expect(res.json().preco).toBe(19.99);
  });

  it('alterar só nome, quantidade, categoria ou disponibilidade NÃO muda precoAtualizadoEm (R20)', async () => {
    const res = await patch(token, url, { nome: '  Arroz Tipo 1  ' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ nome: 'Arroz Tipo 1', atualizadoEm: antigo.toISOString(), desatualizado: true });

    expect((await patch(token, url, { quantidade: '2 kg' })).statusCode).toBe(200);
    expect((await patch(token, url, { categoria: 'Grãos' })).statusCode).toBe(200);
    expect((await patch(token, url, { disponivel: false })).statusCode).toBe(200);
    const gravada = await amb.repo.acharOferta(mercadoId, CODIGO);
    expect(gravada!.precoAtualizadoEm).toEqual(antigo);
    expect(gravada).toMatchObject({
      nome: 'Arroz Tipo 1',
      nomeNorm: normalizarTexto('Arroz Tipo 1'),
      preco: 25.9,
      quantidadeTexto: '2 kg',
      categoria: 'Grãos',
      disponivel: false,
    });
  });

  it('preserva o que não foi enviado (promoção, por exemplo)', async () => {
    const inicio = new Date('2026-10-01T00:00:00.000Z');
    const fim = new Date('2026-12-01T00:00:00.000Z');
    await amb.repo.salvarOferta(
      oferta(mercadoId, CODIGO, { promocaoPreco: 19.9, promocaoInicio: inicio, promocaoFim: fim, precoAtualizadoEm: antigo }),
    );
    expect((await patch(token, url, { categoria: 'Grãos' })).statusCode).toBe(200);
    expect(await amb.repo.acharOferta(mercadoId, CODIGO)).toMatchObject({
      promocaoPreco: 19.9,
      promocaoInicio: inicio,
      promocaoFim: fim,
      categoria: 'Grãos',
    });
  });

  it('quantidade é reinterpretada por parseQuantidade ("500 g" → 0,5 kg)', async () => {
    const res = await patch(token, url, { quantidade: ' 500 g ' });
    expect(res.statusCode).toBe(200);
    expect(res.json().quantidadeTexto).toBe('500 g');
    expect(await amb.repo.acharOferta(mercadoId, CODIGO)).toMatchObject({
      quantidadeTexto: '500 g',
      quantidadeValor: 0.5,
      quantidadeUnidade: 'kg',
    });
  });

  it('quantidade não entendida mantém o texto e zera valor e unidade', async () => {
    const res = await patch(token, url, { quantidade: 'abc' });
    expect(res.statusCode).toBe(200);
    expect(res.json().quantidadeTexto).toBe('abc');
    expect(await amb.repo.acharOferta(mercadoId, CODIGO)).toMatchObject({
      quantidadeTexto: 'abc',
      quantidadeValor: null,
      quantidadeUnidade: null,
    });
  });

  it.each([null, '', '   '])('quantidade %j limpa texto, valor e unidade', async (q) => {
    const res = await patch(token, url, { quantidade: q });
    expect(res.statusCode).toBe(200);
    expect(res.json().quantidadeTexto).toBeNull();
    expect(await amb.repo.acharOferta(mercadoId, CODIGO)).toMatchObject({
      quantidadeTexto: null,
      quantidadeValor: null,
      quantidadeUnidade: null,
    });
  });

  it.each([null, '', '  '])('categoria %j vira null', async (c) => {
    const res = await patch(token, url, { categoria: c });
    expect(res.statusCode).toBe(200);
    expect(res.json().categoria).toBeNull();
  });

  it('código de barras não é editável → 400 com a mensagem exata', async () => {
    const res = await patch(token, url, { codigoBarras: '7891234567895', nome: 'Outro' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'O código de barras não pode ser alterado' });
    expect(await amb.repo.acharOferta(mercadoId, CODIGO)).toMatchObject({ nome: 'Arroz 5kg' });
    expect(await amb.repo.acharOferta(mercadoId, '7891234567895')).toBeNull();
  });

  it('chave desconhecida → 400 nomeando a chave', async () => {
    const res = await patch(token, url, { promocaoPreco: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Campo não pode ser alterado: promocaoPreco' });
  });

  it.each([0, 'abc', -1, '-1', '0', '', null, true, {}])('preço inválido %j → 400 "Preço inválido"', async (preco) => {
    const res = await patch(token, url, { preco });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Preço inválido' });
    expect(await amb.repo.acharOferta(mercadoId, CODIGO)).toMatchObject({ preco: 25.9, precoAtualizadoEm: antigo });
  });

  it.each([[{ nome: '   ' }], [{ nome: 3 }], [{ quantidade: 3 }], [{ categoria: 3 }], [{ disponivel: 'sim' }]])(
    'valor de tipo errado %j → 400',
    async (corpo) => {
      const res = await patch(token, url, corpo);
      expect(res.statusCode).toBe(400);
      expect(typeof res.json().erro).toBe('string');
    },
  );

  it('corpo vazio → 400 "Nada para alterar"', async () => {
    const res = await patch(token, url, {});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Nada para alterar' });
  });

  it('código inexistente → 404', async () => {
    const res = await patch(token, '/painel/produtos/9999999999999', { nome: 'x' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ erro: 'Produto não encontrado' });
  });
});

describe('DELETE /painel/produtos/:codigo', () => {
  it('remove o produto → 204 e ele some da lista', async () => {
    const { mercado, token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    await amb.repo.salvarOferta(oferta(mercado.id, '6000000000001'));
    const res = await del(token, '/painel/produtos/6000000000001');
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(await amb.repo.acharOferta(mercado.id, '6000000000001')).toBeNull();
    expect((await get(token, '/painel/produtos')).json()).toEqual({ itens: [], total: 0 });
  });

  it('código inexistente → 404', async () => {
    const { token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    const res = await del(token, '/painel/produtos/6000000000099');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ erro: 'Produto não encontrado' });
  });
});

describe('isolamento entre mercados', () => {
  it('o mercado A não enxerga, edita nem apaga produto do mercado B (404)', async () => {
    const a = await criarMercadoComLogin('Mercado A', 'Rua A, 1', 'a@exemplo.com');
    const b = await criarMercadoComLogin('Mercado B', 'Rua B, 2', 'b@exemplo.com');
    const antigo = new Date('2026-10-20T08:00:00.000Z');
    await amb.repo.salvarOferta(oferta(b.mercado.id, '7000000000001', { nome: 'Do B', precoAtualizadoEm: antigo }));

    const url = '/painel/produtos/7000000000001';
    const resPatch = await patch(a.token, url, { preco: 1, nome: 'Invadido', disponivel: false });
    expect(resPatch.statusCode).toBe(404);
    expect(resPatch.json()).toEqual({ erro: 'Produto não encontrado' });
    expect((await del(a.token, url)).statusCode).toBe(404);

    expect(await amb.repo.acharOferta(b.mercado.id, '7000000000001')).toMatchObject({
      nome: 'Do B',
      preco: 10,
      disponivel: true,
      precoAtualizadoEm: antigo,
    });
    expect(await amb.repo.acharOferta(a.mercado.id, '7000000000001')).toBeNull();
    // O próprio B continua podendo editar.
    expect((await patch(b.token, url, { nome: 'Do B v2' })).statusCode).toBe(200);
  });

  it('o mesmo código em dois mercados é editado só no mercado de quem pede', async () => {
    const a = await criarMercadoComLogin('Mercado A', 'Rua A, 1', 'a@exemplo.com');
    const b = await criarMercadoComLogin('Mercado B', 'Rua B, 2', 'b@exemplo.com');
    await amb.repo.salvarOferta(oferta(a.mercado.id, '7000000000002', { preco: 5 }));
    await amb.repo.salvarOferta(oferta(b.mercado.id, '7000000000002', { preco: 6 }));
    expect((await patch(a.token, '/painel/produtos/7000000000002', { preco: 9 })).statusCode).toBe(200);
    expect((await amb.repo.acharOferta(a.mercado.id, '7000000000002'))!.preco).toBe(9);
    expect((await amb.repo.acharOferta(b.mercado.id, '7000000000002'))!.preco).toBe(6);
    expect((await del(a.token, '/painel/produtos/7000000000002')).statusCode).toBe(204);
    expect(await amb.repo.acharOferta(b.mercado.id, '7000000000002')).not.toBeNull();
  });
});

describe('edição manual e nova planilha', () => {
  it('produto editado e depois coberto por nova planilha volta ao valor da planilha', async () => {
    await importarPlanilha(amb.repo, lerPlanilha('mercado-2-estrela-da-vila.xlsx'), { papel: 'admin' });
    const [mercado] = await amb.repo.listarMercados();
    const dono = await amb.criarComPapel('mercado', 'dono@exemplo.com');
    await amb.repo.atualizarMercado(mercado!.id, { usuarioId: dono.id });

    const antes = (await get(dono.token, '/painel/produtos')).json() as { itens: ProdutoPainel[] };
    const original = antes.itens[0]!;
    const res = await patch(dono.token, `/painel/produtos/${original.codigoBarras}`, {
      preco: 999.99,
      nome: 'Nome editado à mão',
      disponivel: !original.disponivel,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ preco: 999.99, nome: 'Nome editado à mão', disponivel: !original.disponivel });

    const relatorio = await importarPlanilha(amb.repo, lerPlanilha('mercado-2-estrela-da-vila.xlsx'), {
      papel: 'mercado',
      mercadoId: mercado!.id,
    });
    expect(relatorio.importadas).toBe(29);

    const depois = (await get(dono.token, '/painel/produtos')).json() as { itens: ProdutoPainel[]; total: number };
    expect(depois.total).toBe(29);
    const volta = depois.itens.find((i) => i.codigoBarras === original.codigoBarras)!;
    expect(volta).toMatchObject({
      nome: original.nome,
      preco: original.preco,
      disponivel: original.disponivel,
      desatualizado: false,
    });
  });
});

describe('GET /painel/cobranca', () => {
  it.each([
    ['gratuita', 'Gratuito por enquanto'],
    ['ativa', 'Conta ativa'],
    ['em_atraso', 'Pagamento em atraso'],
  ] as const)('situação %s → "%s"', async (situacao, mensagem) => {
    const { mercado, token } = await criarMercadoComLogin('Mercado Um', 'Rua Um, 10', 'um@exemplo.com');
    await amb.repo.atualizarMercado(mercado.id, { contaSituacao: situacao });
    const res = await get(token, '/painel/cobranca');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ situacao, mensagem });
  });
});
