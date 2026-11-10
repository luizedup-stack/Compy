// Lê, da consulta da URL (?ordenar=...&precoMin=...), a ordenação e os filtros da busca e da lista de produtos.
// Valor inválido não é "arrumado": a rota responde 400 com a mensagem.
import { CRITERIOS_ORDEM, type CriterioOrdem, type Filtros, type Unidade } from '@mercado/shared';

const UNIDADES: readonly Unidade[] = ['kg', 'L', 'un', 'rolo'];
const MAX_COMERCIOS = 50;

export type Parametros = { ok: true; criterio?: CriterioOrdem; filtros?: Filtros } | { ok: false; erro: string };

/** Número decimal (aceita vírgula) não negativo e finito; `undefined` se o campo não veio; `null` se veio inválido. */
function numero(v: unknown): number | undefined | null {
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string' || v.length > 20) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Texto único da consulta (se vier repetido, fica a primeira). */
const texto = (v: unknown): string | undefined => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined);

export function lerOrdenacaoEFiltros(query: Record<string, unknown>): Parametros {
  const ordenar = texto(query.ordenar);
  if (ordenar !== undefined && !(CRITERIOS_ORDEM as readonly string[]).includes(ordenar)) return { ok: false, erro: 'Ordenação inválida' };

  const filtros: Filtros = {};
  for (const [campo, nome] of [
    ['precoMin', 'Preço mínimo'],
    ['precoMax', 'Preço máximo'],
    ['qtdMin', 'Quantidade mínima'],
    ['qtdMax', 'Quantidade máxima'],
  ] as const) {
    const n = numero(texto(query[campo]));
    if (n === null) return { ok: false, erro: `${nome} inválido` };
    if (n === undefined) continue;
    if (campo === 'precoMin') filtros.precoMin = n;
    else if (campo === 'precoMax') filtros.precoMax = n;
    else if (campo === 'qtdMin') filtros.quantidadeMin = n;
    else filtros.quantidadeMax = n;
  }
  const unidade = texto(query.unidade);
  if (unidade !== undefined && unidade !== '') {
    if (!(UNIDADES as readonly string[]).includes(unidade)) return { ok: false, erro: 'Unidade inválida' };
    filtros.unidade = unidade as Unidade;
  }
  const comercios = texto(query.comercios);
  if (comercios !== undefined && comercios !== '') {
    const ids = comercios.split(',');
    if (ids.length > MAX_COMERCIOS || !ids.every((i) => /^\d{1,9}$/.test(i))) return { ok: false, erro: 'Comércios inválidos' };
    filtros.mercadoIds = ids.map(Number);
  }
  if (texto(query.promocao) === '1') filtros.soPromocao = true;
  if (texto(query.comparaveis) === '1') filtros.soComparaveis = true;

  return {
    ok: true,
    ...(ordenar !== undefined ? { criterio: ordenar as CriterioOrdem } : {}),
    ...(Object.keys(filtros).length > 0 ? { filtros } : {}),
  };
}
