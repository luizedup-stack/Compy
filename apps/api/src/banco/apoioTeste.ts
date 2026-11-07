// Apoio dos testes que usam um SQL Server de verdade (BANCO_TESTE_URL). Não é usado fora dos testes.
import sql from 'mssql';
import { criarRepositorioSqlServer, type RepositorioSqlServer } from '../repositorioSqlServer';
import { abrirConexao, aplicarMigracoes } from './conexao';

export const URL_BANCO_TESTE = process.env.BANCO_TESTE_URL;

export interface BancoDeTeste {
  pool: sql.ConnectionPool;
  /** Esvazia todas as tabelas, zera os contadores de id e devolve um repositório novo (sem cópia da busca guardada). */
  esvaziar(): Promise<RepositorioSqlServer>;
  fechar(): Promise<void>;
}

/** Abre o banco de testes (que será APAGADO a cada `esvaziar`), liga a leitura sem bloqueio como no Azure e aplica as migrações. */
export async function abrirBancoDeTeste(): Promise<BancoDeTeste> {
  const pool = await abrirConexao(URL_BANCO_TESTE!, { tentativas: 2 });
  await new sql.Request(pool).batch('ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE');
  await aplicarMigracoes(pool);
  return {
    pool,
    async esvaziar() {
      await new sql.Request(pool).batch(`
        DELETE FROM dbo.Buscas; DELETE FROM dbo.FotosProduto; DELETE FROM dbo.Tokens; DELETE FROM dbo.Ofertas; DELETE FROM dbo.Mercados; DELETE FROM dbo.Usuarios;
        DBCC CHECKIDENT ('dbo.Usuarios', RESEED, 0) WITH NO_INFOMSGS;
        DBCC CHECKIDENT ('dbo.Mercados', RESEED, 0) WITH NO_INFOMSGS;
        DBCC CHECKIDENT ('dbo.Tokens', RESEED, 0) WITH NO_INFOMSGS;
        DBCC CHECKIDENT ('dbo.Ofertas', RESEED, 0) WITH NO_INFOMSGS;
        DBCC CHECKIDENT ('dbo.Buscas', RESEED, 0) WITH NO_INFOMSGS;`);
      return criarRepositorioSqlServer(pool);
    },
    fechar: () => pool.close(),
  };
}
