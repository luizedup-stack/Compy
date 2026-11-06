import { listarProdutosNoCatalogo } from '@mercado/shared';
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

    // Lista da tela inicial do app (sem busca): produtos já agrupados e comparados entre os mercados, os vendidos em
    // mais de um mercado primeiro. `pagina` começa em 1; cada página tem PRODUTOS_POR_PAGINA_INICIO produtos.
    app.get('/produtos', { preHandler: exigirPapel('cliente') }, async (req, reply) => {
      const { ordem = 'unidade', pagina: textoPagina = '1' } = req.query as { ordem?: unknown; pagina?: unknown };
      if (ordem !== 'unidade' && ordem !== 'embalagem') return reply.code(400).send({ erro: 'Ordem inválida' });
      const pagina = typeof textoPagina === 'string' && /^[1-9]\d*$/.test(textoPagina) ? Number(textoPagina) : NaN;
      if (!Number.isSafeInteger(pagina)) return reply.code(400).send({ erro: 'Página inválida' });
      return listarProdutosNoCatalogo(await montarCatalogo(repo), { ordem, pagina });
    });

    // Cópia de todos os mercados e produtos: o app do celular guarda e passa a buscar sozinho, até sem internet.
    app.get('/catalogo', { preHandler: exigirPapel('cliente') }, async () => montarCatalogo(repo));
  };
}
