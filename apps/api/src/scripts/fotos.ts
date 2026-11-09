// Procura, de uma vez, a foto de todos os produtos que ainda não têm (Open Food Facts) e mostra o resultado.
// O servidor já faz isso sozinho em segundo plano; esta ferramenta serve para encher o banco logo depois de enviar muitas
// planilhas, ou para conferir quantos produtos ficaram sem foto.
//
// Uso (na pasta do projeto, com o texto de conexão do banco em BANCO_URL):
//   PowerShell:  $env:BANCO_URL = "Server=tcp:...;Initial Catalog=...;User ID=...;Password=...;Encrypt=True"
//                npm run fotos -w @mercado/api
// Respeita o limite do serviço (uma consulta por vez, com pausa) e pode levar vários minutos para muitos produtos.
import { abrirConexao, aplicarMigracoes } from '../banco/conexao';
import { criarGerenciadorDeFotos } from '../fotos/gerenciador';
import { carregarBancoIlustrativo, carregarCategorias } from '../fotos/ilustrativas';
import { criarBuscadorOpenFoodFacts, criarBuscadorPorNomeOpenFoodFacts } from '../fotos/openFoodFacts';
import { criarRepositorioSqlServer } from '../repositorioSqlServer';

async function main(): Promise<void> {
  const url = process.env.BANCO_URL?.trim();
  if (!url) throw new Error('Defina BANCO_URL (texto de conexão do banco). Exemplo no cabeçalho deste arquivo.');
  const aviso = (m: string) => console.log(`[banco] ${m}`);
  const pool = await abrirConexao(url, { aviso });
  try {
    await aplicarMigracoes(pool, { aviso });
    const repo = criarRepositorioSqlServer(pool, { aviso });
    const antes = (await repo.listarCodigosSemFoto(1_000_000, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))).length;
    console.log(`Produtos para procurar: ${antes}`);
    const gerenciador = criarGerenciadorDeFotos({
      repo,
      buscador: criarBuscadorOpenFoodFacts({ userAgent: 'BolsoCerto/1.0 (https://github.com/luizedup-stack/bolso-certo)' }),
      // Com FOTOS_ILUSTRATIVAS=0 não usa a foto do tipo de produto quando não acha a específica.
      ...(process.env.FOTOS_ILUSTRATIVAS !== '0' ? { ilustrativas: carregarBancoIlustrativo(), categorias: carregarCategorias() } : {}),
      // Com FOTOS_POR_NOME=0 só procura pelo código de barras; senão também pelo nome (mais devagar: o serviço limita essas buscas).
      ...(process.env.FOTOS_ILUSTRATIVAS !== '0' || process.env.FOTOS_POR_NOME === '1'
        ? { buscadorPorNome: criarBuscadorPorNomeOpenFoodFacts({ userAgent: 'BolsoCerto/1.0 (https://github.com/luizedup-stack/bolso-certo)' }), procurarProdutoPorNome: process.env.FOTOS_POR_NOME === '1' }
        : {}),
      log: (m) => console.log(m),
    });
    const r = await gerenciador.processarPendentes();
    console.log(`Pronto: ${r.achadas} fotos achadas, ${r.ilustrativas} com foto ilustrativa, ${r.naoAchadas} produtos sem foto${r.adiadas ? ' (o serviço pediu calma: rode de novo mais tarde para o resto)' : ''}.`);
    console.log(`Produtos com foto no banco: ${(await repo.listarCodigosComFoto()).length}.`);
  } finally {
    await pool.close();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
