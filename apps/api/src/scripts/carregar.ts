// Envia as planilhas de uma pasta para o banco de dados (o mesmo que o painel faz em "Enviar planilha", só que em lote).
// Útil para colocar no banco da nuvem as planilhas reais do seu computador (pasta dados-reais/).
//
// Uso (na pasta do projeto, com o texto de conexão do banco na variável BANCO_URL):
//   PowerShell:  $env:BANCO_URL = "Server=tcp:...;Initial Catalog=...;User ID=...;Password=...;Encrypt=True"
//                npm run carregar -w @mercado/api -- ..\..\dados-reais
// Se a planilha de um mercado já foi enviada antes, os preços dela substituem os que estão no banco.
import path from 'node:path';
import { abrirConexao, aplicarMigracoes } from '../banco/conexao';
import { criarRepositorioSqlServer } from '../repositorioSqlServer';
import { seed } from './seed';

async function main(): Promise<void> {
  const url = process.env.BANCO_URL?.trim();
  const pasta = process.argv[2];
  if (!url || !pasta) {
    throw new Error('Informe a pasta das planilhas e defina BANCO_URL. Exemplo: npm run carregar -w @mercado/api -- ..\\..\\dados-reais');
  }
  const aviso = (m: string) => console.log(`[banco] ${m}`);
  const pool = await abrirConexao(url, { aviso });
  try {
    await aplicarMigracoes(pool, { aviso });
    const repo = criarRepositorioSqlServer(pool, { aviso });
    const relatorios = await seed(repo, path.resolve(pasta));
    for (const r of relatorios) console.log(`Mercado #${r.mercadoId}${r.mercadoCriado ? ' (novo)' : ''}: ${r.importadas} produtos importados, ${r.erros.length} linhas com problema`);
    if (relatorios.length === 0) console.log('Nenhuma planilha .xlsx encontrada nessa pasta.');
  } finally {
    await pool.close();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
