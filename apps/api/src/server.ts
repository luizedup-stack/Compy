// Ponto de entrada: lê o ambiente, monta o servidor e escuta a porta.
// Nenhum teste importa este arquivo (ele inicia o servidor ao ser carregado); a parte testável é montarServidor.
import { lerConfig } from './config';
import { ADMIN_DEV_EMAIL, completarAdminDeDesenvolvimento, montarServidor } from './servidor';

async function main(): Promise<void> {
  const { config, senhaGerada } = completarAdminDeDesenvolvimento(lerConfig(process.env));
  const { app } = await montarServidor(config, { logger: true });
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
