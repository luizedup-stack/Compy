import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { LIMITE_BYTES } from '@mercado/shared';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { rotasAuth } from './auth/rotas';
import type { EmailSender } from './email';
import type { Repositorio } from './repositorio';
import { rotasAdmin } from './rotas/admin';
import { rotasBusca } from './rotas/busca';
import { rotasMercados } from './rotas/mercados';
import { rotasPainel } from './rotas/painel';
import { rotasPlanilhas } from './rotas/planilhas';
import { rotasPrivacidade } from './rotas/privacidade';

export interface OpcoesApp {
  repo: Repositorio;
  email: EmailSender;
  jwtSecret: string;
  /** Liga o log do Fastify (o servidor liga; os testes ficam em silêncio). */
  logger?: boolean;
  /** Para onde vai o log quando ligado (padrão: saída do processo). Usado pelos testes. */
  destinoDoLog?: { write(linha: string): void };
  /** Liga os limites de requisições por endereço (o servidor liga; padrão desligado nos testes). */
  limitarRequisicoes?: boolean;
}

/**
 * O log de cada requisição guarda só método, caminho (sem a consulta: `/busca?q=...` traria o texto
 * da busca) e endereço do cliente; nunca cabeçalhos (Authorization) nem a consulta (R33b).
 */
function resumoDaRequisicao(req: { method: string; url: string; ip?: string; socket?: { remoteAddress?: string } }) {
  return {
    method: req.method,
    url: req.url.split('?')[0],
    remoteAddress: req.ip ?? req.socket?.remoteAddress,
  };
}

/** Limites por endereço do cliente, numa janela de 1 minuto (R32). */
export const LIMITE_AUTH_POR_MINUTO = 20;
export const LIMITE_BUSCA_POR_MINUTO = 60;
const MSG_LIMITE = 'Muitas tentativas. Tente de novo em alguns instantes.';

/** Todas as rotas POST /auth/* contam juntas; GET /busca tem a sua conta. As outras rotas não são limitadas. */
async function registrarLimites(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, { global: false });
  const limiteAuth = app.createRateLimit({
    max: LIMITE_AUTH_POR_MINUTO,
    timeWindow: 60_000,
    keyGenerator: (req) => `auth|${req.ip}`,
  });
  const limiteBusca = app.createRateLimit({
    max: LIMITE_BUSCA_POR_MINUTO,
    timeWindow: 60_000,
    keyGenerator: (req) => `busca|${req.ip}`,
  });
  app.addHook('onRequest', async (req, reply) => {
    const rota = req.routeOptions.url;
    let limite: typeof limiteAuth | null = null;
    if (req.method === 'POST' && rota?.startsWith('/auth/')) limite = limiteAuth;
    else if (req.method === 'GET' && rota === '/busca') limite = limiteBusca;
    if (!limite) return;
    const r = await limite(req);
    if (!r.isAllowed && r.isExceeded) {
      return reply.code(429).header('retry-after', String(Math.max(1, r.ttlInSeconds))).send({ erro: MSG_LIMITE });
    }
  });
}

export async function construirApp({
  repo,
  email,
  jwtSecret,
  logger = false,
  limitarRequisicoes = false,
  destinoDoLog,
}: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger
      ? {
          level: 'info',
          serializers: { req: resumoDaRequisicao },
          ...(destinoDoLog ? { stream: destinoDoLog } : {}),
        }
      : false,
  });

  // Liberado para qualquer origem: serve ao desenvolvimento (painel web e app mobile).
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  // Depois do CORS: a resposta 429 também leva os cabeçalhos de CORS.
  if (limitarRequisicoes) await registrarLimites(app);
  await app.register(jwt, { secret: jwtSecret, sign: { expiresIn: '7d' } });
  // O limite vale por arquivo; acima dele a rota responde 422 (veja rotas/planilhas.ts).
  await app.register(multipart, { limits: { fileSize: LIMITE_BYTES, files: 1 } });
  app.decorate('repo', repo);
  // Nova a cada início: tokens de um início anterior deixam de valer (veja auth/guardas.ts).
  app.decorate('instancia', randomUUID());
  app.decorateRequest('usuario', null as never);

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ erro: 'Rota não encontrada' }));
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      app.log.error(err);
      return reply.code(500).send({ erro: 'Erro interno do servidor' });
    }
    return reply.code(status).send({ erro: 'Requisição inválida' });
  });

  await app.register(rotasAuth({ repo, email }));
  await app.register(rotasPlanilhas({ repo }));
  await app.register(rotasAdmin({ repo }));
  await app.register(rotasPainel({ repo }));
  await app.register(rotasBusca({ repo }));
  await app.register(rotasMercados({ repo }));
  await app.register(rotasPrivacidade());
  return app;
}
