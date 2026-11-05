import { describe, expect, it } from 'vitest';
import { construirApp } from '../app';
import { criarEmailMemoria } from '../email';
import { criarRepositorioMemoria } from '../repositorioMemoria';

describe('log de requisições (R33b)', () => {
  it('registra método, caminho sem a consulta e endereço; nunca a consulta nem os cabeçalhos', async () => {
    const linhas: string[] = [];
    const app = await construirApp({
      repo: criarRepositorioMemoria(),
      email: criarEmailMemoria(),
      jwtSecret: 'segredo-de-teste',
      logger: true,
      destinoDoLog: { write: (linha: string) => void linhas.push(linha) },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/busca?q=segredo&ordem=unidade',
      headers: { authorization: 'Bearer token-muito-secreto', cookie: 'c=biscoito' },
    });
    expect(res.statusCode).toBe(401);
    const log = linhas.join('\n');
    expect(log).not.toContain('segredo');
    expect(log).not.toContain('token-muito-secreto');
    expect(log).not.toMatch(/authorization/i);
    expect(log).not.toContain('biscoito');

    const recebida = linhas.map((l) => JSON.parse(l)).find((l) => l.msg === 'incoming request');
    expect(recebida.req).toEqual({ method: 'GET', url: '/busca', remoteAddress: '127.0.0.1' });
    await app.close();
  });
});
