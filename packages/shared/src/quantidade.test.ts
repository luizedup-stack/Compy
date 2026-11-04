import { describe, expect, it } from 'vitest';
import { parseQuantidade, precoPorUnidade } from './quantidade';
import type { Quantidade } from './quantidade';

describe('parseQuantidade', () => {
  const casos: [string, number, string][] = [
    ['500 g', 0.5, 'kg'],
    ['5kg', 5, 'kg'],
    ['5 KG', 5, 'kg'],
    ['1,5 L', 1.5, 'L'],
    ['900 ml', 0.9, 'L'],
    ['12 rolos', 12, 'rolo'],
    ['12rolos', 12, 'rolo'],
    ['12 ROLOS', 12, 'rolo'],
    ['4 rolos', 4, 'rolo'],
    ['12 x 1 L', 12, 'L'],
    ['2 x 500 g', 1, 'kg'],
    ['12 un', 12, 'un'],
    ['3 unidades', 3, 'un'],
    ['dúzia', 12, 'un'],
    ['1 dúzia', 12, 'un'],
  ];

  it.each(casos)('lê %j como %d %s', (entrada, valor, unidade) => {
    expect(parseQuantidade(entrada)).toEqual({ texto: entrada, valor, unidade });
  });

  it.each(['', 'abc', 'leve 3 pague 2', '0 kg', '12 rolos de 30 m'])(
    'retorna null para %j',
    (entrada) => {
      expect(parseQuantidade(entrada)).toBeNull();
    },
  );

  it('retorna null para null e undefined', () => {
    expect(parseQuantidade(null)).toBeNull();
    expect(parseQuantidade(undefined)).toBeNull();
  });
});

describe('precoPorUnidade', () => {
  const rolos = (valor: number): Quantidade => ({ texto: `${valor} rolos`, valor, unidade: 'rolo' });

  it('divide o preço pela quantidade e arredonda para 2 casas', () => {
    expect(precoPorUnidade(14.9, rolos(12))).toBe(1.24);
    expect(precoPorUnidade(6.2, rolos(4))).toBe(1.55);
  });

  it('arredonda metade para cima', () => {
    expect(precoPorUnidade(16.5, rolos(12))).toBe(1.38);
  });

  it('retorna null sem quantidade', () => {
    expect(precoPorUnidade(12.9, null)).toBeNull();
  });
});
