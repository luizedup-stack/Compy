import type { Catalogo } from '@mercado/shared';
import { describe, expect, it } from 'vitest';
import { limitarCatalogo } from './buscar';

const oferta = (mercadoId: number, codigoBarras: string) => ({
  mercadoId, codigoBarras, nome: `P ${codigoBarras}`, nomeNorm: `p ${codigoBarras}`, preco: 1, quantidadeTexto: null, quantidadeValor: null,
  quantidadeUnidade: null, precoAtualizadoEm: '2026-11-01T00:00:00.000Z',
});

describe('limitarCatalogo (cópia do celular)', () => {
  const base = (ofertas: Catalogo['ofertas']): Catalogo => ({ geradoEm: 'x', mercados: [], ofertas, comFoto: ['A', 'B', 'C'], fotosIlustrativas: ['C'] });

  it('catálogo pequeno passa inteiro, sem a marca de parcial', () => {
    const c = base([oferta(1, 'A'), oferta(2, 'A')]);
    expect(limitarCatalogo(c, 10)).toBe(c);
  });

  it('grande: leva primeiro os vendidos em mais mercados, com todas as ofertas deles; marca como parcial e filtra as fotos', () => {
    const c = base([oferta(1, 'A'), oferta(1, 'B'), oferta(2, 'B'), oferta(3, 'B'), oferta(1, 'C'), oferta(2, 'C')]);
    const r = limitarCatalogo(c, 5);
    expect(r.parcial).toBe(true);
    expect(r.ofertas.map((o) => `${o.mercadoId}:${o.codigoBarras}`)).toEqual(['1:B', '2:B', '3:B', '1:C', '2:C']);
    expect(r.comFoto).toEqual(['B', 'C']);
    expect(r.fotosIlustrativas).toEqual(['C']);
  });

  it('nunca passa do máximo, mesmo que um produto grande não caiba', () => {
    const r = limitarCatalogo(base([oferta(1, 'A'), oferta(2, 'A'), oferta(3, 'A'), oferta(1, 'B')]), 2);
    expect(r.ofertas).toHaveLength(1);
    expect(r.ofertas[0]!.codigoBarras).toBe('B');
  });
});
