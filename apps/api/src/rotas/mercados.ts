import { caminhoDaFoto, mercadosDoCatalogo, type Catalogo, type ProdutoMercado } from '@mercado/shared';
import type { FastifyPluginAsync } from 'fastify';
import { precoPorUnidadeDaOferta } from '../busca/buscar';
import type { FotosEmbutidas } from '../fotos/embutidas';
import type { OfertaArmazenada, Repositorio } from '../repositorio';
import { diasDesde, precoDesatualizado } from '../tempo';

const POR_PAGINA = 50;
const MSG_NAO_ACHOU = 'Mercado não encontrado';

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const aProdutoMercado = (o: OfertaArmazenada, agora: Date, comFoto: Set<string>, ilustrativas: Set<string>, proprias: Map<string, Date>): ProdutoMercado => ({
  codigoBarras: o.codigoBarras,
  nome: o.nome,
  preco: o.preco,
  quantidadeTexto: o.quantidadeTexto,
  ...precoPorUnidadeDaOferta(o),
  atualizadoEm: o.precoAtualizadoEm.toISOString(),
  diasDesdeAtualizacao: diasDesde(o.precoAtualizadoEm, agora),
  desatualizado: precoDesatualizado(o.precoAtualizadoEm, agora),
  // A foto que o próprio mercado enviou só para ele (o produto já tinha outra) passa na frente, na lista deste mercado.
  foto: proprias.has(o.codigoBarras)
    ? caminhoDaFoto(o.codigoBarras, { mercadoId: o.mercadoId, versao: (proprias.get(o.codigoBarras) as Date).getTime() })
    : comFoto.has(o.codigoBarras)
      ? caminhoDaFoto(o.codigoBarras)
      : null,
  ...(ilustrativas.has(o.codigoBarras) && !proprias.has(o.codigoBarras) ? { fotoIlustrativa: true } : {}),
});

export function rotasMercados({
  repo,
  embutidas,
  catalogo,
}: {
  repo: Repositorio;
  embutidas?: FotosEmbutidas;
  /** O catálogo montado e reaproveitado por um tempo (só em produção): com ele a lista de mercados não precisa contar produto por produto no banco. */
  catalogo?: () => Promise<Catalogo>;
}): FastifyPluginAsync {
  return async (app) => {
    // Rotas públicas (o app funciona sem login).
    app.get('/mercados', async () => {
      if (catalogo) return mercadosDoCatalogo(await catalogo());
      const ativos = (await repo.listarMercados()).filter((m) => m.status === 'ativo');
      ativos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id - b.id);
      return Promise.all(
        ativos.map(async (m) => ({
          id: m.id,
          nome: m.nome,
          endereco: m.endereco,
          totalProdutos: (await repo.listarOfertasDoMercado(m.id)).filter((o) => o.disponivel).length,
        })),
      );
    });

    app.get('/mercados/:id/produtos', async (req, reply) => {
      const { id } = req.params as { id: string };
      const mercado = /^\d+$/.test(id) ? await repo.acharMercado(Number(id)) : null;
      if (!mercado || mercado.status !== 'ativo') return reply.code(404).send({ erro: MSG_NAO_ACHOU });

      const { pagina: texto = '1' } = req.query as { pagina?: unknown };
      const pagina = typeof texto === 'string' && /^[1-9]\d*$/.test(texto) ? Number(texto) : NaN;
      if (!Number.isSafeInteger(pagina)) return reply.code(400).send({ erro: 'Página inválida' });

      const ofertas = (await repo.listarOfertasDoMercado(mercado.id))
        .filter((o) => o.disponivel)
        .sort((a, b) => comparar(a.nomeNorm, b.nomeNorm) || comparar(a.codigoBarras, b.codigoBarras));
      const agora = new Date();
      const comFoto = new Set(await repo.listarCodigosComFoto());
      const ilustrativas = new Set(await repo.listarCodigosComFotoIlustrativa());
      if (embutidas) {
        for (const o of ofertas) {
          if (comFoto.has(o.codigoBarras) || !embutidas.imagemDoNome(o.nome)) continue;
          comFoto.add(o.codigoBarras);
          ilustrativas.add(o.codigoBarras);
        }
      }
      const inicio = (pagina - 1) * POR_PAGINA;
      const daPagina = ofertas.slice(inicio, inicio + POR_PAGINA);
      const proprias = new Map((await repo.listarFotosDoMercado(mercado.id, daPagina.map((o) => o.codigoBarras))).map((f) => [f.codigoBarras, f.atualizadaEm]));
      return {
        itens: daPagina.map((o) => aProdutoMercado(o, agora, comFoto, ilustrativas, proprias)),
        total: ofertas.length,
      };
    });
  };
}
