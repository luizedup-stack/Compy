// Reconhecimento de falhas passageiras do banco. Fica separado de conexao.ts (que usa o driver do SQL Server) para o resto da API
// poder usar sem carregar o driver (o programa de computador não o inclui).

const CODIGOS_TRANSITORIOS = new Set(['ETIMEOUT', 'ESOCKET', 'ECONNRESET', 'ECONNCLOSED', 'ENOTOPEN', 'ECONNREFUSED', 'ELOGIN']);
// Erros do Azure SQL de "banco indisponível por instantes": 40613 (pausado/acordando), 40197, 40501, 49918-49920, 10928/10929.
const NUMEROS_TRANSITORIOS = new Set([40613, 40197, 40501, 49918, 49919, 49920, 10928, 10929, 4060]);

/** O erro some sozinho em instantes (banco do Azure acordando, conexão derrubada)? Então vale tentar de novo. */
export function erroTransitorio(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { code, number, originalError } = e as { code?: unknown; number?: unknown; originalError?: { number?: unknown; info?: { number?: unknown } } };
  const numero = Number(number ?? originalError?.number ?? originalError?.info?.number);
  if (NUMEROS_TRANSITORIOS.has(numero)) return true;
  if (typeof code === 'string' && CODIGOS_TRANSITORIOS.has(code)) return true;
  return /40613|is not currently available|ECONNRESET|socket hang up/i.test(String((e as Error).message ?? ''));
}
