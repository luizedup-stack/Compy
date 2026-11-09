// Ponto de entrada: lê o ambiente, abre o banco (se BANCO_URL estiver definida), monta o servidor e escuta a porta.
// Nenhum teste importa este arquivo (ele inicia o servidor ao ser carregado); a parte testável é montarServidor.
import { abrirConexao, aplicarMigracoes, lerInstanciaDoBanco } from './banco/conexao';
import { lerConfig } from './config';
import type { Repositorio } from './repositorio';
import { criarGerenciadorDeFotos } from './fotos/gerenciador';
import { criarFotosEmbutidas } from './fotos/embutidas';
import { carregarBancoIlustrativo, carregarCategorias } from './fotos/ilustrativas';
import { criarBuscadorOpenFoodFacts, criarBuscadorPorNomeOpenFoodFacts } from './fotos/openFoodFacts';
import { criarRepositorioMemoria } from './repositorioMemoria';
import { criarRepositorioSqlServer } from './repositorioSqlServer';
import { ADMIN_DEV_EMAIL, completarAdminDeDesenvolvimento, montarServidor } from './servidor';

const aviso = (mensagem: string) => console.log(`[banco] ${mensagem}`);
const AGENTE_FOTOS = 'BolsoCerto/1.0 (https://github.com/luizedup-stack/bolso-certo)';

async function main(): Promise<void> {
  const { config, senhaGerada } = completarAdminDeDesenvolvimento(lerConfig(process.env));

  let repo: Repositorio = criarRepositorioMemoria();
  let instancia: string | undefined;
  if (config.bancoUrl !== null) {
    aviso('Conectando ao banco (o banco gratuito do Azure pode levar 1 minuto para acordar)...');
    const pool = await abrirConexao(config.bancoUrl, { aviso });
    await aplicarMigracoes(pool, { aviso });
    instancia = await lerInstanciaDoBanco(pool);
    repo = criarRepositorioSqlServer(pool, { aviso });
    aviso('Banco conectado.');
  } else if (config.producao) {
    console.warn('ATENÇÃO: sem BANCO_URL, os dados ficam só na memória e somem quando o servidor reinicia.');
  }

  // Procura sozinho a foto dos produtos (Open Food Facts), devagar e em segundo plano; o que acha fica gravado no banco.
  const fotos = config.fotosAutomaticas
    ? criarGerenciadorDeFotos({
        repo,
        buscador: criarBuscadorOpenFoodFacts({ userAgent: AGENTE_FOTOS }),
        ...(config.fotosIlustrativas ? { ilustrativas: carregarBancoIlustrativo(), categorias: carregarCategorias() } : {}),
        // O buscador por nome serve a duas coisas: achar a foto dos TIPOS de produto (banco ilustrativo) e, só com FOTOS_POR_NOME=1, cada produto pelo próprio nome.
        ...(config.fotosIlustrativas || config.fotosPorNome ? { buscadorPorNome: criarBuscadorPorNomeOpenFoodFacts({ userAgent: AGENTE_FOTOS }), procurarProdutoPorNome: config.fotosPorNome } : {}),
        intervaloMs: config.fotosIntervaloMs,
        log: (m) => console.log(m),
      })
    : undefined;

  const { app } = await montarServidor(config, { logger: true, repo, ...(instancia ? { instancia } : {}), ...(fotos ? { fotos } : {}), ...(config.fotosIlustrativas ? { fotosEmbutidas: criarFotosEmbutidas() } : {}), ...(config.producao ? { cacheRespostasMs: 20_000 } : {}) });
  if (senhaGerada) {
    console.log(`Administrador de desenvolvimento: ${ADMIN_DEV_EMAIL} / senha: ${config.adminSenha} (nova a cada início)`);
  }
  await app.listen({ port: config.porta, host: config.host });
  console.log(`Bolso Certo API em http://localhost:${config.porta}`);
  if (fotos) {
    fotos.agendarPendentes(); // produtos que ainda não têm foto (carga de teste, planilhas anteriores)
    setInterval(() => fotos.agendarPendentes(), 6 * 60 * 60 * 1000).unref(); // e de tempos em tempos, para os "não achados" antigos
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
