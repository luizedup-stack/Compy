import type { FastifyPluginAsync } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import { buscar } from '../busca/buscar';
import type { Repositorio } from '../repositorio';

export function rotasBusca({ repo }: { repo: Repositorio }): FastifyPluginAsync {
  return async (app) => {
    app.get('/busca', { preHandler: exigirPapel('cliente') }, async (req, reply) => {
      const { q, ordem = 'unidade' } = req.query as { q?: unknown; ordem?: unknown };
      if (typeof q !== 'string') return reply.code(400).send({ erro: 'Informe o que deseja buscar' });
      if (ordem !== 'unidade' && ordem !== 'embalagem') return reply.code(400).send({ erro: 'Ordem inválida' });
      return buscar(repo, { q, ordem, usuarioId: req.usuario.id });
    });
  };
}
