import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { rotasAuth } from './auth/rotas';
import type { EmailSender } from './email';
import type { Repositorio } from './repositorio';

export interface OpcoesApp {
  repo: Repositorio;
  email: EmailSender;
  jwtSecret: string;
}

export async function construirApp({ repo, email, jwtSecret }: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Liberado para qualquer origem: serve ao desenvolvimento (painel web e app mobile).
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(jwt, { secret: jwtSecret, sign: { expiresIn: '7d' } });
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
  return app;
}
