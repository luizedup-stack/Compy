import { describe, expect, it } from 'vitest';
import { lerConfig } from './config';

const SEGREDO = 'a'.repeat(32);
const producao = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_SECRET: SEGREDO,
  ADMIN_EMAIL: 'dono@exemplo.com',
  ADMIN_SENHA: 'senha-forte-1',
  ...extra,
});

describe('lerConfig em desenvolvimento', () => {
  it('sem nada configurado usa padrões e gera um segredo aleatório', () => {
    const c = lerConfig({});
    expect(c.producao).toBe(false);
    expect(c.porta).toBe(3000);
    expect(c.host).toBe('0.0.0.0');
    expect(c.jwtSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(c.adminEmail).toBeNull();
    expect(c.adminSenha).toBeNull();
    expect(c.carregarDadosDeTeste).toBe(true);
    expect(c.pastaDadosDeTeste).toMatch(/dados-de-teste$/);
    expect(lerConfig({}).jwtSecret).not.toBe(c.jwtSecret);
  });

  it('respeita as variáveis informadas', () => {
    const c = lerConfig({
      PORT: '4000',
      HOST: '127.0.0.1',
      JWT_SECRET: 'curto',
      ADMIN_EMAIL: 'a@b.com',
      ADMIN_SENHA: 'xyz',
      PASTA_DADOS_DE_TESTE: '/tmp/dados',
    });
    expect(c).toMatchObject({
      porta: 4000,
      host: '127.0.0.1',
      jwtSecret: 'curto',
      adminEmail: 'a@b.com',
      adminSenha: 'xyz',
      pastaDadosDeTeste: '/tmp/dados',
    });
  });

  it('CARREGAR_DADOS_DE_TESTE=0 desliga e =1 liga', () => {
    expect(lerConfig({ CARREGAR_DADOS_DE_TESTE: '0' }).carregarDadosDeTeste).toBe(false);
    expect(lerConfig({ CARREGAR_DADOS_DE_TESTE: '1' }).carregarDadosDeTeste).toBe(true);
  });
});

describe('lerConfig em produção', () => {
  it('aceita uma configuração completa e não carrega dados de teste por padrão', () => {
    const c = lerConfig(producao());
    expect(c).toMatchObject({
      producao: true,
      jwtSecret: SEGREDO,
      adminEmail: 'dono@exemplo.com',
      adminSenha: 'senha-forte-1',
      carregarDadosDeTeste: false,
    });
  });

  it('CARREGAR_DADOS_DE_TESTE=1 é respeitado também em produção', () => {
    expect(lerConfig(producao({ CARREGAR_DADOS_DE_TESTE: '1' })).carregarDadosDeTeste).toBe(true);
  });

  it('sem JWT_SECRET: erro que cita a variável', () => {
    expect(() => lerConfig(producao({ JWT_SECRET: undefined }))).toThrow(/JWT_SECRET/);
  });

  it('JWT_SECRET com 31 caracteres: erro; com 32: ok', () => {
    expect(() => lerConfig(producao({ JWT_SECRET: 'a'.repeat(31) }))).toThrow(/JWT_SECRET/);
    expect(lerConfig(producao({ JWT_SECRET: 'a'.repeat(32) })).jwtSecret).toHaveLength(32);
  });

  it('sem ADMIN_EMAIL ou ADMIN_SENHA: erro que cita a variável', () => {
    expect(() => lerConfig(producao({ ADMIN_EMAIL: undefined }))).toThrow(/ADMIN_EMAIL/);
    expect(() => lerConfig(producao({ ADMIN_SENHA: undefined }))).toThrow(/ADMIN_SENHA/);
  });

  it('ADMIN_SENHA com menos de 8 caracteres: erro', () => {
    expect(() => lerConfig(producao({ ADMIN_SENHA: '1234567' }))).toThrow(/ADMIN_SENHA/);
  });
});

describe('lerConfig: porta', () => {
  it.each(['abc', '0', '70000', '-1', '3000.5'])('PORT=%s é inválida', (porta) => {
    expect(() => lerConfig({ PORT: porta })).toThrow(/PORT/);
  });
});
