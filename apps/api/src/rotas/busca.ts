import { listarProdutosNoCatalogo, type Catalogo, type GrupoProduto } from '@mercado/shared';
import type { FastifyPluginAsync } from 'fastify';
import { usuarioOpcional } from '../auth/guardas';
import { buscar, limitarCatalogo, montarCatalogo } from '../busca/buscar';
import { lerOrdenacaoEFiltros } from '../busca/parametros';
import type { FotosEmbutidas } from '../fotos/embutidas';
import { lembrar } from './lembrar';
import type { Repositorio } from '../repositorio';

/**
 * `cacheMs`: por quanto tempo a lista montada (catálogo e páginas da tela inicial) pode ser reaproveitada. Com milhares de produtos,
 * montar e agrupar tudo a cada pedido pesa no servidor gratuito; em produção vale 20 s (um envio de planilha aparece em até 20 s).
 * Nos testes é 0: tudo fresco.
 */
export function rotasBusca({
  repo,
  embutidas,
  cacheMs = 0,
  catalogo: catalogoDeFora,
  geracao = () => 0,
}: {
  repo: Repositorio;
  embutidas?: FotosEmbutidas;
  cacheMs?: number;
  /** O catálogo montado, compartilhado com as outras rotas (para montar uma vez só). */
  catalogo?: () => Promise<Catalogo>;
  /** Sobe a cada escrita no sistema: as páginas guardadas de outra geração são descartadas. */
  geracao?: () => number;
}): FastifyPluginAsync {
  return async (app) => {
    const catalogo = catalogoDeFora ?? lembrar(() => montarCatalogo(repo, embutidas), cacheMs, geracao);
    const paginas = new Map<string, () => Promise<{ grupos: GrupoProduto[]; total: number }>>();
    // Rotas PÚBLICAS: o app funciona sem login. Se a pessoa entrou (cliente), a busca fica ligada à conta dela;
    // senão, é registrada de forma anônima.
    app.get('/busca', async (req, reply) => {
      const { q, ordem = 'unidade' } = req.query as { q?: unknown; ordem?: unknown };
      if (typeof q !== 'string') return reply.code(400).send({ erro: 'Informe o que deseja buscar' });
      if (ordem !== 'unidade' && ordem !== 'embalagem') return reply.code(400).send({ erro: 'Ordem inválida' });
      // Ordenar (relevância, menor/maior preço, recentes) e filtros: veja busca/parametros.ts.
      const extras = lerOrdenacaoEFiltros(req.query as Record<string, unknown>);
      if (!extras.ok) return reply.code(400).send({ erro: extras.erro });
      const usuario = await usuarioOpcional(req);
      return buscar(repo, { q, ordem, ...(extras.criterio ? { criterio: extras.criterio } : {}), ...(extras.filtros ? { filtros: extras.filtros } : {}), ...(cacheMs > 0 ? { catalogo: await catalogo() } : embutidas ? { embutidas } : {}), ...(usuario?.papel === 'cliente' ? { usuarioId: usuario.id } : {}) });
    });

    // Lista da tela inicial do app (sem busca): produtos já agrupados e comparados entre os mercados, os vendidos em
    // mais de um mercado primeiro. `pagina` começa em 1; cada página tem PRODUTOS_POR_PAGINA_INICIO produtos.
    app.get('/produtos', async (req, reply) => {
      const { ordem = 'unidade', pagina: textoPagina = '1' } = req.query as { ordem?: unknown; pagina?: unknown };
      if (ordem !== 'unidade' && ordem !== 'embalagem') return reply.code(400).send({ erro: 'Ordem inválida' });
      const pagina = typeof textoPagina === 'string' && /^[1-9]\d*$/.test(textoPagina) ? Number(textoPagina) : NaN;
      if (!Number.isSafeInteger(pagina)) return reply.code(400).send({ erro: 'Página inválida' });
      const extras = lerOrdenacaoEFiltros(req.query as Record<string, unknown>);
      if (!extras.ok) return reply.code(400).send({ erro: extras.erro });
      const chave = `${ordem}:${pagina}:${JSON.stringify([extras.criterio ?? null, extras.filtros ?? null])}`;
      let pagina_ = paginas.get(chave);
      if (!pagina_) {
        pagina_ = lembrar(async () => listarProdutosNoCatalogo(await catalogo(), { ordem, pagina, ...(extras.criterio ? { criterio: extras.criterio } : {}), ...(extras.filtros ? { filtros: extras.filtros } : {}) }), cacheMs, geracao);
        if (cacheMs > 0 && paginas.size < 200) paginas.set(chave, pagina_);
      }
      return pagina_();
    });

    // Cópia de todos os mercados e produtos: o app do celular guarda e passa a buscar sozinho, até sem internet.
    app.get('/catalogo', async () => limitarCatalogo(await catalogo()));
  };
}
