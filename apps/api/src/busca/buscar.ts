import {
  buscarNoCatalogo,
  consultaValida,
  precoPorUnidadeDaOferta as precoPorUnidadeDeUmaOferta,
  type Catalogo,
  type GrupoProduto,
  type Unidade,
} from '@mercado/shared';
import type { FotosEmbutidas } from '../fotos/embutidas';
import type { OfertaArmazenada, Repositorio } from '../repositorio';

export { LIMITE_GRUPOS_BUSCA, type OrdemBusca } from '@mercado/shared';
import type { CriterioOrdem, Filtros, OrdemBusca } from '@mercado/shared';

const MAX_TERMO_REGISTRADO = 200;

/** Preço por unidade de uma oferta guardada (a partir da quantidade entendida; `null` se não houver). */
export function precoPorUnidadeDaOferta(o: OfertaArmazenada): {
  precoPorUnidade: number | null;
  unidade: Unidade | null;
} {
  return precoPorUnidadeDeUmaOferta(o);
}

/** Cópia dos mercados ativos e das ofertas disponíveis deles, no formato que o app do celular guarda (GET /catalogo). */
export async function montarCatalogo(repo: Repositorio, embutidas?: FotosEmbutidas): Promise<Catalogo> {
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
      // Promoção (só quando existe, para a cópia não crescer à toa): o preço vale entre início e fim, e só se for menor que o normal.
      ...(o.promocaoPreco !== null ? { precoPromocional: o.promocaoPreco, promocaoInicio: o.promocaoInicio?.toISOString() ?? null, promocaoFim: o.promocaoFim?.toISOString() ?? null } : {}),
    });
  }
  // Mercados ativos sem nenhuma oferta disponível também entram (aparecem com 0 produtos).
  for (const m of await repo.listarMercados()) {
    if (m.status === 'ativo' && !mercados.has(m.id)) mercados.set(m.id, { id: m.id, nome: m.nome, endereco: m.endereco });
  }
  const comFoto = new Set(await repo.listarCodigosComFoto());
  const fotosIlustrativas = new Set(await repo.listarCodigosComFotoIlustrativa());
  // Produto sem nenhuma foto guardada: usa a do tipo, direto do banco de fotos do sistema (veja fotos/embutidas.ts).
  if (embutidas) {
    for (const o of ofertas) {
      if (comFoto.has(o.codigoBarras) || !embutidas.imagemDoNome(o.nome)) continue;
      comFoto.add(o.codigoBarras);
      fotosIlustrativas.add(o.codigoBarras);
    }
  }
  return { geradoEm: new Date().toISOString(), mercados: [...mercados.values()], ofertas, comFoto: [...comFoto], fotosIlustrativas: [...fotosIlustrativas] };
}

/**
 * Quantas ofertas, no máximo, vão na cópia que o app guarda no celular (GET /catalogo). A busca no servidor não tem esse limite.
 * Com o limite antigo (8.000) a cópia deixava de fora a maior parte de cada mercado grande (o Mambo, por exemplo, tinha 14 mil produtos no
 * painel e só ~3 mil no app quando ele usava a cópia). Agora cabe tudo o que temos hoje (~52 mil ofertas): a resposta sai compactada (gzip, ~1,7 MB)
 * e o app guarda a cópia compactada. Passou disso, ficam os produtos vendidos em mais mercados (veja limitarCatalogo).
 */
export const LIMITE_OFERTAS_COPIA = 60_000;

/**
 * Reduz o catálogo à cópia do celular quando ele é grande demais (com todos os produtos das redes passaria de 10 MB): ficam os produtos
 * vendidos em mais mercados (os que servem para comparar) e, no empate, os que apareceram primeiro. Cada produto escolhido leva todas as suas ofertas.
 */
export function limitarCatalogo(catalogo: Catalogo, maximo = LIMITE_OFERTAS_COPIA): Catalogo {
  if (catalogo.ofertas.length <= maximo) return catalogo;
  const porCodigo = new Map<string, Catalogo['ofertas']>();
  for (const o of catalogo.ofertas) {
    const lista = porCodigo.get(o.codigoBarras);
    if (lista) lista.push(o);
    else porCodigo.set(o.codigoBarras, [o]);
  }
  const ordem = [...porCodigo.entries()]
    .map(([codigo, ofertas], posicao) => ({ codigo, ofertas, mercados: new Set(ofertas.map((o) => o.mercadoId)).size, posicao }))
    .sort((a, b) => b.mercados - a.mercados || a.posicao - b.posicao);
  const escolhidos = new Set<string>();
  const ofertas: Catalogo['ofertas'] = [];
  for (const item of ordem) {
    if (ofertas.length + item.ofertas.length > maximo) continue;
    escolhidos.add(item.codigo);
    ofertas.push(...item.ofertas);
  }
  return {
    ...catalogo,
    ofertas,
    ...(catalogo.comFoto ? { comFoto: catalogo.comFoto.filter((c) => escolhidos.has(c)) } : {}),
    ...(catalogo.fotosIlustrativas ? { fotosIlustrativas: catalogo.fotosIlustrativas.filter((c) => escolhidos.has(c)) } : {}),
    parcial: true,
  };
}

/**
 * Busca produtos pelo nome, agrupa o mesmo código de barras entre os mercados e ordena pelo preço
 * (a conta mora em packages/shared, a mesma que o app usa sem internet). Uma consulta curta demais, longa demais
 * ou com palavras demais devolve `[]` e não é registrada; toda outra busca é registrada, mesmo sem resultado.
 * Devolve no máximo LIMITE_GRUPOS_BUSCA grupos; o registro conta os grupos e mercados devolvidos.
 */
export async function buscar(
  repo: Repositorio,
  { q, ordem, criterio, filtros, usuarioId, embutidas, catalogo }: { q: string; ordem: OrdemBusca; criterio?: CriterioOrdem; filtros?: Filtros; usuarioId?: number; embutidas?: FotosEmbutidas; catalogo?: Catalogo },
): Promise<GrupoProduto[]> {
  if (!consultaValida(q)) return [];
  const grupos = buscarNoCatalogo(catalogo ?? (await montarCatalogo(repo, embutidas)), { q, ordem, ...(criterio ? { criterio } : {}), ...(filtros ? { filtros } : {}) });

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
