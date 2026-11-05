import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from './app';
import { garantirAdmin } from './auth/admin';
import type { Config } from './config';
import { criarEmailConsole, type EmailSender } from './email';
import type { Repositorio } from './repositorio';
import { criarRepositorioMemoria } from './repositorioMemoria';
import { seed } from './scripts/seed';

export const ADMIN_DEV_EMAIL = 'admin@bolsocerto.local';

export interface OpcoesServidor {
  /** O servidor liga o log do Fastify; os testes ficam em silêncio. */
  logger?: boolean;
  /** Padrão: e-mails só escritos no console (ainda não há provedor de e-mail). */
  email?: EmailSender;
  /** Padrão: um repositório em memória novo. O programa de computador passa um que já restaurou o estado salvo. */
  repo?: Repositorio;
  /** Veja OpcoesApp.instancia. */
  instancia?: string;
}

/**
 * Fora de produção, sem administrador configurado, inventa um para o desenvolvimento
 * (senha aleatória, gerada a cada início). Em produção a configuração já exige o par.
 */
export function completarAdminDeDesenvolvimento(config: Config): { config: Config; senhaGerada: boolean } {
  if (config.producao || (config.adminEmail !== null && config.adminSenha !== null)) {
    return { config, senhaGerada: false };
  }
  const adminSenha = randomBytes(12).toString('base64url').slice(0, 16);
  return { config: { ...config, adminEmail: ADMIN_DEV_EMAIL, adminSenha }, senhaGerada: true };
}

/** Monta tudo a partir da configuração (repositório em memória, administrador, dados de teste), sem escutar porta. */
export async function montarServidor(
  config: Config,
  { logger = false, email = criarEmailConsole(), repo = criarRepositorioMemoria(), instancia }: OpcoesServidor = {},
): Promise<{ app: FastifyInstance; repo: Repositorio }> {
  const app = await construirApp({
    repo,
    email,
    jwtSecret: config.jwtSecret,
    logger,
    limitarRequisicoes: config.limitarRequisicoes,
    instancia,
  });
  try {
    if (config.adminEmail !== null && config.adminSenha !== null) {
      await garantirAdmin(repo, config.adminEmail, config.adminSenha);
    }
    if (config.carregarDadosDeTeste) {
      const relatorios = await seed(repo, config.pastaDadosDeTeste);
      const produtos = relatorios.reduce((soma, r) => soma + r.importadas, 0);
      app.log.info(`Dados de teste carregados: ${relatorios.length} planilhas, ${produtos} produtos.`);
    }
  } catch (e) {
    await app.close();
    throw e;
  }
  return { app, repo };
}
