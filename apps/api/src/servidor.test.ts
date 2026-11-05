import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { GrupoProduto } from '@mercado/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import { criarEmailMemoria } from './email';
import { PASTA_DADOS } from './rotas/apoioTeste';
import { ADMIN_DEV_EMAIL, completarAdminDeDesenvolvimento, montarServidor } from './servidor';

const base: Config = {
  porta: 0,
  host: '127.0.0.1',
  producao: false,
  jwtSecret: 'segredo-de-teste-com-mais-de-32-caracteres',
  adminEmail: 'dono@exemplo.com',
  adminSenha: 'senha-do-dono-1',
  carregarDadosDeTeste: true,
  pastaDadosDeTeste: PASTA_DADOS,
  limitarRequisicoes: true,
  permitirEmailNoLog: false,
};

type Servidor = Awaited<ReturnType<typeof montarServidor>>;
let aberto: Servidor | null = null;
const montar = async (config: Config): Promise<Servidor> =>
  (aberto = await montarServidor(config, { email: criarEmailMemoria() }));
afterEach(async () => {
  await aberto?.app.close();
  aberto = null;
});

async function entrarComoCliente(s: Servidor): Promise<string> {
  const credenciais = { email: 'cliente@exemplo.com', senha: 'senha-boa-123' };
  const cadastro = await s.app.inject({ method: 'POST', url: '/auth/cadastro', payload: credenciais });
  expect(cadastro.statusCode).toBe(201);
  const login = await s.app.inject({ method: 'POST', url: '/auth/login', payload: credenciais });
  expect(login.statusCode).toBe(200);
  return login.json().token as string;
}

const buscarPapel = (s: Servidor, token: string) =>
  s.app.inject({
    method: 'GET',
    url: '/busca?q=papel higienico',
    headers: { authorization: `Bearer ${token}` },
  });

describe('montarServidor', () => {
  it('com dados de teste: cadastro, login e busca devolvem os grupos de papel higiênico', async () => {
    const s = await montar(base);
    const res = await buscarPapel(s, await entrarComoCliente(s));
    expect(res.statusCode).toBe(200);
    const grupos = res.json() as GrupoProduto[];
    expect(grupos).toHaveLength(4);
    expect(grupos.map((g) => g.ofertas.length)).toEqual([2, 3, 2, 2]);
    expect((await s.repo.listarMercados()).filter((m) => m.status === 'ativo')).toHaveLength(4);
  });

  it('cria o administrador configurado, que consegue entrar', async () => {
    const s = await montar(base);
    const res = await s.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'dono@exemplo.com', senha: 'senha-do-dono-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ papel: 'admin', emailVerificado: true });
  });

  it('sem dados de teste: a busca devolve []', async () => {
    const s = await montar({ ...base, carregarDadosDeTeste: false });
    const res = await buscarPapel(s, await entrarComoCliente(s));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    expect(await s.repo.listarMercados()).toEqual([]);
  });

  it('sem administrador configurado, não cria nenhum', async () => {
    const s = await montar({ ...base, adminEmail: null, adminSenha: null, carregarDadosDeTeste: false });
    const res = await s.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'dono@exemplo.com', senha: 'senha-do-dono-1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('publica a política de privacidade', async () => {
    const s = await montar({ ...base, carregarDadosDeTeste: false });
    expect((await s.app.inject({ method: 'GET', url: '/privacidade' })).statusCode).toBe(200);
  });
});

describe('montarServidor: limite de requisições (R32)', () => {
  const tentar = (s: Servidor) => s.app.inject({ method: 'POST', url: '/auth/login', payload: {} });

  it('com limitarRequisicoes, a 21ª tentativa de login responde 429', async () => {
    const s = await montar({ ...base, carregarDadosDeTeste: false });
    for (let i = 0; i < 20; i++) expect((await tentar(s)).statusCode).toBe(400);
    expect((await tentar(s)).statusCode).toBe(429);
  });

  it('com limitarRequisicoes: false, nada é limitado', async () => {
    const s = await montar({ ...base, carregarDadosDeTeste: false, limitarRequisicoes: false });
    for (let i = 0; i < 25; i++) expect((await tentar(s)).statusCode).toBe(400);
  });
});

describe('completarAdminDeDesenvolvimento', () => {
  const semAdmin: Config = { ...base, adminEmail: null, adminSenha: null };

  it('fora de produção, sem administrador: inventa um com senha aleatória de 16 caracteres', () => {
    const a = completarAdminDeDesenvolvimento(semAdmin);
    expect(a.senhaGerada).toBe(true);
    expect(a.config.adminEmail).toBe(ADMIN_DEV_EMAIL);
    expect(a.config.adminSenha).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(completarAdminDeDesenvolvimento(semAdmin).config.adminSenha).not.toBe(a.config.adminSenha);
  });

  it('com administrador configurado, não mexe em nada', () => {
    expect(completarAdminDeDesenvolvimento(base)).toEqual({ config: base, senhaGerada: false });
  });

  it('em produção, nunca gera administrador', () => {
    const prod = { ...semAdmin, producao: true };
    expect(completarAdminDeDesenvolvimento(prod)).toEqual({ config: prod, senhaGerada: false });
  });
});

describe('server.ts', () => {
  it('nenhum teste importa o arquivo de entrada (ele inicia o servidor ao ser carregado)', () => {
    const raiz = __dirname;
    const testes = (readdirSync(raiz, { recursive: true }) as string[]).filter((f) => f.endsWith('.test.ts'));
    expect(testes.length).toBeGreaterThan(5);
    const importaEntrada = /from\s+['"](\.\.?\/)+server['"]/;
    for (const t of testes) {
      const conteudo = readFileSync(path.join(raiz, t), 'utf8');
      // O próprio regex acima aparece neste arquivo; os demais não podem casar.
      if (t === 'servidor.test.ts') continue;
      expect(conteudo, t).not.toMatch(importaEntrada);
    }
  });
});
