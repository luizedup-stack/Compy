import { describe, expect, it } from 'vitest';
import { normalizarTexto } from './texto';

describe('normalizarTexto', () => {
  it('remove acentos, caixa e espaços extras', () => {
    expect(normalizarTexto('  PAPEL Higiênico  Fox ')).toBe('papel higienico fox');
  });

  it('troca pontuação por espaço', () => {
    expect(normalizarTexto('Papel Hig. X')).toBe('papel hig x');
    expect(normalizarTexto('Det. Líq.')).toBe('det liq');
  });
});
