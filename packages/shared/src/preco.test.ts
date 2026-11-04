import { describe, expect, it } from 'vitest';
import { parsePreco } from './preco';

describe('parsePreco', () => {
  it('lê vírgula e ponto como decimal', () => {
    expect(parsePreco('14,90')).toBe(14.9);
    expect(parsePreco('14.90')).toBe(14.9);
  });

  it('lê formato brasileiro com R$ e milhar', () => {
    expect(parsePreco('R$ 1.234,56')).toBe(1234.56);
  });

  it('aceita número', () => {
    expect(parsePreco(14.9)).toBe(14.9);
  });

  it('retorna null para zero, negativo, texto e vazio', () => {
    expect(parsePreco('0')).toBeNull();
    expect(parsePreco('-3')).toBeNull();
    expect(parsePreco('abc')).toBeNull();
    expect(parsePreco('')).toBeNull();
  });
});
