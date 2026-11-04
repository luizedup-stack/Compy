import { normalizarTexto } from '@mercado/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { importarPlanilha } from '../planilha/importar';
import type { OfertaArmazenada, Repositorio } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { lerPlanilha } from '../rotas/apoioTeste';
import { buscar } from './buscar';

const PLANILHAS = [
  'mercado-1-bom-preco.xlsx',
  'mercado-2-estrela-da-vila.xlsx',
  'mercado-3-emporio-sonia.xlsx',
  'mercado-4-atacarejo-economico.xlsx',
];
const FOX_12 = '7890070035629';
const FOX_4 = '7890070036992';
const X_12 = '7890070038361';
const NEVE_12 = '7890070039733';
const OLEO = '7890070005486';
const DIA = 86_400_000;

let repo: Repositorio;

beforeEach(async () => {
  repo = criarRepositorioMemoria();
  for (const p of PLANILHAS) await importarPlanilha(repo, lerPlanilha(p), { papel: 'admin' });
});

const codigos = (grupos: { codigoBarras: string }[]) => grupos.map((g) => g.codigoBarras);

function oferta(mercadoId: number, codigoBarras: string, extra: Partial<OfertaArmazenada> = {}): OfertaArmazenada {
  const nome = extra.nome ?? `Produto ${codigoBarras}`;
  return {
    mercadoId,
    codigoBarras,
    nome,
    nomeNorm: normalizarTexto(nome),
    preco: 10,
    quantidadeTexto: '1 kg',
    quantidadeValor: 1,
    quantidadeUnidade: 'kg',
    categoria: null,
    disponivel: true,
    precoAtualizadoEm: new Date(),
    promocaoPreco: null,
    promocaoInicio: null,
    promocaoFim: null,
    ...extra,
  };
}

async function repoComMercados(quantos: number): Promise<Repositorio> {
  const r = criarRepositorioMemoria();
  for (let id = 1; id <= quantos; id++) {
    await r.criarMercado({
      nome: `M${id}`,
      endereco: `E${id}`,
      nomeNorm: `m${id}`,
      enderecoNorm: `e${id}`,
      status: 'ativo',
      contaSituacao: 'gratuita',
      usuarioId: null,
    });
  }
  return r;
}

describe('buscar: papel higiênico (dados de teste)', () => {
  it('devolve os quatro grupos, do menor preço por unidade ao maior', async () => {
    const grupos = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    // Fox 12: 14,70/12 = 1,23; Neve 12: 15,49/12 = 1,29; X 12: 16,60/12 = 1,38; Fox 4: 5,79/4 = 1,45.
    expect(codigos(grupos)).toEqual([FOX_12, NEVE_12, X_12, FOX_4]);
    expect(grupos.map((g) => g.ofertas.length)).toEqual([2, 2, 1, 2]);
  });

  it('dentro de Fox 12 rolos o Atacarejo Econômico vem antes do Empório Sonia', async () => {
    const [fox12] = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    expect(fox12.nome).toBe('PAPEL HIGIENICO FOX FOLHA DUPLA'); // empate de tamanho: vale o do mercado de menor id (Empório, 3)
    expect(fox12.ofertas.map((o) => o.mercadoNome)).toEqual(['Atacarejo Econômico', 'Empório Sonia']);
    expect(fox12.ofertas[0]).toMatchObject({
      mercadoId: 4,
      mercadoNome: 'Atacarejo Econômico',
      endereco: expect.stringContaining('Jacarandá'),
      nomeNoMercado: 'Papel Higiênico Fox Folha Dupla',
      preco: 14.7,
      quantidadeTexto: '12 ROLOS',
      precoPorUnidade: 1.23,
      unidade: 'rolo',
      diasDesdeAtualizacao: 0,
      desatualizado: false,
    });
    expect(fox12.ofertas[0].atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fox12.ofertas[1]).toMatchObject({ mercadoId: 3, preco: 18.5, precoPorUnidade: 1.54, unidade: 'rolo' });
  });

  it('oferta sem quantidade entendida vem depois das que têm, com precoPorUnidade null', async () => {
    const grupos = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    const fox4 = grupos.find((g) => g.codigoBarras === FOX_4)!;
    expect(fox4.ofertas.map((o) => [o.mercadoId, o.preco, o.precoPorUnidade, o.unidade])).toEqual([
      [4, 5.79, 1.45, 'rolo'],
      [3, 6.89, null, null],
    ]);
    expect(fox4.ofertas[1].quantidadeTexto).toBeNull();
  });

  it('com acento ou com erro de digitação acha os mesmos grupos', async () => {
    const base = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    expect(await buscar(repo, { q: 'papel higiênico', ordem: 'unidade' })).toEqual(base);
    expect(await buscar(repo, { q: 'papl higienico', ordem: 'unidade' })).toEqual(base);
    expect(await buscar(repo, { q: 'PAPEL   HIGIENICO!', ordem: 'unidade' })).toEqual(base);
  });

  it('ordem=embalagem ordena grupos e ofertas pelo preço da embalagem', async () => {
    const grupos = await buscar(repo, { q: 'papel higienico', ordem: 'embalagem' });
    expect(codigos(grupos)).toEqual([FOX_4, FOX_12, NEVE_12, X_12]);
    expect(grupos[0].ofertas.map((o) => o.preco)).toEqual([5.79, 6.89]);
    expect(grupos[1].ofertas.map((o) => o.preco)).toEqual([14.7, 18.5]);
    expect(grupos[2].ofertas.map((o) => o.preco)).toEqual([15.49, 16.2]);
  });
});

describe('buscar: agrupamento por código de barras', () => {
  it('o mesmo código com nomes diferentes forma um grupo só e o nome é o mais comprido', async () => {
    const grupos = await buscar(repo, { q: 'papel folha simples', ordem: 'unidade' });
    expect(grupos).toHaveLength(1);
    const [x] = grupos;
    expect(x.codigoBarras).toBe(X_12);
    expect(x.nome).toBe('PAPEL HIGIENICO X FOLHA SIMPLES');
    expect(x.ofertas.map((o) => [o.mercadoNome, o.nomeNoMercado, o.precoPorUnidade])).toEqual([
      ['Empório Sonia', 'PAPEL HIGIENICO X FOLHA SIMPLES', 1.38],
      ['Supermercado Estrela da Vila', 'Papel Hig. X Folha Simples', null],
    ]);
  });

  it('empate de tamanho no nome: vale o do mercado de menor id', async () => {
    const r = await repoComMercados(2);
    await r.salvarOferta(oferta(2, '111', { nome: 'Feijao Beta' }));
    await r.salvarOferta(oferta(1, '111', { nome: 'Feijao Alfa' }));
    const [g] = await buscar(r, { q: 'feijao', ordem: 'unidade' });
    expect(g.nome).toBe('Feijao Alfa');
  });
});

describe('buscar: disponibilidade e mercados removidos', () => {
  it('o óleo de soja indisponível do Empório Sonia nunca aparece', async () => {
    const guardado = await repo.acharOferta(3, OLEO);
    expect(guardado).not.toBeNull();
    expect(guardado!.disponivel).toBe(false);
    const grupos = await buscar(repo, { q: 'oleo de soja', ordem: 'unidade' });
    expect(grupos.length).toBeGreaterThan(0);
    expect(grupos.flatMap((g) => g.ofertas.map((o) => o.mercadoId))).not.toContain(3);
  });

  it('mercado removido some da busca', async () => {
    await repo.atualizarMercado(4, { status: 'removido' });
    const grupos = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    expect(grupos.flatMap((g) => g.ofertas.map((o) => o.mercadoId))).not.toContain(4);
    expect(grupos.find((g) => g.codigoBarras === FOX_12)!.ofertas).toHaveLength(1);
  });
});

describe('buscar: consultas inválidas', () => {
  const invalidas: [string, string][] = [
    ['vazia', ''],
    ['uma letra', 'a'],
    ['só espaços', '   '],
    ['porcentagem', '%'],
    ['sublinhado', '_'],
    ['aspas', "'"],
    ['500 caracteres', 'a'.repeat(500)],
    ['101 caracteres', 'a'.repeat(101)],
    ['9 palavras', 'papel higienico fox folha dupla de 12 rolos extra'],
  ];
  it.each(invalidas)('%s: devolve [] sem erro e sem registrar a busca', async (_nome, q) => {
    expect(await buscar(repo, { q, ordem: 'unidade' })).toEqual([]);
    expect(await repo.listarBuscas()).toHaveLength(0);
  });

  it('8 palavras ainda é busca de verdade (e é registrada)', async () => {
    expect(await buscar(repo, { q: 'papel higienico fox folha dupla de 12 rolos', ordem: 'unidade' })).toEqual([]);
    expect(await repo.listarBuscas()).toHaveLength(1);
  });

  it('100 caracteres é aceito; 101 não', async () => {
    await buscar(repo, { q: 'a'.repeat(100), ordem: 'unidade' });
    expect(await repo.listarBuscas()).toHaveLength(1);
    await buscar(repo, { q: 'a'.repeat(101), ordem: 'unidade' });
    expect(await repo.listarBuscas()).toHaveLength(1);
  });
});

describe('buscar: registro da busca', () => {
  it('cada busca real grava um registro, inclusive sem resultado', async () => {
    await buscar(repo, { q: '  papel higienico ', ordem: 'unidade', usuarioId: 42 });
    await buscar(repo, { q: 'zzzzzzz', ordem: 'unidade' });
    expect(await repo.listarBuscas()).toEqual([
      { usuarioId: 42, termo: 'papel higienico', resultados: 4, mercadosDistintos: 3 },
      { usuarioId: null, termo: 'zzzzzzz', resultados: 0, mercadosDistintos: 0 },
    ]);
  });

  it('conta os mercados distintos de todas as ofertas devolvidas', async () => {
    await repo.atualizarMercado(4, { status: 'removido' });
    await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    expect(await repo.listarBuscas()).toEqual([
      { usuarioId: null, termo: 'papel higienico', resultados: 4, mercadosDistintos: 2 },
    ]);
  });
});

describe('buscar: preço desatualizado', () => {
  async function envelhecer(dias: number) {
    const o = (await repo.acharOferta(4, FOX_12))!;
    await repo.salvarOferta({ ...o, precoAtualizadoEm: new Date(Date.now() - dias * DIA - 60_000) });
    const [g] = await buscar(repo, { q: 'papel higienico fox', ordem: 'unidade' });
    return g.ofertas.find((x) => x.mercadoId === 4)!;
  }

  it('7 dias: ainda vale', async () => {
    const o = await envelhecer(7);
    expect(o.diasDesdeAtualizacao).toBe(7);
    expect(o.desatualizado).toBe(false);
  });

  it('8 dias: desatualizado', async () => {
    const o = await envelhecer(8);
    expect(o.diasDesdeAtualizacao).toBe(8);
    expect(o.desatualizado).toBe(true);
  });
});

describe('buscar: ordenação com várias unidades', () => {
  it('unidades na ordem kg, L, un, rolo; grupos sem unidade por último, por preço', async () => {
    const r = await repoComMercados(1);
    const q = (texto: string, valor: number, unidade: 'kg' | 'L' | 'un' | 'rolo') => ({
      quantidadeTexto: texto,
      quantidadeValor: valor,
      quantidadeUnidade: unidade,
    });
    await r.salvarOferta(oferta(1, '1', { nome: 'Item rolo', preco: 2, ...q('2 rolos', 2, 'rolo') }));
    await r.salvarOferta(oferta(1, '2', { nome: 'Item un', preco: 9, ...q('3 un', 3, 'un') }));
    await r.salvarOferta(oferta(1, '3', { nome: 'Item L', preco: 9, ...q('3 L', 3, 'L') }));
    await r.salvarOferta(oferta(1, '4', { nome: 'Item kg caro', preco: 20, ...q('1 kg', 1, 'kg') }));
    await r.salvarOferta(oferta(1, '5', { nome: 'Item kg barato', preco: 5, ...q('1 kg', 1, 'kg') }));
    const semQtd = { quantidadeValor: null, quantidadeUnidade: null };
    await r.salvarOferta(oferta(1, '6', { nome: 'Item sem B', preco: 8, quantidadeTexto: null, ...semQtd }));
    await r.salvarOferta(oferta(1, '7', { nome: 'Item sem A', preco: 3, quantidadeTexto: 'caixa', ...semQtd }));
    expect(codigos(await buscar(r, { q: 'item', ordem: 'unidade' }))).toEqual(['5', '4', '3', '2', '1', '7', '6']);
    expect(codigos(await buscar(r, { q: 'item', ordem: 'embalagem' }))).toEqual(['1', '7', '5', '6', '3', '2', '4']);
  });

  it('empates são resolvidos por nome e depois por código de barras', async () => {
    const r = await repoComMercados(1);
    await r.salvarOferta(oferta(1, '30', { nome: 'Item B' }));
    await r.salvarOferta(oferta(1, '20', { nome: 'Item B' }));
    await r.salvarOferta(oferta(1, '10', { nome: 'Item C' }));
    await r.salvarOferta(oferta(1, '40', { nome: 'Item A' }));
    expect(codigos(await buscar(r, { q: 'item', ordem: 'unidade' }))).toEqual(['40', '20', '30', '10']);
  });
});
