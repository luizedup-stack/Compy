import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { LIMITE_BYTES } from '@mercado/shared';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { erroTransitorio } from './banco/erros';
import { rotasAuth } from './auth/rotas';
import type { EmailSender } from './email';
import type { Repositorio } from './repositorio';
import { rotasAdmin } from './rotas/admin';
import { rotasBusca } from './rotas/busca';
import { rotasConta } from './rotas/conta';
import type { FotosEmbutidas } from './fotos/embutidas';
import { rotasFotos } from './rotas/fotos';
import { rotasMercados } from './rotas/mercados';
import { rotasMeusMercados } from './rotas/meusMercados';
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
  /** Identifica este início do servidor nos tokens. Padrão: nova a cada início (sessões antigas deixam de valer); o programa de computador guarda a sua para as sessões sobreviverem ao reabrir. */
  instancia?: string;
  /** A API está atrás de um proxy da hospedagem: confia no X-Forwarded-For para achar o IP de cada pessoa (limites de tentativas). */
  confiarNoProxy?: boolean;
  /** Procura sozinho a foto dos produtos novos (veja fotos/gerenciador.ts). Sem ele, só entram fotos enviadas pelos mercados. */
  fotos?: { agendarPendentes(): void };
  /** A foto ilustrativa do tipo, tirada do banco de fotos do sistema na hora de responder (veja fotos/embutidas.ts). */
  fotosEmbutidas?: FotosEmbutidas;
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
/** Demais consultas públicas (catálogo, lista de produtos, mercados): por endereço, numa janela de 1 minuto. */
export const LIMITE_LEITURA_POR_MINUTO = 120;
const MSG_LIMITE = 'Muitas tentativas. Tente de novo em alguns instantes.';

/** Todas as rotas POST /auth/* contam juntas; GET /busca tem a sua conta, e as consultas públicas (catálogo, produtos, mercados) outra. As demais rotas não são limitadas. */
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
  const limiteLeitura = app.createRateLimit({
    max: LIMITE_LEITURA_POR_MINUTO,
    timeWindow: 60_000,
    keyGenerator: (req) => `leitura|${req.ip}`,
  });
  const ROTAS_DE_LEITURA = new Set(['/catalogo', '/produtos', '/mercados', '/mercados/:id/produtos']);
  app.addHook('onRequest', async (req, reply) => {
    const rota = req.routeOptions.url;
    let limite: typeof limiteAuth | null = null;
    if (req.method === 'POST' && rota?.startsWith('/auth/')) limite = limiteAuth;
    else if (req.method === 'GET' && rota === '/busca') limite = limiteBusca;
    else if (req.method === 'GET' && rota && ROTAS_DE_LEITURA.has(rota)) limite = limiteLeitura;
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
  instancia,
  confiarNoProxy = false,
  fotos,
  fotosEmbutidas,
}: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({
    // O túnel (cloudflared) roda no mesmo computador e entrega a requisição pelo endereço local, trazendo o IP real de
    // quem acessou no cabeçalho X-Forwarded-For. Só confiamos nesse cabeçalho quando quem entrega é este próprio computador:
    // assim o limite de tentativas (R32) vale por pessoa, e ninguém de fora falsifica o IP.
    // Em hospedagem (Render etc.) quem entrega é o proxy da hospedagem, então ali se confia no cabeçalho de qualquer origem.
    trustProxy: confiarNoProxy ? true : ['127.0.0.1', '::1'],
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
  // Nova a cada início (salvo se informada): tokens de outro início deixam de valer (veja auth/guardas.ts).
  app.decorate('instancia', instancia ?? randomUUID());
  app.decorateRequest('usuario', null as never);

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ erro: 'Rota não encontrada' }));
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    // Banco do Azure acordando (ou conexão que caiu por um instante): não é defeito do servidor. Responde 503 com um aviso claro e
    // pede para tentar de novo; o app espera e repete sozinho.
    if (erroTransitorio(err)) {
      app.log.warn(`Banco indisponível por instantes: ${err.message}`);
      return reply.code(503).header('retry-after', '10').send({ erro: 'O servidor está acordando. Tente de novo em alguns instantes.' });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      app.log.error(err);
      return reply.code(500).send({ erro: 'Erro interno do servidor' });
    }
    return reply.code(status).send({ erro: 'Requisição inválida' });
  });

  // Para a hospedagem conferir se o servidor está de pé. Não toca no banco (não acorda o banco gratuito à toa).
  app.get('/saude', async () => ({ status: 'ok' }));

  await app.register(rotasAuth({ repo, email }));
  const aoMudarProdutos = () => fotos?.agendarPendentes();
  await app.register(rotasPlanilhas({ repo, aoMudarProdutos }));
  await app.register(rotasAdmin({ repo }));
  await app.register(rotasPainel({ repo, aoMudarProdutos }));
  await app.register(rotasBusca({ repo, ...(fotosEmbutidas ? { embutidas: fotosEmbutidas } : {}) }));
  await app.register(rotasConta({ repo }));
  await app.register(rotasMercados({ repo, ...(fotosEmbutidas ? { embutidas: fotosEmbutidas } : {}) }));
  await app.register(rotasMeusMercados({ repo }));
  await app.register(rotasFotos({ repo, ...(fotosEmbutidas ? { embutidas: fotosEmbutidas } : {}) }));
  await app.register(rotasPrivacidade());
  return app;
}
