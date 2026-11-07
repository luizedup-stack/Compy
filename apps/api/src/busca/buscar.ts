import {
  buscarNoCatalogo,
  consultaValida,
  precoPorUnidadeDaOferta as precoPorUnidadeDeUmaOferta,
  type Catalogo,
  type GrupoProduto,
  type Unidade,
} from '@mercado/shared';
import type { OfertaArmazenada, Repositorio } from '../repositorio';

export { LIMITE_GRUPOS_BUSCA, type OrdemBusca } from '@mercado/shared';
import type { OrdemBusca } from '@mercado/shared';

const MAX_TERMO_REGISTRADO = 200;

/** Preço por unidade de uma oferta guardada (a partir da quantidade entendida; `null` se não houver). */
export function precoPorUnidadeDaOferta(o: OfertaArmazenada): {
  precoPorUnidade: number | null;
  unidade: Unidade | null;
} {
  return precoPorUnidadeDeUmaOferta(o);
}

/** Cópia dos mercados ativos e das ofertas disponíveis deles, no formato que o app do celular guarda (GET /catalogo). */
export async function montarCatalogo(repo: Repositorio): Promise<Catalogo> {
  const mercados = new Map<number, { id: number; nome: string; endereco: string }>();
  const ofertas: Catalogo['ofertas'] = [];
  for (const { oferta: o, mercado: m } of await repo.listarOfertasParaBusca()) {
    mercados.set(m.id, { id: m.id, nome: m.nome, endereco: m.endereco });
    ofertas.push({
      mercadoId: o.mercadoId,
      codigoBarras: o.codigoBarras,
      nome: o.nome,
      nomeNorm: o.nomeNorm,
      preco: o.preco,
      quantidadeTexto: o.quantidadeTexto,
      quantidadeValor: o.quantidadeValor,
      quantidadeUnidade: o.quantidadeUnidade,
      precoAtualizadoEm: o.precoAtualizadoEm.toISOString(),
    });
  }
  // Mercados ativos sem nenhuma oferta disponível também entram (aparecem com 0 produtos).
  for (const m of await repo.listarMercados()) {
    if (m.status === 'ativo' && !mercados.has(m.id)) mercados.set(m.id, { id: m.id, nome: m.nome, endereco: m.endereco });
  }
  return { geradoEm: new Date().toISOString(), mercados: [...mercados.values()], ofertas, comFoto: await repo.listarCodigosComFoto() };
}

/**
 * Busca produtos pelo nome, agrupa o mesmo código de barras entre os mercados e ordena pelo preço
 * (a conta mora em packages/shared, a mesma que o app usa sem internet). Uma consulta curta demais, longa demais
 * ou com palavras demais devolve `[]` e não é registrada; toda outra busca é registrada, mesmo sem resultado.
 * Devolve no máximo LIMITE_GRUPOS_BUSCA grupos; o registro conta os grupos e mercados devolvidos.
 */
export async function buscar(
  repo: Repositorio,
  { q, ordem, usuarioId }: { q: string; ordem: OrdemBusca; usuarioId?: number },
): Promise<GrupoProduto[]> {
  if (!consultaValida(q)) return [];
  const grupos = buscarNoCatalogo(await montarCatalogo(repo), { q, ordem });

  const mercados = new Set<number>();
  for (const g of grupos) for (const o of g.ofertas) mercados.add(o.mercadoId);
  await repo.registrarBusca({
    usuarioId: usuarioId ?? null,
    termo: q.trim().slice(0, MAX_TERMO_REGISTRADO),
    resultados: grupos.length,
    mercadosDistintos: mercados.size,
  });
  return grupos;
}
