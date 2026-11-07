// Testes do repositório com banco de dados. Só rodam se BANCO_TESTE_URL estiver definida (texto de conexão de um
// banco VAZIO de testes: o teste apaga tudo o que houver nele). Exemplo:
//   BANCO_TESTE_URL="Server=localhost,1433;Database=bolso_teste;User ID=sa;Password=...;TrustServerCertificate=True" npm test -w @mercado/api
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { aplicarMigracoes, dividirEmBlocos, erroTransitorio, lerTextoDeConexao, listarMigracoes } from './banco/conexao';
import { testarRepositorio } from './repositorio.contrato';
import { abrirBancoDeTeste, type BancoDeTeste } from './banco/apoioTeste';

const URL_TESTE = process.env.BANCO_TESTE_URL;

describe('texto de conexão', () => {
  it('lê o formato do portal do Azure', () => {
    const c = lerTextoDeConexao(
      'Server=tcp:meu-servidor.database.windows.net,1433;Initial Catalog=bolso;Persist Security Info=False;User ID=admin1;Password=Senha123;Encrypt=True;TrustServerCertificate=False;Connection Timeout=45;',
    );
    expect(c.server).toBe('meu-servidor.database.windows.net');
    expect(c.port).toBe(1433);
    expect(c.database).toBe('bolso');
    expect(c.user).toBe('admin1');
    expect(c.password).toBe('Senha123');
    expect(c.options?.encrypt).toBe(true);
    expect(c.options?.trustServerCertificate).toBe(false);
    expect(c.connectionTimeout).toBe(45_000);
  });

  it('aceita servidor sem porta, nomes alternativos e certificado confiável', () => {
    const c = lerTextoDeConexao('Data Source=localhost;Database=teste;UID=sa;PWD=abc;Encrypt=no;TrustServerCertificate=yes');
    expect(c).toMatchObject({ server: 'localhost', database: 'teste', user: 'sa', password: 'abc' });
    expect(c.port).toBeUndefined();
    expect(c.options).toMatchObject({ encrypt: false, trustServerCertificate: true });
  });

  it('a senha pode ter "=" e criptografia é o padrão', () => {
    const c = lerTextoDeConexao('Server=s;Database=d;User Id=u;Password=a=b=c');
    expect(c.password).toBe('a=b=c');
    expect(c.options?.encrypt).toBe(true);
  });

  it('avisa o que falta', () => {
    expect(() => lerTextoDeConexao('Database=d;User Id=u;Password=p')).toThrow(/servidor/);
    expect(() => lerTextoDeConexao('Server=s;User Id=u;Password=p')).toThrow(/banco/);
    expect(() => lerTextoDeConexao('Server=s;Database=d')).toThrow(/usuário e senha/);
    expect(() => lerTextoDeConexao('Server=s,abc;Database=d;User Id=u;Password=p')).toThrow(/Porta/);
  });
});

describe('migrações e erros passageiros', () => {
  it('divide o script nas linhas com GO', () => {
    expect(dividirEmBlocos('A;\nGO\nB;\n  go  \nC;')).toEqual(['A;', 'B;', 'C;']);
  });

  it('as migrações existem, são numeradas e em ordem', () => {
    const m = listarMigracoes();
    expect(m.length).toBeGreaterThan(0);
    expect(m.map((x) => x.versao)).toEqual([...m.map((x) => x.versao)].sort((a, b) => a - b));
    expect(m[0]!.versao).toBe(1);
  });

  it('reconhece o banco do Azure acordando como erro passageiro, e erro de SQL como definitivo', () => {
    expect(erroTransitorio({ number: 40613, message: 'Database is not currently available' })).toBe(true);
    expect(erroTransitorio({ code: 'ETIMEOUT', message: 'Failed to connect' })).toBe(true);
    expect(erroTransitorio({ code: 'ELOGIN', message: 'Login failed' })).toBe(true);
    expect(erroTransitorio({ number: 2627, message: 'Violation of UNIQUE KEY' })).toBe(false);
    expect(erroTransitorio(new Error('outra coisa'))).toBe(false);
    expect(erroTransitorio(null)).toBe(false);
  });
});

describe.skipIf(!URL_TESTE)('SQL Server de verdade', () => {
  let banco: BancoDeTeste;
  let pool: sql.ConnectionPool;

  beforeAll(async () => {
    vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });
    banco = await abrirBancoDeTeste();
    pool = banco.pool;
  }, 60_000);
  afterAll(async () => {
    await banco?.fechar();
  });

  const esvaziar = () => banco.esvaziar();

  testarRepositorio('SQL Server', esvaziar, { leituraEsperaTransacao: false });

  describe('específicos do banco', () => {
    it('aplicar as migrações de novo não faz nada', async () => {
      expect(await aplicarMigracoes(pool)).toEqual([]);
    });

    it('dois servidores atualizando o banco ao mesmo tempo não duplicam nada', async () => {
      const [a, b] = await Promise.all([aplicarMigracoes(pool), aplicarMigracoes(pool)]);
      expect([...a, ...b]).toEqual([]);
    });

    it('a data e hora da busca é guardada', async () => {
      const r = await esvaziar();
      await r.registrarBusca({ usuarioId: null, termo: 'leite', resultados: 1, mercadosDistintos: 1 });
      const l = (await new sql.Request(pool).query('SELECT feitaEm FROM dbo.Buscas')).recordset;
      expect(Math.abs(Date.now() - (l[0].feitaEm as Date).getTime())).toBeLessThan(60_000);
    });

    it('a lista da busca reflete uma escrita feita logo antes (a cópia é descartada)', async () => {
      const r = await esvaziar();
      const m = await r.criarMercado({ nome: 'A', endereco: 'Rua 1', nomeNorm: 'a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
      const oferta = {
        mercadoId: m.id, codigoBarras: '7891000100103', nome: 'Leite', nomeNorm: 'leite', preco: 5.5, quantidadeTexto: '1 L', quantidadeValor: 1,
        quantidadeUnidade: 'L' as const, categoria: null, disponivel: true, precoAtualizadoEm: new Date('2026-11-01T10:00:00Z'),
        promocaoPreco: null, promocaoInicio: null, promocaoFim: null,
      };
      await r.salvarOferta(oferta);
      expect(await r.listarOfertasParaBusca()).toHaveLength(1);
      await r.salvarOferta({ ...oferta, disponivel: false });
      expect(await r.listarOfertasParaBusca()).toHaveLength(0);
      await r.salvarOferta({ ...oferta, disponivel: true });
      await r.atualizarMercado(m.id, { status: 'removido' });
      expect(await r.listarOfertasParaBusca()).toHaveLength(0);
    });

    it('se as conexões caem, a próxima chamada reconecta sozinha', async () => {
      const r = await esvaziar();
      await r.criarUsuario({ email: 'a@x.com', senhaHash: 'h', papel: 'cliente', emailVerificado: false });
      const meu = (await new sql.Request(pool).query('SELECT @@SPID AS spid')).recordset[0].spid as number;
      const outros = (await new sql.Request(pool).query(`SELECT session_id FROM sys.dm_exec_sessions WHERE is_user_process = 1 AND database_id = DB_ID() AND session_id <> ${meu}`)).recordset;
      for (const s of outros) await new sql.Request(pool).batch(`KILL ${s.session_id}`).catch(() => undefined);
      expect((await r.acharUsuarioPorEmail('A@X.com'))?.email).toBe('a@x.com');
    }, 60_000);
  });
});
