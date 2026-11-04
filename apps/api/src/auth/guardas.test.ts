import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../app';
import { criarEmailMemoria } from '../email';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { exigirPapel } from './guardas';

let app: FastifyInstance;

beforeEach(async () => {
  app = await construirApp({
    repo: criarRepositorioMemoria(),
    email: criarEmailMemoria(),
    jwtSecret: 'segredo-de-teste',
  });
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
    const estranho = outro.jwt.sign({ id: 1, papel: 'admin' });
    expect((await get('/so-admin', estranho)).statusCode).toBe(401);
  });

  it('papel não permitido responde 403', async () => {
    const res = await get('/so-admin', app.jwt.sign({ id: 7, papel: 'cliente' }));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ erro: expect.any(String) });
  });

  it('papel permitido passa e preenche req.usuario com { id, papel }', async () => {
    const res = await get('/so-admin', app.jwt.sign({ id: 7, papel: 'admin' }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 7, papel: 'admin' });
  });

  it('aceita qualquer um dos papéis listados', async () => {
    const res = await get('/mercado-ou-admin', app.jwt.sign({ id: 3, papel: 'mercado' }));
    expect(res.json()).toEqual({ id: 3, papel: 'mercado' });
    expect((await get('/mercado-ou-admin', app.jwt.sign({ id: 4, papel: 'cliente' }))).statusCode).toBe(403);
  });
});
