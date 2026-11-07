import { describe, expect, it } from 'vitest';
import { buscarNoCatalogo, listarProdutosNoCatalogo, produtosDoMercadoNoCatalogo, type Catalogo } from './busca';


describe('foto dos produtos no catálogo', () => {
  const base: Catalogo = {
    geradoEm: '2026-11-07T00:00:00.000Z',
    mercados: [{ id: 1, nome: 'Mercado A', endereco: 'Rua 1' }],
    ofertas: [
      { mercadoId: 1, codigoBarras: '7891000100103', nome: 'Leite Piracanjuba 1L', nomeNorm: 'leite piracanjuba 1l', preco: 5.99, quantidadeTexto: '1 L', quantidadeValor: 1, quantidadeUnidade: 'L', precoAtualizadoEm: '2026-11-06T10:00:00.000Z' },
      { mercadoId: 1, codigoBarras: '7891000200200', nome: 'Leite Outro 1L', nomeNorm: 'leite outro 1l', preco: 4.99, quantidadeTexto: '1 L', quantidadeValor: 1, quantidadeUnidade: 'L', precoAtualizadoEm: '2026-11-06T10:00:00.000Z' },
    ],
  };

  it('sem `comFoto` o campo foto não existe (a fonte não informa fotos)', () => {
    const [g] = buscarNoCatalogo(base, { q: 'piracanjuba', ordem: 'unidade' });
    expect('foto' in g!).toBe(false);
  });

  it('com `comFoto`, o produto que tem foto traz o caminho e o que não tem traz null', () => {
    const catalogo = { ...base, comFoto: ['7891000100103'] };
    const grupos = buscarNoCatalogo(catalogo, { q: 'leite', ordem: 'unidade' });
    expect(grupos.find((g) => g.codigoBarras === '7891000100103')?.foto).toBe('/fotos/7891000100103');
    expect(grupos.find((g) => g.codigoBarras === '7891000200200')?.foto).toBeNull();
  });

  it('vale também na lista da tela inicial e nos produtos de um mercado', () => {
    const catalogo = { ...base, comFoto: ['7891000200200'] };
    const inicial = listarProdutosNoCatalogo(catalogo, { ordem: 'unidade' }).grupos;
    expect(inicial.find((g) => g.codigoBarras === '7891000200200')?.foto).toBe('/fotos/7891000200200');
    const doMercado = produtosDoMercadoNoCatalogo(catalogo, 1, 1)!.itens;
    expect(doMercado.find((i) => i.codigoBarras === '7891000200200')?.foto).toBe('/fotos/7891000200200');
    expect(doMercado.find((i) => i.codigoBarras === '7891000100103')?.foto).toBeNull();
  });
});
