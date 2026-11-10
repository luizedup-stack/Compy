import { describe, expect, expectTypeOf, it } from 'vitest';
import { ABA_MERCADO, COLUNAS_PRODUTOS, DIAS_PRECO_VELHO } from './constantes';
import type { RelatorioImportacao } from './index';

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

describe('RelatorioImportacao', () => {
  it('é exportado pelo índice do shared com o formato combinado', () => {
    const relatorio: RelatorioImportacao = {
      mercadoId: 1,
      mercadoCriado: true,
      importadas: 2,
      erros: [{ linha: 3, motivo: 'Preço inválido' }],
    };
    expectTypeOf(relatorio).toEqualTypeOf<{
      mercadoId: number;
      mercadoCriado: boolean;
      importadas: number;
      erros: { linha: number; motivo: string }[];
      promocoes?: number;
      retida?: boolean;
      pedido?: { id: number; quantidade: number; valorUnitarioCentavos: number; totalCentavos: number };
      fotosColadas?: number;
    }>();
    expect(relatorio.erros[0]).toEqual({ linha: 3, motivo: 'Preço inválido' });
  });
});
