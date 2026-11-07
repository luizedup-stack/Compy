import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
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
  /** Veja OpcoesApp.fotos. */
  fotos?: { agendarPendentes(): void };
}

/** Prefixo em que a API entrega o painel do mercado (quando a pasta do painel compilado existe). */
export const PREFIXO_PAINEL = '/painel-web';

/** Repositório que sabe dizer se o banco responde (o de SQL Server). */
type ComPing = Repositorio & { ping(): Promise<void> };
const temPing = (r: Repositorio): r is ComPing => typeof (r as Partial<ComPing>).ping === 'function';

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
  { logger = false, email = criarEmailConsole(), repo = criarRepositorioMemoria(), instancia, fotos }: OpcoesServidor = {},
): Promise<{ app: FastifyInstance; repo: Repositorio }> {
  const app = await construirApp({
    repo,
    email,
    jwtSecret: config.jwtSecret,
    logger,
    limitarRequisicoes: config.limitarRequisicoes,
    instancia,
    confiarNoProxy: config.confiarNoProxy,
    fotos,
  });
  try {
    if (config.adminEmail !== null && config.adminSenha !== null) {
      await garantirAdmin(repo, config.adminEmail, config.adminSenha);
    }
    // Só carrega as planilhas de teste se ainda não há nenhum mercado: com banco de dados, reiniciar o servidor não pode
    // refazer a carga (ela desfaria as correções de preço feitas à mão).
    if (config.carregarDadosDeTeste && (await repo.listarMercados()).length === 0) {
      const relatorios = await seed(repo, config.pastaDadosDeTeste);
      const produtos = relatorios.reduce((soma, r) => soma + r.importadas, 0);
      app.log.info(`Dados de teste carregados: ${relatorios.length} planilhas, ${produtos} produtos.`);
    }
    if (temPing(repo)) {
      // Confere o banco de verdade (acorda o banco gratuito do Azure, se estiver pausado). Para a hospedagem usar só se quiser.
      app.get('/saude/banco', async (_req, reply) => {
        try {
          await repo.ping();
          return { status: 'ok' };
        } catch {
          return reply.code(503).send({ status: 'banco indisponível' });
        }
      });
    }
    await registrarPainel(app, config.pastaPainel);
  } catch (e) {
    await app.close();
    throw e;
  }
  return { app, repo };
}

/** Entrega o painel do mercado (já compilado) em /painel-web/, e leva quem abre o endereço da API para lá. */
async function registrarPainel(app: FastifyInstance, pasta: string): Promise<void> {
  if (!fs.existsSync(path.join(pasta, 'index.html'))) return;
  await app.register(fastifyStatic, { root: pasta, prefix: `${PREFIXO_PAINEL}/`, wildcard: false, index: 'index.html' });
  // As telas do painel (/painel-web/entrar, /painel-web/produtos...) não são arquivos: todas abrem o mesmo index.html.
  app.get(`${PREFIXO_PAINEL}/*`, (_req, reply) => reply.type('text/html; charset=utf-8').sendFile('index.html'));
  app.get('/', (_req, reply) => reply.redirect(`${PREFIXO_PAINEL}/`));
}
