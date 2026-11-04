import { describe, expect, it } from 'vitest';
import { similaridade } from './similaridade';

describe('similaridade (trigramas como o pg_trgm)', () => {
  it('papl x papel dá 3/8', () => {
    expect(similaridade('papl', 'papel')).toBeCloseTo(0.375, 2);
  });
  it('palavras idênticas dão 1', () => {
    expect(similaridade('arroz', 'arroz')).toBe(1);
  });
  it('palavras sem relação dão quase 0', () => {
    expect(similaridade('arroz', 'sabao')).toBeLessThan(0.1);
  });
  it('é simétrica', () => {
    expect(similaridade('higienco', 'higienico')).toBe(similaridade('higienico', 'higienco'));
  });
  it('texto vazio não casa com nada (e não dá erro)', () => {
    expect(similaridade('', 'arroz')).toBe(0);
    expect(similaridade('', '')).toBe(0);
  });
});
