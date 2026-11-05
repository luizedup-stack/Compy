import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../app';
import { criarEmailMemoria } from '../email';
import type { Papel, Repositorio } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { exigirPapel } from './guardas';

let app: FastifyInstance;
let repo: Repositorio;

async function criarConta(papel: Papel) {
  const u = await repo.criarUsuario({
    email: `${papel}-${Math.random()}@exemplo.com`,
    senhaHash: 'hash',
    papel,
    emailVerificado: true,
  });
  return { id: u.id, token: app.jwt.sign({ id: u.id, papel, inst: app.instancia }) };
}

beforeEach(async () => {
  repo = criarRepositorioMemoria();
  app = await construirApp({ repo, email: criarEmailMemoria(), jwtSecret: 'segredo-de-teste' });
  app.get('/so-admin', { preHandler: exigirPapel('admin') }, async (req) => req.usuario);
  app.get('/mercado-ou-admin', { preHandler: exigirPapel('mercado', 'admin') }, async (req) => req.usuario);
});

const get = (url: string, token?: string) =>
  app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('exigirPapel', () => {
  it('sem token responde 401', async () => {
    const res = await get('/so-admin');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ erro: expect.any(String) });
  });

  it('token adulterado ou assinado com outra chave responde 401', async () => {
    expect((await get('/so-admin', 'abc.def.ghi')).statusCode).toBe(401);
    const outro = await construirApp({
      repo: criarRepositorioMemoria(),
      email: criarEmailMemoria(),
      jwtSecret: 'outro-segredo',
    });
    const estranho = outro.jwt.sign({ id: 1, papel: 'admin', inst: app.instancia });
    expect((await get('/so-admin', estranho)).statusCode).toBe(401);
  });

  it('papel não permitido responde 403', async () => {
    const { token } = await criarConta('cliente');
    const res = await get('/so-admin', token);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ erro: expect.any(String) });
  });

  it('papel permitido passa e preenche req.usuario com { id, papel }', async () => {
    const { id, token } = await criarConta('admin');
    const res = await get('/so-admin', token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, papel: 'admin' });
  });

  it('aceita qualquer um dos papéis listados', async () => {
    const mercado = await criarConta('mercado');
    expect((await get('/mercado-ou-admin', mercado.token)).json()).toEqual({ id: mercado.id, papel: 'mercado' });
    const cliente = await criarConta('cliente');
    expect((await get('/mercado-ou-admin', cliente.token)).statusCode).toBe(403);
  });

  it('token de uma conta excluída depois responde 401 "Sessão inválida"', async () => {
    const { id, token } = await criarConta('admin');
    expect((await get('/so-admin', token)).statusCode).toBe(200);
    await repo.excluirUsuario(id);
    const res = await get('/so-admin', token);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ erro: 'Sessão inválida' });
  });

  it('usa o papel guardado no repositório: token de admin rebaixado responde 403', async () => {
    const { id, token } = await criarConta('admin');
    await repo.atualizarUsuario(id, { papel: 'cliente' });
    const res = await get('/so-admin', token);
    expect(res.statusCode).toBe(403);
  });

  it('usa o papel guardado no repositório: token de cliente promovido passa e req.usuario traz o papel novo', async () => {
    const { id, token } = await criarConta('cliente');
    await repo.atualizarUsuario(id, { papel: 'admin' });
    const res = await get('/so-admin', token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, papel: 'admin' });
  });
});

describe('sessão presa à instância do servidor (R29)', () => {
  const SEGREDO = 'segredo-de-producao-fixo-com-32-caracteres';

  async function instancia() {
    const r = criarRepositorioMemoria();
    const a = await construirApp({ repo: r, email: criarEmailMemoria(), jwtSecret: SEGREDO });
    return { repo: r, app: a };
  }

  async function cadastrarEEntrar(a: FastifyInstance, endereco: string): Promise<string> {
    const senha = 'senha-boa-123';
    const cad = await a.inject({ method: 'POST', url: '/auth/cadastro', payload: { email: endereco, senha } });
    expect(cad.statusCode).toBe(201);
    const login = await a.inject({ method: 'POST', url: '/auth/login', payload: { email: endereco, senha } });
    expect(login.statusCode).toBe(200);
    return login.json().token as string;
  }

  it('cada instância tem o seu identificador aleatório', async () => {
    const a = await instancia();
    const b = await instancia();
    expect(a.app.instancia).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.app.instancia).not.toBe(b.app.instancia);
  });

  it('o login assina { id, papel, inst } com a instância em execução', async () => {
    const a = await instancia();
    const token = await cadastrarEEntrar(a.app, 'ana@exemplo.com');
    expect(a.app.jwt.verify<{ inst: string }>(token).inst).toBe(a.app.instancia);
  });

  it('token de outra instância (mesmo segredo, ids que se repetem) responde 401 e não age como outra conta', async () => {
    const a = await instancia();
    const b = await instancia();
    const tokenAna = await cadastrarEEntrar(a.app, 'ana@exemplo.com');
    const tokenBia = await cadastrarEEntrar(b.app, 'bia@exemplo.com');
    const bia = (await b.repo.acharUsuarioPorEmail('bia@exemplo.com'))!;
    expect(b.app.jwt.verify<{ id: number }>(tokenAna).id).toBe(bia.id); // mesmo id numérico

    const busca = await b.app.inject({
      method: 'GET',
      url: '/busca?q=arroz',
      headers: { authorization: `Bearer ${tokenAna}` },
    });
    expect(busca.statusCode).toBe(401);
    expect(busca.json()).toEqual({ erro: 'Sessão inválida' });

    const apagar = await b.app.inject({
      method: 'DELETE',
      url: '/conta',
      headers: { authorization: `Bearer ${tokenAna}` },
    });
    expect(apagar.statusCode).toBe(401);
    expect(apagar.json()).toEqual({ erro: 'Sessão inválida' });
    expect(await b.repo.acharUsuario(bia.id)).not.toBeNull();

    // Na própria instância, os tokens seguem valendo.
    const propria = await b.app.inject({
      method: 'GET',
      url: '/busca?q=arroz',
      headers: { authorization: `Bearer ${tokenBia}` },
    });
    expect(propria.statusCode).toBe(200);
    const propriaA = await a.app.inject({
      method: 'GET',
      url: '/busca?q=arroz',
      headers: { authorization: `Bearer ${tokenAna}` },
    });
    expect(propriaA.statusCode).toBe(200);
  });

  it('token sem inst é recusado com 401 "Sessão inválida"', async () => {
    const { id } = await criarConta('admin');
    const semInst = app.jwt.sign({ id, papel: 'admin' } as never);
    const res = await get('/so-admin', semInst);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ erro: 'Sessão inválida' });
  });
});
