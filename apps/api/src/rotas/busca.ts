import type { FastifyPluginAsync } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import { buscar, montarCatalogo } from '../busca/buscar';
import type { Repositorio } from '../repositorio';

export function rotasBusca({ repo }: { repo: Repositorio }): FastifyPluginAsync {
  return async (app) => {
    app.get('/busca', { preHandler: exigirPapel('cliente') }, async (req, reply) => {
      const { q, ordem = 'unidade' } = req.query as { q?: unknown; ordem?: unknown };
      if (typeof q !== 'string') return reply.code(400).send({ erro: 'Informe o que deseja buscar' });
      if (ordem !== 'unidade' && ordem !== 'embalagem') return reply.code(400).send({ erro: 'Ordem inválida' });
      return buscar(repo, { q, ordem, usuarioId: req.usuario.id });
    });

    // Cópia de todos os mercados e produtos: o app do celular guarda e passa a buscar sozinho, até sem internet.
    app.get('/catalogo', { preHandler: exigirPapel('cliente') }, async () => montarCatalogo(repo));
  };
}
