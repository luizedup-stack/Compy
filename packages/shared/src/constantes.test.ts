import { describe, expect, it } from 'vitest';
import { ABA_MERCADO, COLUNAS_PRODUTOS, DIAS_PRECO_VELHO } from './constantes';

describe('constantes', () => {
  it('COLUNAS_PRODUTOS segue a ordem do spec', () => {
    expect([...COLUNAS_PRODUTOS]).toEqual([
      'Código de barras',
      'Produto',
      'Preço',
      'Quantidade',
      'Categoria',
      'Disponível',
    ]);
  });

  it('DIAS_PRECO_VELHO é 7', () => {
    expect(DIAS_PRECO_VELHO).toBe(7);
  });

  it('ABA_MERCADO é Mercado', () => {
    expect(ABA_MERCADO).toBe('Mercado');
  });
});
