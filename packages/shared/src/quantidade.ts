import type { Unidade } from './constantes';

export interface Quantidade {
  texto: string;
  /** Já na unidade de exibição: 500 g vira 0,5 kg. */
  valor: number;
  unidade: Unidade;
}

interface Alias {
  unidade: Unidade;
  /** Divisor para levar o número digitado à unidade de exibição (g -> kg). */
  divisor: number;
}

const kg: Alias = { unidade: 'kg', divisor: 1 };
const g: Alias = { unidade: 'kg', divisor: 1000 };
const litro: Alias = { unidade: 'L', divisor: 1 };
const ml: Alias = { unidade: 'L', divisor: 1000 };
const un: Alias = { unidade: 'un', divisor: 1 };
const rolo: Alias = { unidade: 'rolo', divisor: 1 };

const ALIASES: Record<string, Alias> = {
  kg, quilo: kg, quilos: kg, quilograma: kg, quilogramas: kg,
  g, gr: g, grama: g, gramas: g,
  l: litro, lt: litro, litro: litro, litros: litro,
  ml,
  un, und: un, unid: un, unidade: un, unidades: un,
  rolo, rolos: rolo,
};

const DUZIA = 12;

// [multiplicador x] [número] unidade, com espaços opcionais e vírgula ou ponto decimal.
const PADRAO = /^(?:(\d+)\s*x\s*)?(?:(\d+(?:[.,]\d+)?)\s*)?([\p{L}]+)$/u;

const ESCALA_ARREDONDAMENTO = 1e6;

export function parseQuantidade(texto: string | null | undefined): Quantidade | null {
  if (!texto) return null;
  const partes = PADRAO.exec(texto.trim().toLowerCase());
  if (!partes) return null;

  const [, multiplicadorTexto, numeroTexto, nomeUnidade] = partes;
  const multiplicador = multiplicadorTexto ? Number(multiplicadorTexto) : 1;
  let numero = numeroTexto ? Number(numeroTexto.replace(',', '.')) : undefined;
  let alias: Alias | undefined;

  if (nomeUnidade === 'duzia' || nomeUnidade === 'dúzia') {
    alias = un;
    numero = (numero ?? 1) * DUZIA;
  } else if (Object.hasOwn(ALIASES, nomeUnidade)) {
    alias = ALIASES[nomeUnidade];
  }
  if (!alias || numero === undefined) return null;

  // Divide uma única vez e arredonda a 6 casas para evitar ruído de ponto flutuante.
  const bruto = (multiplicador * numero) / alias.divisor;
  const valor = Math.round(bruto * ESCALA_ARREDONDAMENTO) / ESCALA_ARREDONDAMENTO;
  if (!(valor > 0)) return null;

  return { texto, valor, unidade: alias.unidade };
}

export function precoPorUnidade(preco: number, q: Quantidade | null): number | null {
  if (!q || !(q.valor > 0)) return null;
  // toPrecision elimina ruído de ponto flutuante antes de arredondar (metade para cima).
  return Math.round(Number(((preco / q.valor) * 100).toPrecision(12))) / 100;
}
