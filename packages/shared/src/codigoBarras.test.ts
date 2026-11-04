import { describe, expect, it } from 'vitest';
import { validarCodigoBarras } from './codigoBarras';

describe('validarCodigoBarras', () => {
  it('aceita EAN-13 válido', () => {
    expect(validarCodigoBarras('7890070035629')).toEqual({ ok: true, codigo: '7890070035629' });
  });

  it('rejeita dígito verificador errado', () => {
    expect(validarCodigoBarras('7890070035620').ok).toBe(false);
  });

  it('rejeita entrada não numérica', () => {
    expect(validarCodigoBarras('12ab').ok).toBe(false);
  });

  it('aceita EAN-8 válido', () => {
    expect(validarCodigoBarras('96385074')).toEqual({ ok: true, codigo: '96385074' });
  });

  it('aceita número vindo de célula numérica', () => {
    expect(validarCodigoBarras(7890070035629)).toEqual({ ok: true, codigo: '7890070035629' });
  });

  it('completa com zeros à esquerda quando o número perdeu o zero inicial', () => {
    // EAN-13 válido que começa com 0; como número vira 123456789012 (12 dígitos)
    expect(validarCodigoBarras(123456789012)).toEqual({ ok: true, codigo: '0123456789012' });
  });

  it('completa mais de um zero perdido', () => {
    // 0000123456789 não é válido; 0000000000017 é (dígito verificador 7 sobre 000000000001)
    expect(validarCodigoBarras(17)).toEqual({ ok: true, codigo: '0000000000017' });
  });

  it('rejeita notação científica com motivo claro', () => {
    const r = validarCodigoBarras('7.89007E+12');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('notação científica');
  });
});
