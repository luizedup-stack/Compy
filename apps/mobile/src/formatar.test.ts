import type { Oferta } from '@mercado/shared';

import { formatarPreco, textoIdade, textoPorUnidade } from './formatar';

function oferta(parcial: Partial<Oferta>): Oferta {
  return {
    mercadoId: 1,
    mercadoNome: 'Mercado Bom Preço',
    endereco: 'Rua dos Ipês, 120 – Vila Sônia, São Paulo – SP',
    nomeNoMercado: 'Papel Higiênico Neve Folha Dupla',
    preco: 15.49,
    quantidadeTexto: '12 rolos',
    precoPorUnidade: 1.29,
    unidade: 'rolo',
    atualizadoEm: '2026-11-03T12:00:00.000Z',
    diasDesdeAtualizacao: 1,
    desatualizado: false,
    ...parcial,
  };
}

describe('formatarPreco', () => {
  it.each([
    [14.9, 'R$ 14,90'],
    [1234.5, 'R$ 1.234,50'],
    [0.99, 'R$ 0,99'],
    [1000000, 'R$ 1.000.000,00'],
    [0, 'R$ 0,00'],
    [5, 'R$ 5,00'],
    [999.999, 'R$ 1.000,00'],
    [18.5, 'R$ 18,50'],
    [12345.67, 'R$ 12.345,67'],
  ])('%p vira %p', (valor, esperado) => {
    expect(formatarPreco(valor)).toBe(esperado);
  });
});

describe('textoIdade', () => {
  it('0 dias é "atualizado hoje"', () => {
    expect(textoIdade(0)).toBe('atualizado hoje');
  });

  it('1 dia usa o singular', () => {
    expect(textoIdade(1)).toBe('atualizado há 1 dia');
  });

  it('vários dias usam o plural', () => {
    expect(textoIdade(2)).toBe('atualizado há 2 dias');
    expect(textoIdade(45)).toBe('atualizado há 45 dias');
  });

  it('negativo vale 0 e fracionário é arredondado para baixo', () => {
    expect(textoIdade(-3)).toBe('atualizado hoje');
    expect(textoIdade(0.9)).toBe('atualizado hoje');
    expect(textoIdade(1.9)).toBe('atualizado há 1 dia');
    expect(textoIdade(3.2)).toBe('atualizado há 3 dias');
  });
});

describe('textoPorUnidade', () => {
  it('rolo, kg e L repetem a unidade', () => {
    expect(textoPorUnidade(oferta({ precoPorUnidade: 1.24, unidade: 'rolo' }))).toBe('R$ 1,24 por rolo');
    expect(textoPorUnidade(oferta({ precoPorUnidade: 5.8, unidade: 'kg' }))).toBe('R$ 5,80 por kg');
    expect(textoPorUnidade(oferta({ precoPorUnidade: 3.1, unidade: 'L' }))).toBe('R$ 3,10 por L');
  });

  it('"un" vira "unidade"', () => {
    expect(textoPorUnidade(oferta({ precoPorUnidade: 2.5, unidade: 'un' }))).toBe('R$ 2,50 por unidade');
  });

  it('é nulo quando falta o preço por unidade ou a unidade', () => {
    expect(textoPorUnidade(oferta({ precoPorUnidade: null, unidade: null }))).toBeNull();
    expect(textoPorUnidade(oferta({ precoPorUnidade: null, unidade: 'rolo' }))).toBeNull();
    expect(textoPorUnidade(oferta({ precoPorUnidade: 1.29, unidade: null }))).toBeNull();
  });
});
