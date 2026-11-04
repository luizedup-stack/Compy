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

  it('recompõe o zero perdido de número de 12 dígitos', () => {
    // EAN-13 válido que começa com 0; como número vira 123456789012 (12 dígitos)
    expect(validarCodigoBarras(123456789012)).toEqual({ ok: true, codigo: '0123456789012' });
  });

  it('devolve UPC-A de 12 dígitos (string) na forma de 13 dígitos', () => {
    expect(validarCodigoBarras('123456789012')).toEqual({ ok: true, codigo: '0123456789012' });
  });

  it('recompõe dois zeros perdidos (número de 11 dígitos)', () => {
    // 0012345678905 é um EAN-13 válido que começa com 00
    expect(validarCodigoBarras(12345678905)).toEqual({ ok: true, codigo: '0012345678905' });
  });

  it('rejeita códigos só com zeros', () => {
    for (const entrada of [0, '0', '00', '0000000000000']) {
      const r = validarCodigoBarras(entrada);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toContain('zeros');
    }
  });

  it('rejeita número curto que só validaria com zeros à esquerda', () => {
    expect(validarCodigoBarras(17).ok).toBe(false);
  });

  it('não completa com zeros códigos de 9 ou 10 dígitos', () => {
    // as versões completadas até 13 dígitos são válidas, mas os originais não devem ser aceitos
    expect(validarCodigoBarras('0000123456784').ok).toBe(true);
    expect(validarCodigoBarras('123456784').ok).toBe(false);
    expect(validarCodigoBarras('0001234567895').ok).toBe(true);
    expect(validarCodigoBarras('1234567895').ok).toBe(false);
  });

  it('rejeita vazio e só espaços como obrigatório', () => {
    for (const entrada of ['', '   ']) {
      const r = validarCodigoBarras(entrada);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe('Código de barras obrigatório');
    }
  });

  it('rejeita notação científica com motivo claro', () => {
    const r = validarCodigoBarras('7.89007E+12');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('notação científica');
  });
});
