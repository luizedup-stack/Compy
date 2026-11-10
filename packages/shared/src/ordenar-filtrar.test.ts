import { describe, expect, it } from 'vitest';
import { normalizarTexto } from './texto';
import { buscarNoCatalogo, listarProdutosNoCatalogo, produtosDoMercadoNoCatalogo, promocaoAtiva, type Catalogo, type OfertaCatalogo } from './busca';

// Ordenar (relevância, menor preço, maior preço, recentes), filtrar (preço, quantidade, comércio, promoção, comparáveis)
// e promoção (preço que vale agora). Sem os parâmetros novos o resultado é o de sempre (testado em busca.test.ts e catalogo.test.ts).

const AGORA = new Date('2026-11-10T12:00:00.000Z');

function oferta(p: Partial<OfertaCatalogo> & { mercadoId: number; codigoBarras: string; nome: string; preco: number }): OfertaCatalogo {
  return {
    nomeNorm: normalizarTexto(p.nome),
    quantidadeTexto: '1 kg',
    quantidadeValor: 1,
    quantidadeUnidade: 'kg',
    precoAtualizadoEm: '2026-11-09T10:00:00.000Z',
    ...p,
  };
}

const catalogo = (ofertas: OfertaCatalogo[]): Catalogo => ({
  geradoEm: AGORA.toISOString(),
  mercados: [
    { id: 1, nome: 'Comércio A', endereco: 'Rua A' },
    { id: 2, nome: 'Comércio B', endereco: 'Rua B' },
    { id: 3, nome: 'Comércio C', endereco: 'Rua C' },
  ],
  ofertas,
});

const ARROZ = '7891000000011';
const FEIJAO = '7891000000028';
const ACUCAR = '7891000000035';
const SAL = '7891000000042';

const base = catalogo([
  oferta({ mercadoId: 1, codigoBarras: ARROZ, nome: 'Arroz Tipo 1 1kg', preco: 6, precoAtualizadoEm: '2026-11-01T10:00:00.000Z' }),
  oferta({ mercadoId: 2, codigoBarras: ARROZ, nome: 'Arroz Tipo 1 1kg', preco: 5, precoAtualizadoEm: '2026-11-02T10:00:00.000Z' }),
  oferta({ mercadoId: 1, codigoBarras: FEIJAO, nome: 'Feijão Carioca 1kg', preco: 9, precoAtualizadoEm: '2026-11-09T10:00:00.000Z' }),
  oferta({ mercadoId: 1, codigoBarras: ACUCAR, nome: 'Açúcar Refinado 1kg', preco: 4, precoAtualizadoEm: '2026-11-05T10:00:00.000Z' }),
  oferta({ mercadoId: 3, codigoBarras: ACUCAR, nome: 'Açúcar Refinado 1kg', preco: 3.5, precoAtualizadoEm: '2026-11-04T10:00:00.000Z' }),
  oferta({ mercadoId: 2, codigoBarras: SAL, nome: 'Sal Refinado 1kg', preco: 2, precoAtualizadoEm: '2026-11-08T10:00:00.000Z' }),
]);

const codigos = (grupos: { codigoBarras: string }[]) => grupos.map((g) => g.codigoBarras);

describe('ordenar a lista (tela inicial)', () => {
  it('sem critério: os vendidos em mais comércios primeiro, depois alfabético (como sempre foi)', () => {
    const { grupos } = listarProdutosNoCatalogo(base, { ordem: 'unidade', agora: AGORA });
    expect(codigos(grupos)).toEqual([ACUCAR, ARROZ, FEIJAO, SAL]); // Açúcar e Arroz em 2 comércios (alfabético), depois Feijão e Sal
    expect(listarProdutosNoCatalogo(base, { ordem: 'unidade', criterio: 'relevancia', agora: AGORA }).grupos).toEqual(grupos);
  });

  it('menor preço: do mais barato (por unidade) ao mais caro', () => {
    const { grupos } = listarProdutosNoCatalogo(base, { ordem: 'unidade', criterio: 'menor-preco', agora: AGORA });
    expect(codigos(grupos)).toEqual([SAL, ACUCAR, ARROZ, FEIJAO]); // 2 < 3,5 < 5 < 9
  });

  it('maior preço: do mais caro ao mais barato', () => {
    const { grupos } = listarProdutosNoCatalogo(base, { ordem: 'unidade', criterio: 'maior-preco', agora: AGORA });
    expect(codigos(grupos)).toEqual([FEIJAO, ARROZ, ACUCAR, SAL]);
  });

  it('recentes: o preço atualizado há menos tempo primeiro', () => {
    const { grupos } = listarProdutosNoCatalogo(base, { ordem: 'unidade', criterio: 'recentes', agora: AGORA });
    expect(codigos(grupos)).toEqual([FEIJAO, SAL, ACUCAR, ARROZ]); // 09, 08, 05, 02
  });

  it('dentro de cada produto as ofertas continuam da mais barata para a mais cara', () => {
    for (const criterio of ['menor-preco', 'maior-preco', 'recentes', 'relevancia'] as const) {
      const g = listarProdutosNoCatalogo(base, { ordem: 'unidade', criterio, agora: AGORA }).grupos.find((x) => x.codigoBarras === ARROZ)!;
      expect(g.ofertas.map((o) => o.preco)).toEqual([5, 6]);
    }
  });

  it('a paginação segue o critério escolhido', () => {
    const muitos = catalogo(Array.from({ length: 40 }, (_, i) => oferta({ mercadoId: 1, codigoBarras: `789200000${String(i).padStart(4, '0')}`, nome: `Produto ${i}`, preco: 40 - i })));
    const p1 = listarProdutosNoCatalogo(muitos, { ordem: 'unidade', criterio: 'menor-preco', pagina: 1, agora: AGORA });
    const p2 = listarProdutosNoCatalogo(muitos, { ordem: 'unidade', criterio: 'menor-preco', pagina: 2, agora: AGORA });
    expect(p1.total).toBe(40);
    expect(p1.grupos).toHaveLength(30);
    expect(p2.grupos).toHaveLength(10);
    expect(p1.grupos[0]!.ofertas[0]!.preco).toBe(1);
    expect(p2.grupos.at(-1)!.ofertas[0]!.preco).toBe(40);
  });
});

describe('ordenar a busca', () => {
  it('sem critério: por menor preço (como sempre foi)', () => {
    expect(codigos(buscarNoCatalogo(base, { q: 'refinado', ordem: 'unidade', agora: AGORA }))).toEqual([SAL, ACUCAR]);
  });

  it('maior preço e recentes na busca', () => {
    expect(codigos(buscarNoCatalogo(base, { q: 'refinado', ordem: 'unidade', criterio: 'maior-preco', agora: AGORA }))).toEqual([ACUCAR, SAL]);
    expect(codigos(buscarNoCatalogo(base, { q: 'refinado', ordem: 'unidade', criterio: 'recentes', agora: AGORA }))).toEqual([SAL, ACUCAR]);
  });

  it('relevância: o que tem todas as palavras escritas por inteiro vem antes do que só parece; depois o vendido em mais comércios', () => {
    const c = catalogo([
      oferta({ mercadoId: 1, codigoBarras: '7893000000010', nome: 'Arros Integral 1kg', preco: 3 }), // só parece com "arroz"
      oferta({ mercadoId: 1, codigoBarras: '7893000000027', nome: 'Arroz Parboilizado 1kg', preco: 8 }),
      oferta({ mercadoId: 2, codigoBarras: '7893000000027', nome: 'Arroz Parboilizado 1kg', preco: 9 }),
      oferta({ mercadoId: 3, codigoBarras: '7893000000034', nome: 'Arroz Agulhinha 1kg', preco: 7 }),
    ]);
    const r = buscarNoCatalogo(c, { q: 'arroz', ordem: 'unidade', criterio: 'relevancia', agora: AGORA });
    expect(codigos(r)).toEqual(['7893000000027', '7893000000034', '7893000000010']);
  });
});

describe('filtros', () => {
  it('faixa de preço: só ofertas dentro dela; o produto some se nenhuma passa', () => {
    const { grupos } = listarProdutosNoCatalogo(base, { ordem: 'unidade', filtros: { precoMin: 3, precoMax: 5 }, agora: AGORA });
    expect(codigos(grupos).sort()).toEqual([ACUCAR, ARROZ].sort());
    const arroz = grupos.find((g) => g.codigoBarras === ARROZ)!;
    expect(arroz.ofertas.map((o) => o.preco)).toEqual([5]); // a de R$ 6 ficou de fora
  });

  it('comércio: só ofertas dos comércios escolhidos', () => {
    const { grupos } = listarProdutosNoCatalogo(base, { ordem: 'unidade', filtros: { mercadoIds: [2] }, agora: AGORA });
    expect(codigos(grupos).sort()).toEqual([ARROZ, SAL].sort());
    expect(grupos.every((g) => g.ofertas.every((o) => o.mercadoId === 2))).toBe(true);
  });

  it('quantidade: faixa na unidade escolhida', () => {
    const c = catalogo([
      oferta({ mercadoId: 1, codigoBarras: ARROZ, nome: 'Arroz 1kg', preco: 5, quantidadeTexto: '1 kg', quantidadeValor: 1, quantidadeUnidade: 'kg' }),
      oferta({ mercadoId: 1, codigoBarras: FEIJAO, nome: 'Feijão 5kg', preco: 30, quantidadeTexto: '5 kg', quantidadeValor: 5, quantidadeUnidade: 'kg' }),
      oferta({ mercadoId: 1, codigoBarras: SAL, nome: 'Suco 1L', preco: 7, quantidadeTexto: '1 L', quantidadeValor: 1, quantidadeUnidade: 'L' }),
    ]);
    const r = listarProdutosNoCatalogo(c, { ordem: 'unidade', filtros: { unidade: 'kg', quantidadeMin: 2, quantidadeMax: 10 }, agora: AGORA });
    expect(codigos(r.grupos)).toEqual([FEIJAO]);
    expect(codigos(listarProdutosNoCatalogo(c, { ordem: 'unidade', filtros: { unidade: 'L' }, agora: AGORA }).grupos)).toEqual([SAL]);
  });

  it('só comparáveis: produtos com 2 ou mais ofertas que passaram nos outros filtros', () => {
    expect(codigos(listarProdutosNoCatalogo(base, { ordem: 'unidade', filtros: { soComparaveis: true }, agora: AGORA }).grupos)).toEqual([ACUCAR, ARROZ]);
    // com a faixa de preço até 5 o arroz de R$ 6 sai e o arroz deixa de ser comparável; o açúcar (4 e 3,5) continua
    const r = listarProdutosNoCatalogo(base, { ordem: 'unidade', filtros: { soComparaveis: true, precoMax: 5 }, agora: AGORA });
    expect(codigos(r.grupos)).toEqual([ACUCAR]);
  });

  it('os filtros valem também na busca, e o total reflete a lista filtrada', () => {
    const r = buscarNoCatalogo(base, { q: 'refinado', ordem: 'unidade', filtros: { mercadoIds: [3] }, agora: AGORA });
    expect(codigos(r)).toEqual([ACUCAR]);
    expect(listarProdutosNoCatalogo(base, { ordem: 'unidade', filtros: { mercadoIds: [3] }, agora: AGORA }).total).toBe(1);
  });
});

describe('promoção', () => {
  const comPromocao = catalogo([
    oferta({ mercadoId: 1, codigoBarras: ARROZ, nome: 'Arroz Tipo 1 1kg', preco: 6, precoPromocional: 4, promocaoInicio: '2026-11-09T00:00:00.000Z', promocaoFim: '2026-11-12T00:00:00.000Z' }),
    oferta({ mercadoId: 2, codigoBarras: ARROZ, nome: 'Arroz Tipo 1 1kg', preco: 5 }),
    oferta({ mercadoId: 1, codigoBarras: FEIJAO, nome: 'Feijão Carioca 1kg', preco: 9, precoPromocional: 5, promocaoInicio: '2026-11-20T00:00:00.000Z', promocaoFim: '2026-11-25T00:00:00.000Z' }), // ainda não começou
    oferta({ mercadoId: 1, codigoBarras: ACUCAR, nome: 'Açúcar 1kg', preco: 4, precoPromocional: 1, promocaoInicio: '2026-11-01T00:00:00.000Z', promocaoFim: '2026-11-05T00:00:00.000Z' }), // já acabou
  ]);

  it('promocaoAtiva: dentro do período e menor que o preço normal', () => {
    const o = comPromocao.ofertas;
    expect(promocaoAtiva(o[0]!, AGORA)).toBe(true);
    expect(promocaoAtiva(o[2]!, AGORA)).toBe(false); // futura
    expect(promocaoAtiva(o[3]!, AGORA)).toBe(false); // vencida
    expect(promocaoAtiva({ preco: 5, precoPromocional: 5 }, AGORA)).toBe(false); // não é desconto
    expect(promocaoAtiva({ preco: 5, precoPromocional: 6 }, AGORA)).toBe(false);
    expect(promocaoAtiva({ preco: 5 }, AGORA)).toBe(false);
    expect(promocaoAtiva({ preco: 5, precoPromocional: 3 }, AGORA)).toBe(true); // sem datas: vale sempre
  });

  it('a oferta em promoção mostra o preço promocional, o normal e até quando, e é a mais barata do produto', () => {
    const g = buscarNoCatalogo(comPromocao, { q: 'arroz', ordem: 'unidade', agora: AGORA })[0]!;
    expect(g.ofertas[0]).toMatchObject({ mercadoId: 1, preco: 4, precoOriginal: 6, promocaoAte: '2026-11-12T00:00:00.000Z', precoPorUnidade: 4 });
    expect(g.ofertas[1]).toMatchObject({ mercadoId: 2, preco: 5 });
    expect(g.ofertas[1]!.precoOriginal).toBeUndefined();
  });

  it('promoção futura ou vencida não muda nada', () => {
    const feijao = buscarNoCatalogo(comPromocao, { q: 'feijão', ordem: 'unidade', agora: AGORA })[0]!;
    expect(feijao.ofertas[0]).toMatchObject({ preco: 9 });
    expect(feijao.ofertas[0]!.precoOriginal).toBeUndefined();
    const acucar = buscarNoCatalogo(comPromocao, { q: 'açúcar', ordem: 'unidade', agora: AGORA })[0]!;
    expect(acucar.ofertas[0]).toMatchObject({ preco: 4 });
  });

  it('"só promoções" deixa apenas as ofertas em promoção', () => {
    const r = listarProdutosNoCatalogo(comPromocao, { ordem: 'unidade', filtros: { soPromocao: true }, agora: AGORA });
    expect(codigos(r.grupos)).toEqual([ARROZ]);
    expect(r.grupos[0]!.ofertas).toHaveLength(1);
  });

  it('o preço da promoção entra na faixa de preço e na ordenação', () => {
    // arroz custa 4 (promoção) em A: cabe na faixa até 4,5 mesmo com preço normal de 6
    const r = listarProdutosNoCatalogo(comPromocao, { ordem: 'unidade', filtros: { precoMax: 4.5 }, agora: AGORA });
    expect(codigos(r.grupos).sort()).toEqual([ACUCAR, ARROZ].sort()); // açúcar a R$ 4 (promoção vencida: preço normal) e arroz a R$ 4
  });

  it('na lista de produtos de um comércio também aparece o preço promocional', () => {
    const itens = produtosDoMercadoNoCatalogo(comPromocao, 1, 1, AGORA)!.itens;
    expect(itens.find((i) => i.codigoBarras === ARROZ)).toMatchObject({ preco: 4, precoOriginal: 6 });
    expect(itens.find((i) => i.codigoBarras === FEIJAO)!.precoOriginal).toBeUndefined();
  });
});
