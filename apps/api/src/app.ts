import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
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
}

export async function construirApp({ repo, email, jwtSecret, logger = false }: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({ logger });

  // Liberado para qualquer origem: serve ao desenvolvimento (painel web e app mobile).
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(jwt, { secret: jwtSecret, sign: { expiresIn: '7d' } });
  // O limite vale por arquivo; acima dele a rota responde 422 (veja rotas/planilhas.ts).
  await app.register(multipart, { limits: { fileSize: LIMITE_BYTES, files: 1 } });
  app.decorate('repo', repo);
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
