import { beforeEach, describe, expect, it } from 'vitest';
import { type Ambiente, comToken, criarAmbiente, enviarPlanilha, lerPlanilha } from './apoioTeste';

let amb: Ambiente;

beforeEach(async () => {
  amb = await criarAmbiente();
});

const acesso = (token: string | null, id: number | string, corpo: unknown) =>
  amb.app.inject({
    method: 'POST',
    url: `/admin/mercados/${id}/acesso`,
    payload: corpo as object,
    headers: token ? comToken(token) : {},
  });

const remover = (token: string | null, id: number | string) =>
  amb.app.inject({
    method: 'POST',
    url: `/admin/mercados/${id}/remover`,
    headers: token ? comToken(token) : {},
  });

async function importarComoAdmin(token: string, arquivo: string): Promise<number> {
  const res = await enviarPlanilha(amb.app, token, lerPlanilha(arquivo));
  expect(res.statusCode).toBe(200);
  return res.json().mercadoId as number;
}

describe('proteção das rotas de administração', () => {
  it('sem token → 401 e papéis errados → 403 em todas', async () => {
    const cliente = await amb.criarComPapel('cliente');
    const mercado = await amb.criarComPapel('mercado');
    const chamadas = (token: string | null) => [
      amb.app.inject({ method: 'GET', url: '/admin/mercados', headers: token ? comToken(token) : {} }),
      acesso(token, 1, { email: 'a@exemplo.com' }),
      remover(token, 1),
    ];
    for (const res of await Promise.all(chamadas(null))) expect(res.statusCode).toBe(401);
    for (const res of await Promise.all(chamadas(cliente.token))) expect(res.statusCode).toBe(403);
    for (const res of await Promise.all(chamadas(mercado.token))) expect(res.statusCode).toBe(403);
  });
});

describe('GET /admin/mercados', () => {
  it('lista os mercados por id com total de produtos e se têm login', async () => {
    const admin = await amb.criarComPapel('admin');
    const id1 = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');
    const id2 = await importarComoAdmin(admin.token, 'mercado-2-estrela-da-vila.xlsx');
    const dono = await amb.criarComPapel('mercado', 'dono@exemplo.com');
    await amb.repo.atualizarMercado(id2, { usuarioId: dono.id });

    const res = await amb.app.inject({ method: 'GET', url: '/admin/mercados', headers: comToken(admin.token) });
    expect(res.statusCode).toBe(200);
    const lista = res.json() as {
      id: number;
      nome: string;
      endereco: string;
      status: string;
      totalProdutos: number;
      temLogin: boolean;
    }[];
    expect(lista.map((m) => m.id)).toEqual([id1, id2]);
    expect(Object.keys(lista[0]!).sort()).toEqual(['endereco', 'id', 'nome', 'status', 'temLogin', 'totalProdutos']);
    expect(lista[0]).toMatchObject({ status: 'ativo', totalProdutos: 26, temLogin: false });
    expect(lista[1]).toMatchObject({ status: 'ativo', temLogin: true });
    expect(lista[1]!.totalProdutos).toBe((await amb.repo.listarOfertasDoMercado(id2)).length);
    expect(lista[1]!.totalProdutos).toBeGreaterThan(0);
  });
});

describe('POST /admin/mercados/:id/acesso', () => {
  it('cria o login, devolve a senha temporária uma vez e o mercado consegue entrar e enviar a planilha', async () => {
    const admin = await amb.criarComPapel('admin');
    const id = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');

    const res = await acesso(admin.token, id, { email: ' Dono@Mercado.com ' });
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store'); // a senha temporária não pode ficar em cache
    const { senhaTemporaria } = res.json() as { senhaTemporaria: string };
    expect(senhaTemporaria).toMatch(/^[A-Za-z0-9_-]{12}$/);

    const usuario = await amb.repo.acharUsuarioPorEmail('dono@mercado.com');
    expect(usuario).toMatchObject({ papel: 'mercado', emailVerificado: true });
    expect(usuario!.senhaHash).not.toBe(senhaTemporaria);
    expect((await amb.repo.acharMercado(id))!.usuarioId).toBe(usuario!.id);

    const login = await amb.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'dono@mercado.com', senha: senhaTemporaria },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().papel).toBe('mercado');

    // Planilha com outro nome: o login atualiza o PRÓPRIO mercado.
    const envio = await enviarPlanilha(amb.app, login.json().token, lerPlanilha('mercado-3-emporio-sonia.xlsx'));
    expect(envio.statusCode).toBe(200);
    expect(envio.json()).toMatchObject({ mercadoId: id, mercadoCriado: false });
    expect(await amb.repo.listarMercados()).toHaveLength(1);
  });

  it('cada chamada gera uma senha diferente', async () => {
    const admin = await amb.criarComPapel('admin');
    const a = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');
    const b = await importarComoAdmin(admin.token, 'mercado-2-estrela-da-vila.xlsx');
    const s1 = (await acesso(admin.token, a, { email: 'a@exemplo.com' })).json().senhaTemporaria;
    const s2 = (await acesso(admin.token, b, { email: 'b@exemplo.com' })).json().senhaTemporaria;
    expect(s1).not.toBe(s2);
  });

  it('e-mail inválido ou ausente → 400 "E-mail inválido"', async () => {
    const admin = await amb.criarComPapel('admin');
    const id = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');
    for (const corpo of [{ email: 'sem-arroba' }, {}, { email: 5 }]) {
      const res = await acesso(admin.token, id, corpo);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ erro: 'E-mail inválido' });
    }
    expect((await amb.repo.acharMercado(id))!.usuarioId).toBeNull();
  });

  it('mercado inexistente → 404', async () => {
    const admin = await amb.criarComPapel('admin');
    const res = await acesso(admin.token, 999, { email: 'a@exemplo.com' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ erro: 'Mercado não encontrado' });
    expect((await acesso(admin.token, 'abc', { email: 'a@exemplo.com' })).statusCode).toBe(404);
  });

  it('mercado que já tem login → 409 e a senha anterior continua valendo', async () => {
    const admin = await amb.criarComPapel('admin');
    const id = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');
    const primeira = await acesso(admin.token, id, { email: 'a@exemplo.com' });
    const res = await acesso(admin.token, id, { email: 'b@exemplo.com' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'Este mercado já tem acesso' });
    expect(await amb.repo.acharUsuarioPorEmail('b@exemplo.com')).toBeNull();
    const login = await amb.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'a@exemplo.com', senha: primeira.json().senhaTemporaria },
    });
    expect(login.statusCode).toBe(200);
  });

  it('e-mail que já existe → 409 e o mercado continua sem login', async () => {
    const admin = await amb.criarComPapel('admin');
    const id = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');
    await amb.criarComPapel('cliente', 'ocupado@exemplo.com');
    const res = await acesso(admin.token, id, { email: 'Ocupado@Exemplo.com' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: 'Esse e-mail já está cadastrado' });
    expect((await amb.repo.acharMercado(id))!.usuarioId).toBeNull();
  });

  it('mercado removido → 409', async () => {
    const admin = await amb.criarComPapel('admin');
    const id = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');
    await remover(admin.token, id);
    const res = await acesso(admin.token, id, { email: 'a@exemplo.com' });
    expect(res.statusCode).toBe(409);
    expect(typeof res.json().erro).toBe('string');
    expect(await amb.repo.acharUsuarioPorEmail('a@exemplo.com')).toBeNull();
  });
});

describe('POST /admin/mercados/:id/remover', () => {
  it('marca como removido (204), é idempotente e bloqueia novos envios do admin', async () => {
    const admin = await amb.criarComPapel('admin');
    const id = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');

    const res = await remover(admin.token, id);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect((await amb.repo.acharMercado(id))!.status).toBe('removido');

    expect((await remover(admin.token, id)).statusCode).toBe(204);
    expect((await amb.repo.acharMercado(id))!.status).toBe('removido');

    const reenvio = await enviarPlanilha(amb.app, admin.token, lerPlanilha('mercado-1-bom-preco.xlsx'));
    expect(reenvio.statusCode).toBe(422);
    expect(reenvio.json().erro).toContain('removido');

    const lista = await amb.app.inject({ method: 'GET', url: '/admin/mercados', headers: comToken(admin.token) });
    expect(lista.json()[0]).toMatchObject({ id, status: 'removido' });
  });

  it('mercado com login que foi removido não consegue mais enviar planilha', async () => {
    const admin = await amb.criarComPapel('admin');
    const id = await importarComoAdmin(admin.token, 'mercado-1-bom-preco.xlsx');
    const dono = await amb.criarComPapel('mercado', 'dono@exemplo.com');
    await amb.repo.atualizarMercado(id, { usuarioId: dono.id });
    await remover(admin.token, id);
    const res = await enviarPlanilha(amb.app, dono.token, lerPlanilha('mercado-1-bom-preco.xlsx'));
    expect(res.statusCode).toBe(422);
  });

  it('mercado inexistente → 404', async () => {
    const admin = await amb.criarComPapel('admin');
    const res = await remover(admin.token, 999);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ erro: 'Mercado não encontrado' });
  });
});
