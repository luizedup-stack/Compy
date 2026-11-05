import { describe, expect, it } from 'vitest';
import { comToken, criarAmbiente, type Ambiente } from './apoioTeste';

const MSG_LIMITE = 'Muitas tentativas. Tente de novo em alguns instantes.';

const loginRuim = (amb: Ambiente, remoteAddress = '127.0.0.1') =>
  amb.app.inject({ method: 'POST', url: '/auth/login', payload: {}, remoteAddress });

describe('limite de requisições (R32), ligado', () => {
  it('a 21ª tentativa de login no mesmo minuto responde 429 em português, com Retry-After', async () => {
    const amb = await criarAmbiente({ limitarRequisicoes: true });
    for (let i = 0; i < 20; i++) expect((await loginRuim(amb)).statusCode).toBe(400);
    const res = await loginRuim(amb);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ erro: MSG_LIMITE });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('todas as rotas POST /auth/* contam juntas', async () => {
    const amb = await criarAmbiente({ limitarRequisicoes: true });
    const rotas = ['/auth/cadastro', '/auth/esqueci-senha', '/auth/redefinir-senha', '/auth/verificar-email'];
    for (let i = 0; i < 18; i++) {
      const res = await amb.app.inject({ method: 'POST', url: rotas[i % rotas.length]!, payload: {} });
      expect(res.statusCode).toBe(400);
    }
    expect((await amb.app.inject({ method: 'POST', url: '/auth/reenviar-verificacao' })).statusCode).toBe(401);
    expect((await loginRuim(amb)).statusCode).toBe(400); // 20ª
    expect((await amb.app.inject({ method: 'POST', url: '/auth/cadastro', payload: {} })).statusCode).toBe(429);
    expect((await amb.app.inject({ method: 'POST', url: '/auth/reenviar-verificacao' })).statusCode).toBe(429);
  });

  it('o limite é por endereço: outro IP ainda entra', async () => {
    const amb = await criarAmbiente({ limitarRequisicoes: true });
    for (let i = 0; i < 21; i++) await loginRuim(amb, '10.0.0.1');
    expect((await loginRuim(amb, '10.0.0.1')).statusCode).toBe(429);
    expect((await loginRuim(amb, '10.0.0.2')).statusCode).toBe(400);
  });

  it('a 61ª busca no mesmo minuto responde 429', async () => {
    const amb = await criarAmbiente({ limitarRequisicoes: true });
    const { token } = await amb.criarComPapel('cliente');
    const buscar = () => amb.app.inject({ method: 'GET', url: '/busca?q=arroz', headers: comToken(token) });
    for (let i = 0; i < 60; i++) expect((await buscar()).statusCode).toBe(200);
    const res = await buscar();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ erro: MSG_LIMITE });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('busca e auth têm contas separadas, e /painel/* e /planilhas não são limitados por essas regras', async () => {
    const amb = await criarAmbiente({ limitarRequisicoes: true });
    for (let i = 0; i < 21; i++) await loginRuim(amb);
    expect((await loginRuim(amb)).statusCode).toBe(429);

    const cliente = await amb.criarComPapel('cliente');
    expect(
      (await amb.app.inject({ method: 'GET', url: '/busca?q=arroz', headers: comToken(cliente.token) })).statusCode,
    ).toBe(200);

    const mercado = await amb.criarComPapel('mercado');
    for (let i = 0; i < 70; i++) {
      const painel = await amb.app.inject({ method: 'GET', url: '/painel/cobranca', headers: comToken(mercado.token) });
      expect(painel.statusCode).not.toBe(429);
      const planilha = await amb.app.inject({ method: 'POST', url: '/planilhas' });
      expect(planilha.statusCode).toBe(401);
    }
  });
});

describe('limite de requisições, desligado (padrão de construirApp)', () => {
  it('nada é limitado', async () => {
    const amb = await criarAmbiente();
    for (let i = 0; i < 25; i++) expect((await loginRuim(amb)).statusCode).toBe(400);
    const { token } = await amb.criarComPapel('cliente');
    for (let i = 0; i < 65; i++) {
      expect((await amb.app.inject({ method: 'GET', url: '/busca?q=arroz', headers: comToken(token) })).statusCode).toBe(200);
    }
  });
});

describe('limite de requisições e CORS', () => {
  it('a resposta 429 traz o cabeçalho de CORS, para o painel conseguir ler o erro', async () => {
    const amb = await criarAmbiente({ limitarRequisicoes: true });
    const comOrigem = () =>
      amb.app.inject({ method: 'POST', url: '/auth/login', payload: {}, headers: { origin: 'http://localhost:5173' } });
    for (let i = 0; i < 20; i++) await comOrigem();
    const res = await comOrigem();
    expect(res.statusCode).toBe(429);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
