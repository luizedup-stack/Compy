import { DIAS_PRECO_VELHO } from '@mercado/shared';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Dias inteiros (arredondado para baixo) entre `data` e `agora`. */
export function diasDesde(data: Date, agora: Date = new Date()): number {
  return Math.floor((agora.getTime() - data.getTime()) / MS_POR_DIA);
}

/** Preço desatualizado: mais de `DIAS_PRECO_VELHO` dias inteiros (7 dias exatos ainda vale; 8 não). */
export function precoDesatualizado(data: Date, agora: Date = new Date()): boolean {
  return diasDesde(data, agora) > DIAS_PRECO_VELHO;
}
