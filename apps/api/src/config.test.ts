import { describe, expect, it } from 'vitest';
import { lerConfig } from './config';

const SEGREDO = 'a'.repeat(32);
const producao = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_SECRET: SEGREDO,
  ADMIN_EMAIL: 'dono@exemplo.com',
  ADMIN_SENHA: 'senha-forte-1',
  PERMITIR_EMAIL_NO_LOG: '1',
  BANCO_URL: 'Server=s;Database=d;User Id=u;Password=p',
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

describe('lerConfig: LIMITAR_REQUISICOES (R32)', () => {
  it('liga por padrão, em desenvolvimento e em produção', () => {
    expect(lerConfig({}).limitarRequisicoes).toBe(true);
    expect(lerConfig(producao()).limitarRequisicoes).toBe(true);
  });

  it("'0' desliga; '1' ou qualquer outro valor deixa ligado", () => {
    expect(lerConfig({ LIMITAR_REQUISICOES: '0' }).limitarRequisicoes).toBe(false);
    expect(lerConfig(producao({ LIMITAR_REQUISICOES: ' 0 ' })).limitarRequisicoes).toBe(false);
    expect(lerConfig({ LIMITAR_REQUISICOES: '1' }).limitarRequisicoes).toBe(true);
    expect(lerConfig({ LIMITAR_REQUISICOES: '' }).limitarRequisicoes).toBe(true);
  });
});

describe('lerConfig: NODE_ENV estrito (R33a)', () => {
  it.each(['Production', ' production ', 'PRODUCTION'])('%j vale como produção (com todas as exigências)', (valor) => {
    expect(lerConfig(producao({ NODE_ENV: valor })).producao).toBe(true);
    expect(() => lerConfig({ NODE_ENV: valor })).toThrow(/JWT_SECRET/);
  });

  it.each(['prod', 'staging', 'dev', 'producao'])('%j é recusado com erro que cita a variável', (valor) => {
    expect(() => lerConfig(producao({ NODE_ENV: valor }))).toThrow(
      'NODE_ENV inválido: use development, test ou production',
    );
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['não definido', undefined],
    ['development', 'development'],
    ['test', ' Test '],
  ])('%s vale como desenvolvimento', (_nome, valor) => {
    expect(lerConfig({ NODE_ENV: valor }).producao).toBe(false);
  });
});

describe('lerConfig: e-mail no log (R33b)', () => {
  it('em produção sem PERMITIR_EMAIL_NO_LOG=1 o servidor não sobe', () => {
    const semFlag = { ...producao(), PERMITIR_EMAIL_NO_LOG: undefined };
    expect(() => lerConfig(semFlag)).toThrow(
      'Em produção é preciso configurar um serviço de e-mail. Para o piloto, defina PERMITIR_EMAIL_NO_LOG=1 sabendo que os códigos aparecerão no log do servidor.',
    );
    expect(() => lerConfig({ ...semFlag, PERMITIR_EMAIL_NO_LOG: '0' })).toThrow(/PERMITIR_EMAIL_NO_LOG=1/);
  });

  it('em produção com PERMITIR_EMAIL_NO_LOG=1 sobe e guarda a escolha', () => {
    expect(lerConfig(producao({ PERMITIR_EMAIL_NO_LOG: '1' })).permitirEmailNoLog).toBe(true);
  });

  it('desenvolvimento e teste não exigem nada', () => {
    expect(lerConfig({}).permitirEmailNoLog).toBe(false);
    expect(lerConfig({ NODE_ENV: 'test' }).permitirEmailNoLog).toBe(false);
    expect(lerConfig({ PERMITIR_EMAIL_NO_LOG: '1' }).permitirEmailNoLog).toBe(true);
  });
});

describe('lerConfig: banco de dados e hospedagem', () => {
  it('em produção sem BANCO_URL o servidor não sobe (os dados sumiriam a cada reinício)', () => {
    const semBanco = { ...producao(), BANCO_URL: undefined };
    expect(() => lerConfig(semBanco)).toThrow(/BANCO_URL/);
  });

  it('PERMITIR_SEM_BANCO=1 deixa subir sem banco, só para um teste descartável', () => {
    const c = lerConfig({ ...producao(), BANCO_URL: undefined, PERMITIR_SEM_BANCO: '1' });
    expect(c.bancoUrl).toBeNull();
  });

  it('guarda o texto de conexão; fora de produção ele é opcional', () => {
    expect(lerConfig(producao()).bancoUrl).toBe('Server=s;Database=d;User Id=u;Password=p');
    expect(lerConfig({}).bancoUrl).toBeNull();
    expect(lerConfig({ BANCO_URL: '  ' }).bancoUrl).toBeNull();
  });

  it('CONFIAR_PROXY=1 liga a confiança no proxy da hospedagem; desligado por padrão', () => {
    expect(lerConfig({}).confiarNoProxy).toBe(false);
    expect(lerConfig({ CONFIAR_PROXY: '1' }).confiarNoProxy).toBe(true);
    expect(lerConfig({ CONFIAR_PROXY: 'sim' }).confiarNoProxy).toBe(false);
  });

  it('PAINEL_DIST troca a pasta do painel compilado', () => {
    expect(lerConfig({ PAINEL_DIST: '/x/painel' }).pastaPainel).toBe('/x/painel');
    expect(lerConfig({}).pastaPainel).toMatch(/painel[\\/]dist$/);
  });
});

describe('lerConfig: fotos automáticas', () => {
  it('ligadas por padrão em produção e desligadas nos outros ambientes', () => {
    expect(lerConfig(producao()).fotosAutomaticas).toBe(true);
    expect(lerConfig({}).fotosAutomaticas).toBe(false);
    expect(lerConfig({ NODE_ENV: 'test' }).fotosAutomaticas).toBe(false);
  });

  it('FOTOS_AUTOMATICAS troca o padrão: 1 liga, 0 desliga', () => {
    expect(lerConfig({ FOTOS_AUTOMATICAS: '1' }).fotosAutomaticas).toBe(true);
    expect(lerConfig(producao({ FOTOS_AUTOMATICAS: '0' })).fotosAutomaticas).toBe(false);
  });
});

describe('lerConfig: fotos pelo nome do produto', () => {
  it('desligadas por padrão; FOTOS_POR_NOME=1 liga', () => {
    expect(lerConfig({}).fotosPorNome).toBe(false);
    expect(lerConfig(producao()).fotosPorNome).toBe(false);
    expect(lerConfig(producao({ FOTOS_POR_NOME: '1' })).fotosPorNome).toBe(true);
  });
});

describe('lerConfig: fotos ilustrativas', () => {
  it('ligadas por padrão (enquanto o sistema está em teste); FOTOS_ILUSTRATIVAS=0 desliga', () => {
    expect(lerConfig({}).fotosIlustrativas).toBe(true);
    expect(lerConfig(producao({ FOTOS_ILUSTRATIVAS: '0' })).fotosIlustrativas).toBe(false);
    expect(lerConfig({}).fotosIntervaloMs).toBe(2500);
    expect(lerConfig({ FOTOS_INTERVALO_MS: '5000' }).fotosIntervaloMs).toBe(5000);
    expect(lerConfig({ FOTOS_INTERVALO_MS: 'abc' }).fotosIntervaloMs).toBe(2500);
  });
});
