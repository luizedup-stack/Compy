import type { Oferta } from '@mercado/shared';

/**
 * Formatadores de texto da busca. Escritos à mão (sem Intl/toLocaleString) para dar o mesmo resultado
 * no Hermes do celular e no jest, independente dos dados de idioma que o motor JavaScript traz.
 */

/** 14.9 → "R$ 14,90"; 1234.5 → "R$ 1.234,50". Sempre 2 casas, "." nos milhares e "," nos centavos. */
export function formatarPreco(valor: number): string {
  const centavos = Math.round(Math.abs(valor) * 100);
  const inteiros = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const resto = String(centavos % 100).padStart(2, '0');
  return `${centavos > 0 && valor < 0 ? '-' : ''}R$ ${inteiros},${resto}`;
}

/** 0 → "atualizado hoje"; 1 → "atualizado há 1 dia"; n → "atualizado há n dias". Negativo vale 0; fração é descartada. */
export function textoIdade(dias: number): string {
  const inteiros = Number.isFinite(dias) ? Math.max(0, Math.floor(dias)) : 0;
  if (inteiros === 0) return 'atualizado hoje';
  return `atualizado há ${inteiros} ${inteiros === 1 ? 'dia' : 'dias'}`;
}

/** "R$ 1,24 por rolo", "R$ 5,80 por kg", "R$ 2,50 por unidade"; nulo quando a oferta não tem preço por unidade. */
export function textoPorUnidade(oferta: Oferta): string | null {
  if (oferta.precoPorUnidade === null || oferta.unidade === null) return null;
  const unidade = oferta.unidade === 'un' ? 'unidade' : oferta.unidade;
  return `${formatarPreco(oferta.precoPorUnidade)} por ${unidade}`;
}
