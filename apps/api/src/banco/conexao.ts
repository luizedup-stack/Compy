// Conexão com o SQL Server / Azure SQL: leitura do texto de conexão, tentativas quando o banco está "acordando"
// e aplicação das migrações (os arquivos .sql de ./migracoes).
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

/**
 * Lê o "texto de conexão" no formato que o portal do Azure e o SSMS mostram, por exemplo:
 *   Server=tcp:meu-servidor.database.windows.net,1433;Initial Catalog=bolso;User ID=admin;Password=...;Encrypt=True;
 * Aceita também "Data Source", "Database", "UID", "PWD" e "Connection Timeout". Lança erro com o que está faltando.
 */
export function lerTextoDeConexao(texto: string): sql.config {
  const pares = new Map<string, string>();
  for (const parte of texto.split(';')) {
    const i = parte.indexOf('=');
    if (i <= 0) continue;
    pares.set(parte.slice(0, i).trim().toLowerCase().replace(/\s+/g, ' '), parte.slice(i + 1).trim());
  }
  const pegar = (...nomes: string[]): string | undefined => {
    for (const n of nomes) {
      const v = pares.get(n);
      if (v !== undefined && v !== '') return v;
    }
    return undefined;
  };
  const servidorBruto = pegar('server', 'data source', 'address', 'addr', 'network address');
  if (!servidorBruto) throw new Error('Texto de conexão sem o servidor (falta "Server=...").');
  const banco = pegar('database', 'initial catalog');
  if (!banco) throw new Error('Texto de conexão sem o nome do banco (falta "Initial Catalog=...").');
  const usuario = pegar('user id', 'uid', 'user', 'username');
  const senha = pegar('password', 'pwd');
  if (!usuario || senha === undefined) throw new Error('Texto de conexão sem usuário e senha (falta "User ID=...;Password=...").');

  // "tcp:servidor,1433", "servidor,1433", "servidor\\instancia" ou só "servidor".
  let servidor = servidorBruto.replace(/^tcp:/i, '');
  let porta: number | undefined;
  const virgula = servidor.lastIndexOf(',');
  if (virgula > 0) {
    porta = Number(servidor.slice(virgula + 1));
    servidor = servidor.slice(0, virgula);
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error('Porta inválida no texto de conexão.');
  }

  const verdadeiro = (v: string | undefined, padrao: boolean): boolean =>
    v === undefined ? padrao : ['true', 'yes', '1', 'mandatory', 'strict'].includes(v.toLowerCase());
  const segundos = Number(pegar('connect timeout', 'connection timeout') ?? 30);

  return {
    server: servidor,
    port: porta,
    database: banco,
    user: usuario,
    password: senha,
    connectionTimeout: (Number.isFinite(segundos) && segundos > 0 ? segundos : 30) * 1000,
    requestTimeout: 120_000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    options: {
      // Azure SQL exige criptografia. Um SQL Server local de testes costuma usar certificado próprio.
      encrypt: verdadeiro(pegar('encrypt'), true),
      trustServerCertificate: verdadeiro(pegar('trustservercertificate'), false),
    },
  };
}

export { erroTransitorio } from './erros';
import { erroTransitorio } from './erros';

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Roda `tarefa` e repete (com espera crescente) enquanto o erro for transitório. */
export async function comTentativas<R>(
  tarefa: () => Promise<R>,
  { tentativas = 4, esperaInicialMs = 2000, aviso }: { tentativas?: number; esperaInicialMs?: number; aviso?: (msg: string) => void } = {},
): Promise<R> {
  let espera = esperaInicialMs;
  for (let n = 1; ; n++) {
    try {
      return await tarefa();
    } catch (e) {
      if (n >= tentativas || !erroTransitorio(e)) throw e;
      aviso?.(`Banco indisponível (${e instanceof Error ? e.message : String(e)}). Tentativa ${n}/${tentativas}; nova tentativa em ${Math.round(espera / 1000)}s.`);
      await esperar(espera);
      espera = Math.min(espera * 2, 30_000);
    }
  }
}

/**
 * Abre o conjunto de conexões. O banco gratuito do Azure se pausa quando fica parado e leva até ~1 minuto para
 * acordar: por isso a primeira conexão tenta várias vezes antes de desistir.
 */
export async function abrirConexao(
  textoDeConexao: string,
  { aviso, tentativas = 8 }: { aviso?: (msg: string) => void; tentativas?: number } = {},
): Promise<sql.ConnectionPool> {
  const config = lerTextoDeConexao(textoDeConexao);
  return comTentativas(
    async () => {
      const pool = new sql.ConnectionPool(config);
      // Conexão que cai depois de aberta não pode derrubar o servidor inteiro.
      pool.on('error', (e) => aviso?.(`Conexão com o banco: ${e.message}`));
      try {
        return await pool.connect();
      } catch (e) {
        await pool.close().catch(() => undefined);
        throw e;
      }
    },
    { tentativas, esperaInicialMs: 5000, aviso },
  );
}

const PASTA_MIGRACOES = path.join(__dirname, 'migracoes');

/** Divide um arquivo .sql em blocos nas linhas que têm só "GO" (como o SSMS). */
export function dividirEmBlocos(script: string): string[] {
  return script
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b !== '');
}

/** Os arquivos NNN-nome.sql da pasta de migrações, em ordem. */
export function listarMigracoes(pasta = PASTA_MIGRACOES): { versao: number; arquivo: string; script: string }[] {
  return fs
    .readdirSync(pasta)
    .filter((n) => /^\d+-.*\.sql$/i.test(n))
    .sort()
    .map((arquivo) => ({ versao: Number.parseInt(arquivo, 10), arquivo, script: fs.readFileSync(path.join(pasta, arquivo), 'utf8') }));
}

/**
 * Aplica as migrações que ainda não foram aplicadas, cada uma numa transação. Uma trava do próprio banco impede que
 * dois servidores ligando ao mesmo tempo apliquem a mesma migração duas vezes.
 */
export async function aplicarMigracoes(
  pool: sql.ConnectionPool,
  { pasta, aviso }: { pasta?: string; aviso?: (msg: string) => void } = {},
): Promise<number[]> {
  const aplicadas: number[] = [];
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const trava = await new sql.Request(tx)
      .input('recurso', sql.NVarChar, 'bolso-certo:migracoes')
      .query(`DECLARE @r int; EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 120000; SELECT @r AS codigo;`);
    if ((trava.recordset[0]?.codigo as number) < 0) throw new Error('Não consegui a trava para atualizar o banco (outro servidor está atualizando?).');

    await new sql.Request(tx).batch(
      `IF OBJECT_ID(N'dbo.SchemaVersao', N'U') IS NULL CREATE TABLE dbo.SchemaVersao (versao int NOT NULL PRIMARY KEY, arquivo nvarchar(200) NOT NULL, aplicadaEm datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());`,
    );
    const feitas = new Set<number>(
      (await new sql.Request(tx).query('SELECT versao FROM dbo.SchemaVersao')).recordset.map((l: { versao: number }) => l.versao),
    );
    for (const m of listarMigracoes(pasta)) {
      if (feitas.has(m.versao)) continue;
      aviso?.(`Atualizando o banco: ${m.arquivo}`);
      for (const bloco of dividirEmBlocos(m.script)) await new sql.Request(tx).batch(bloco);
      await new sql.Request(tx).input('v', sql.Int, m.versao).input('a', sql.NVarChar, m.arquivo).query('INSERT INTO dbo.SchemaVersao (versao, arquivo) VALUES (@v, @a)');
      aplicadas.push(m.versao);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => undefined);
    throw e;
  }
  return aplicadas;
}

/** O identificador deste banco (criado pela migração 002). Entra nas sessões das pessoas; veja 002-configuracao.sql. */
export async function lerInstanciaDoBanco(pool: sql.ConnectionPool): Promise<string> {
  const r = await new sql.Request(pool).query("SELECT valor FROM dbo.Configuracao WHERE chave = N'instancia'");
  const valor = r.recordset[0]?.valor as string | undefined;
  if (!valor) throw new Error('O banco não tem a configuração "instancia" (a migração 002 não rodou?).');
  return valor;
}
