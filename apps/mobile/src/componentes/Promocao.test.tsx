import type { Oferta, ProdutoMercado } from '@mercado/shared';
import { render, screen } from '@testing-library/react-native';

import { textoPromocaoAte } from '../formatar';
import { CartaoOferta } from './CartaoOferta';
import { LinhaProduto } from './LinhaProduto';

// Promoção bem visível: selo laranja, preço promocional, preço antigo riscado e "até dd/mm".

const OFERTA: Oferta = {
  mercadoId: 4,
  mercadoNome: 'Atacarejo Econômico',
  endereco: 'Rua Jacarandá, 410',
  nomeNoMercado: 'Arroz 5kg',
  preco: 18.9,
  quantidadeTexto: '5 kg',
  precoPorUnidade: 3.78,
  unidade: 'kg',
  atualizadoEm: '2026-11-09T12:00:00.000Z',
  diasDesdeAtualizacao: 0,
  desatualizado: false,
  precoOriginal: 24.9,
  promocaoAte: '2026-11-13T02:00:00.000Z', // 12/11, 23h em Brasília
};

describe('promoção na oferta', () => {
  it('mostra o selo, o preço promocional, o antigo riscado e até quando vale', async () => {
    await render(<CartaoOferta oferta={OFERTA} />);
    expect(screen.getByTestId('selo-promocao')).toBeOnTheScreen();
    expect(screen.getByText('🔥 PROMOÇÃO')).toBeOnTheScreen();
    expect(screen.getByText('até 12/11')).toBeOnTheScreen();
    expect(screen.getByText('R$ 18,90')).toBeOnTheScreen();
    expect(screen.getByTestId('preco-antigo')).toHaveTextContent('R$ 24,90');
    expect(screen.getByTestId('oferta').props.accessibilityLabel).toContain('em promoção, de R$ 24,90 por R$ 18,90, até 12/11');
  });

  it('sem promoção, nada disso aparece', async () => {
    const { precoOriginal: _a, promocaoAte: _b, ...normal } = OFERTA;
    await render(<CartaoOferta oferta={normal} />);
    expect(screen.queryByTestId('selo-promocao')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('preco-antigo')).not.toBeOnTheScreen();
  });

  it('textoPromocaoAte: dia no horário de Brasília e promoção sem fim', () => {
    expect(textoPromocaoAte('2026-11-13T02:00:00.000Z')).toBe('até 12/11');
    expect(textoPromocaoAte('2026-11-13T05:00:00.000Z')).toBe('até 13/11');
    expect(textoPromocaoAte(null)).toBe('sem data para acabar');
    expect(textoPromocaoAte('lixo')).toBe('sem data para acabar');
  });
});

describe('promoção na lista do estabelecimento', () => {
  const PRODUTO: ProdutoMercado = {
    codigoBarras: '7891000000011',
    nome: 'Arroz 5kg',
    preco: 18.9,
    quantidadeTexto: '5 kg',
    precoPorUnidade: 3.78,
    unidade: 'kg',
    atualizadoEm: '2026-11-09T12:00:00.000Z',
    diasDesdeAtualizacao: 0,
    desatualizado: false,
    precoOriginal: 24.9,
    promocaoAte: null,
  };

  it('mostra o selo e o preço antigo riscado', async () => {
    await render(<LinhaProduto produto={PRODUTO} />);
    expect(screen.getByTestId('selo-promocao')).toBeOnTheScreen();
    expect(screen.getByText('sem data para acabar')).toBeOnTheScreen();
    expect(screen.getByText('R$ 24,90')).toBeOnTheScreen();
  });
});
