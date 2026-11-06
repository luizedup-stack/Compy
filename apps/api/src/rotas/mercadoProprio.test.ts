import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../app';
import { criarEmailMemoria } from '../email';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { comToken } from './apoioTeste';

// Cada mercado se cadastra sozinho (software "Bolso Certo - Mercado") e só vê e edita o que é seu;
// o administrador (a conta do desenvolvedor) enxerga todos.
const SENHA = 'senha-boa-123';
const EAN_LEITE = '7891000100103';
const EAN_ARROZ = '7891234567895';

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

async function cadastrarMercado(nome: string, email: string, endereco = `Rua das Flores, 100 - ${nome}`) {
  const res = await post('/auth/cadastro-mercado', { nome, endereco, email, senha: SENHA });
  expect(res.statusCode).toBe(201);
  const login = await post('/auth/login', { email, senha: SENHA });
  return { mercadoId: (res.json() as { mercadoId: number }).mercadoId, token: (login.json() as { token: string }).token };
}

async function criarAdmin() {
  const u = await repo.criarUsuario({ email: 'dev@exemplo.com', senhaHash: 'x', papel: 'admin', emailVerificado: true });
  return app.jwt.sign({ id: u.id, papel: u.papel, inst: app.instancia });
}

const produto = (extra: Record<string, unknown> = {}) => ({ codigoBarras: EAN_LEITE, nome: 'Leite Integral 1 L', preco: 5.5, quantidade: '1 L', ...extra });

describe('POST /auth/cadastro-mercado', () => {
  it('cria a conta e o mercado já ligados, e manda o código de confirmação por e-mail', async () => {
    const res = await post('/auth/cadastro-mercado', {
      nome: 'Mercado Bom Preço',
      endereco: 'Rua dos Ipês, 120 - Vila Sônia',
      email: 'Dono@Exemplo.com',
      senha: SENHA,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: 'dono@exemplo.com', papel: 'mercado', mercadoId: expect.any(Number) });
    expect(res.json()).not.toHaveProperty('senha');
    expect(emails.enviados).toHaveLength(1);
    expect(emails.enviados[0].para).toBe('dono@exemplo.com');

    const { token } = (await (await post('/auth/login', { email: 'dono@exemplo.com', senha: SENHA })).json()) as { token: string };
    const meu = await get('/painel/mercado', token);
    expect(meu.statusCode).toBe(200);
    expect(meu.json()).toMatchObject({ nome: 'Mercado Bom Preço', endereco: 'Rua dos Ipês, 120 - Vila Sônia', totalProdutos: 0 });
  });

  it.each([
    [{ nome: '', endereco: 'Rua dos Ipês, 120', email: 'a@b.com', senha: SENHA }, 'Informe o nome do mercado'],
    [{ nome: 'Mercado', endereco: 'Rua', email: 'a@b.com', senha: SENHA }, 'Informe o endereço do mercado'],
    [{ nome: 'Mercado', endereco: 'Rua dos Ipês, 120', email: 'nao-e-email', senha: SENHA }, 'E-mail inválido'],
    [{ nome: 'Mercado', endereco: 'Rua dos Ipês, 120', email: 'a@b.com', senha: 'curta' }, 'A senha deve ter pelo menos 8 caracteres'],
    [{ endereco: 'Rua dos Ipês, 120', email: 'a@b.com', senha: SENHA }, 'Informe o nome do mercado'],
  ])('recusa dados inválidos %#', async (corpo, mensagem) => {
    const res = await post('/auth/cadastro-mercado', corpo);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: mensagem });
    expect(await repo.listarMercados()).toHaveLength(0);
  });

  it('e-mail já cadastrado: 409 e nenhum mercado órfão', async () => {
    await post('/auth/cadastro', { email: 'ana@exemplo.com', senha: SENHA });
    const res = await post('/auth/cadastro-mercado', { nome: 'Mercado A', endereco: 'Rua A, 100', email: 'ana@exemplo.com', senha: SENHA });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'E-mail já cadastrado' });
    expect(await repo.listarMercados()).toHaveLength(0);
  });

  it('mesmo nome e endereço de outro mercado: 409, e a conta não fica criada (o e-mail continua livre)', async () => {
    await cadastrarMercado('Mercado A', 'a@exemplo.com', 'Rua A, 100');
    const res = await post('/auth/cadastro-mercado', { nome: 'MERCADO a', endereco: 'rua a, 100', email: 'b@exemplo.com', senha: SENHA });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'Já existe um mercado com esse nome e endereço' });
    expect(await repo.acharUsuarioPorEmail('b@exemplo.com')).toBeNull();
    const ok = await post('/auth/cadastro-mercado', { nome: 'Mercado B', endereco: 'Rua B, 200', email: 'b@exemplo.com', senha: SENHA });
    expect(ok.statusCode).toBe(201);
  });

  it('o código recebido por e-mail confirma a conta', async () => {
    await cadastrarMercado('Mercado A', 'a@exemplo.com');
    const codigo = emails.enviados[0].texto.split('\n').find((l) => /^[0-9a-f]{64}$/.test(l))!;
    expect((await post('/auth/verificar-email', { token: codigo })).statusCode).toBe(204);
    expect((await repo.acharUsuarioPorEmail('a@exemplo.com'))?.emailVerificado).toBe(true);
  });
});

describe('cada mercado vê só o seu', () => {
  it('produtos de um mercado não aparecem nem podem ser mexidos pelo outro', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    const b = await cadastrarMercado('Mercado B', 'b@exemplo.com');
    expect((await post('/painel/produtos', produto(), a.token)).statusCode).toBe(201);

    expect((await get('/painel/produtos', a.token)).json()).toMatchObject({ total: 1 });
    expect((await get('/painel/produtos', b.token)).json()).toEqual({ itens: [], total: 0 });

    const editar = await app.inject({ method: 'PATCH', url: `/painel/produtos/${EAN_LEITE}`, payload: { preco: 1 }, headers: comToken(b.token) });
    expect(editar.statusCode).toBe(404);
    const remover = await app.inject({ method: 'DELETE', url: `/painel/produtos/${EAN_LEITE}`, headers: comToken(b.token) });
    expect(remover.statusCode).toBe(404);
    expect((await get('/painel/produtos', a.token)).json()).toMatchObject({ total: 1 }); // continua lá
  });

  it('o mercado não consegue olhar outro mercado passando mercadoId', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    const b = await cadastrarMercado('Mercado B', 'b@exemplo.com');
    await post('/painel/produtos', produto(), a.token);
    const res = await get(`/painel/produtos?mercadoId=${a.mercadoId}`, b.token);
    expect(res.json()).toEqual({ itens: [], total: 0 }); // vê o dele, não o de A
    const meu = await get(`/painel/mercado?mercadoId=${a.mercadoId}`, b.token);
    expect(meu.json()).toMatchObject({ nome: 'Mercado B' });
  });

  it('cliente (app) não entra no painel; o administrador (desenvolvedor) vê qualquer mercado', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    const b = await cadastrarMercado('Mercado B', 'b@exemplo.com');
    await post('/painel/produtos', produto(), a.token);
    await post('/painel/produtos', produto({ codigoBarras: EAN_ARROZ, nome: 'Arroz 5 kg', quantidade: '5 kg', preco: 25 }), b.token);

    await post('/auth/cadastro', { email: 'cli@exemplo.com', senha: SENHA });
    const cliente = ((await (await post('/auth/login', { email: 'cli@exemplo.com', senha: SENHA })).json()) as { token: string }).token;
    expect((await get('/painel/produtos', cliente)).statusCode).toBe(403);

    const admin = await criarAdmin();
    expect((await get(`/painel/produtos?mercadoId=${a.mercadoId}`, admin)).json()).toMatchObject({ total: 1, itens: [{ nome: 'Leite Integral 1 L' }] });
    expect((await get(`/painel/produtos?mercadoId=${b.mercadoId}`, admin)).json()).toMatchObject({ total: 1, itens: [{ nome: 'Arroz 5 kg' }] });
    expect((await get('/painel/produtos', admin)).statusCode).toBe(400); // precisa escolher o mercado
  });
});

describe('POST /painel/produtos (produto novo à mão)', () => {
  it('cria o produto, que já aparece no painel, na busca do cliente e no catálogo do app', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
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

    await post('/auth/cadastro', { email: 'cli@exemplo.com', senha: SENHA });
    const cliente = ((await (await post('/auth/login', { email: 'cli@exemplo.com', senha: SENHA })).json()) as { token: string }).token;
    const busca = (await get('/busca?q=leite', cliente)).json() as { codigoBarras: string; ofertas: { mercadoNome: string; precoPorUnidade: number }[] }[];
    expect(busca).toHaveLength(1);
    expect(busca[0].ofertas[0]).toMatchObject({ mercadoNome: 'Mercado A', precoPorUnidade: 5.5 });
    const catalogo = (await get('/catalogo', cliente)).json() as { ofertas: { codigoBarras: string }[] };
    expect(catalogo.ofertas.map((o) => o.codigoBarras)).toEqual([EAN_LEITE]);
  });

  it('só código de barras, nome e preço são obrigatórios; o resto é opcional', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    const res = await post('/painel/produtos', { codigoBarras: EAN_LEITE, nome: 'Leite', preco: '5,50' }, a.token);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ preco: 5.5, quantidadeTexto: null, categoria: null, disponivel: true });
  });

  it('produto indisponível é guardado, mas não vai para o cliente', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    await post('/painel/produtos', produto({ disponivel: false }), a.token);
    await post('/auth/cadastro', { email: 'cli@exemplo.com', senha: SENHA });
    const cliente = ((await (await post('/auth/login', { email: 'cli@exemplo.com', senha: SENHA })).json()) as { token: string }).token;
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
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    const res = await post('/painel/produtos', corpo, a.token);
    expect(res.statusCode).toBe(400);
    expect((res.json() as { erro: string }).erro).toContain(mensagem);
    expect(await repo.listarOfertasDoMercado(a.mercadoId)).toHaveLength(0);
  });

  it('código que já existe no mesmo mercado: 409 e o produto antigo continua igual', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    await post('/painel/produtos', produto(), a.token);
    const res = await post('/painel/produtos', produto({ nome: 'Outro nome', preco: 9 }), a.token);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'Já existe um produto com esse código de barras neste mercado' });
    expect((await repo.acharOferta(a.mercadoId, EAN_LEITE))?.nome).toBe('Leite Integral 1 L');
  });

  it('o mesmo código em outro mercado é permitido (é assim que a comparação funciona)', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    const b = await cadastrarMercado('Mercado B', 'b@exemplo.com');
    expect((await post('/painel/produtos', produto(), a.token)).statusCode).toBe(201);
    expect((await post('/painel/produtos', produto({ preco: 4.9 }), b.token)).statusCode).toBe(201);
  });

  it('exige login de mercado ou administrador', async () => {
    expect((await post('/painel/produtos', produto())).statusCode).toBe(401);
    await post('/auth/cadastro', { email: 'cli@exemplo.com', senha: SENHA });
    const cliente = ((await (await post('/auth/login', { email: 'cli@exemplo.com', senha: SENHA })).json()) as { token: string }).token;
    expect((await post('/painel/produtos', produto(), cliente)).statusCode).toBe(403);
  });

  it('o administrador cria produto no mercado que escolher (mercadoId)', async () => {
    const a = await cadastrarMercado('Mercado A', 'a@exemplo.com');
    const admin = await criarAdmin();
    expect((await post('/painel/produtos', produto(), admin)).statusCode).toBe(400);
    expect((await post(`/painel/produtos?mercadoId=${a.mercadoId}`, produto(), admin)).statusCode).toBe(201);
    expect(await repo.acharOferta(a.mercadoId, EAN_LEITE)).not.toBeNull();
  });
});
