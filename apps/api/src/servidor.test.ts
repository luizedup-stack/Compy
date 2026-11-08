import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GrupoProduto } from '@mercado/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import { criarEmailMemoria } from './email';
import { criarRepositorioMemoria } from './repositorioMemoria';
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
  bancoUrl: null,
  pastaPainel: '/nao/existe',
  confiarNoProxy: false,
  fotosAutomaticas: false,
  fotosPorNome: false,
  fotosIlustrativas: true,
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

describe('montarServidor: hospedagem e banco de dados', () => {
  it('só carrega os dados de teste se o banco ainda não tem nenhum mercado', async () => {
    const repo = criarRepositorioMemoria();
    await repo.criarMercado({ nome: 'Já existia', endereco: 'Rua 1', nomeNorm: 'ja existia', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const { repo: usado } = await (aberto = await montarServidor(base, { email: criarEmailMemoria(), repo }));
    expect(await usado.listarMercados()).toHaveLength(1);
  });

  it('com o banco vazio, carrega as planilhas de teste uma vez', async () => {
    const { repo } = await montar(base);
    expect((await repo.listarMercados()).length).toBeGreaterThan(1);
  });

  it('/saude responde sem tocar no banco', async () => {
    const { app } = await montar({ ...base, carregarDadosDeTeste: false });
    const r = await app.inject({ method: 'GET', url: '/saude' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok' });
    expect((await app.inject({ method: 'GET', url: '/saude/banco' })).statusCode).toBe(404);
  });

  it('/saude/banco confere o banco quando o repositório sabe fazer ping', async () => {
    let falha = false;
    const repo = Object.assign(criarRepositorioMemoria(), {
      async ping() {
        if (falha) throw new Error('fora do ar');
      },
    });
    const { app } = await (aberto = await montarServidor({ ...base, carregarDadosDeTeste: false }, { email: criarEmailMemoria(), repo }));
    expect((await app.inject({ method: 'GET', url: '/saude/banco' })).statusCode).toBe(200);
    falha = true;
    const r = await app.inject({ method: 'GET', url: '/saude/banco' });
    expect(r.statusCode).toBe(503);
    expect(JSON.stringify(r.json())).not.toContain('fora do ar');
  });

  describe('painel entregue pela API', () => {
    let pasta: string;
    beforeEach(() => {
      pasta = mkdtempSync(path.join(tmpdir(), 'painel-'));
      mkdirSync(path.join(pasta, 'assets'));
      writeFileSync(path.join(pasta, 'index.html'), '<!doctype html><title>Painel</title>');
      writeFileSync(path.join(pasta, 'assets', 'app.js'), 'console.log(1)');
    });
    afterEach(() => rmSync(pasta, { recursive: true, force: true }));

    it('entrega o index, os arquivos e abre qualquer tela do painel; a raiz leva para o painel', async () => {
      const { app } = await montar({ ...base, carregarDadosDeTeste: false, pastaPainel: pasta });
      const raiz = await app.inject({ method: 'GET', url: '/' });
      expect(raiz.statusCode).toBe(302);
      expect(raiz.headers.location).toBe('/painel-web/');
      for (const url of ['/painel-web/', '/painel-web/entrar', '/painel-web/produtos/123']) {
        const r = await app.inject({ method: 'GET', url });
        expect(r.statusCode, url).toBe(200);
        expect(r.body, url).toContain('<title>Painel</title>');
      }
      const js = await app.inject({ method: 'GET', url: '/painel-web/assets/app.js' });
      expect(js.statusCode).toBe(200);
      expect(js.body).toBe('console.log(1)');
    });

    it('as rotas da API continuam valendo ao lado do painel', async () => {
      const { app } = await montar({ ...base, carregarDadosDeTeste: false, pastaPainel: pasta });
      expect((await app.inject({ method: 'GET', url: '/busca?q=arroz' })).statusCode).toBe(200); // pública
      expect((await app.inject({ method: 'GET', url: '/conta' })).statusCode).toBe(401); // da conta: exige login
      expect((await app.inject({ method: 'GET', url: '/rota-que-nao-existe' })).statusCode).toBe(404);
    });
  });

  it('sem a pasta do painel compilado a API não inventa um painel', async () => {
    const { app } = await montar({ ...base, carregarDadosDeTeste: false });
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/painel-web/' })).statusCode).toBe(404);
  });

  it('atrás do proxy da hospedagem, o limite de tentativas conta por pessoa (X-Forwarded-For), não pelo proxy', async () => {
    const { app } = await montar({ ...base, carregarDadosDeTeste: false, confiarNoProxy: true });
    const entrar = (ip: string) =>
      app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.1.2.3', headers: { 'x-forwarded-for': ip }, payload: { email: 'x@y.com', senha: 'errada123' } });
    for (let i = 0; i < 20; i++) expect((await entrar('203.0.113.1')).statusCode).toBe(401);
    expect((await entrar('203.0.113.1')).statusCode).toBe(429);
    // Outra pessoa, mesmo proxy: não é bloqueada.
    expect((await entrar('203.0.113.2')).statusCode).toBe(401);
  });

  it('sem confiar no proxy, um cabeçalho X-Forwarded-For de fora não engana o limite', async () => {
    const { app } = await montar({ ...base, carregarDadosDeTeste: false });
    const entrar = (ip: string) =>
      app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.1.2.3', headers: { 'x-forwarded-for': ip }, payload: { email: 'x@y.com', senha: 'errada123' } });
    for (let i = 0; i < 20; i++) await entrar(`198.51.100.${i}`);
    expect((await entrar('198.51.100.99')).statusCode).toBe(429);
  });
});

describe('banco acordando (Azure gratuito)', () => {
  const acordando = () => Object.assign(new Error('Database is not currently available'), { number: 40613 });

  it('uma falha passageira do banco vira 503 com aviso claro e Retry-After, não "erro interno"', async () => {
    const { app } = await montar({ ...base, carregarDadosDeTeste: false });
    const original = app.repo.listarMercados;
    app.repo.listarMercados = async () => {
      throw acordando();
    };
    const res = await app.inject({ method: 'GET', url: '/mercados' });
    app.repo.listarMercados = original;
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('10');
    expect(res.json()).toEqual({ erro: 'O servidor está acordando. Tente de novo em alguns instantes.' });
  });

  it('um erro de verdade continua sendo 500 genérico (sem vazar detalhes)', async () => {
    const { app } = await montar({ ...base, carregarDadosDeTeste: false });
    const original = app.repo.listarMercados;
    app.repo.listarMercados = async () => {
      throw new Error('segredo interno do banco');
    };
    const res = await app.inject({ method: 'GET', url: '/mercados' });
    app.repo.listarMercados = original;
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.json())).not.toContain('segredo');
  });
});
