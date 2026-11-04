import { describe, expect, it } from 'vitest';
import { diasDesde, precoDesatualizado } from './tempo';

const AGORA = new Date('2026-11-04T12:00:00.000Z');
const antes = (dias: number, extraMs = 0) => new Date(AGORA.getTime() - dias * 86_400_000 - extraMs);

describe('diasDesde', () => {
  it('mesma hora → 0', () => expect(diasDesde(AGORA, AGORA)).toBe(0));
  it('23h59 → 0 (arredonda para baixo)', () => {
    expect(diasDesde(new Date(AGORA.getTime() - (86_400_000 - 60_000)), AGORA)).toBe(0);
  });
  it('exatamente 1 dia → 1', () => expect(diasDesde(antes(1), AGORA)).toBe(1));
  it('7 dias e meio → 7', () => expect(diasDesde(antes(7, 43_200_000), AGORA)).toBe(7));
  it('sem o segundo argumento usa a hora atual', () => {
    expect(diasDesde(new Date(Date.now() - 3 * 86_400_000 - 1000))).toBe(3);
  });
});

describe('precoDesatualizado', () => {
  it('6 dias → não', () => expect(precoDesatualizado(antes(6), AGORA)).toBe(false));
  it('exatamente 7 dias → não', () => expect(precoDesatualizado(antes(7), AGORA)).toBe(false));
  it('7 dias e 23h → não', () => {
    expect(precoDesatualizado(antes(7, 23 * 3_600_000), AGORA)).toBe(false);
  });
  it('8 dias → sim', () => expect(precoDesatualizado(antes(8), AGORA)).toBe(true));
  it('sem o segundo argumento usa a hora atual', () => {
    expect(precoDesatualizado(new Date())).toBe(false);
    expect(precoDesatualizado(new Date(Date.now() - 9 * 86_400_000))).toBe(true);
  });
});
