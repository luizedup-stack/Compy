// Ponto de entrada: lê o ambiente, abre o banco (se BANCO_URL estiver definida), monta o servidor e escuta a porta.
// Nenhum teste importa este arquivo (ele inicia o servidor ao ser carregado); a parte testável é montarServidor.
import { abrirConexao, aplicarMigracoes, lerInstanciaDoBanco } from './banco/conexao';
import { lerConfig } from './config';
import type { Repositorio } from './repositorio';
import { criarRepositorioSqlServer } from './repositorioSqlServer';
import { ADMIN_DEV_EMAIL, completarAdminDeDesenvolvimento, montarServidor } from './servidor';

const aviso = (mensagem: string) => console.log(`[banco] ${mensagem}`);

async function main(): Promise<void> {
  const { config, senhaGerada } = completarAdminDeDesenvolvimento(lerConfig(process.env));

  let repo: Repositorio | undefined;
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

  const { app } = await montarServidor(config, { logger: true, ...(repo ? { repo } : {}), ...(instancia ? { instancia } : {}) });
  if (senhaGerada) {
    console.log(`Administrador de desenvolvimento: ${ADMIN_DEV_EMAIL} / senha: ${config.adminSenha} (nova a cada início)`);
  }
  await app.listen({ port: config.porta, host: config.host });
  console.log(`Bolso Certo API em http://localhost:${config.porta}`);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
