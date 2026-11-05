import { normalizarTexto } from '@mercado/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { importarPlanilha } from '../planilha/importar';
import type { OfertaArmazenada, Repositorio } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { lerPlanilha } from '../rotas/apoioTeste';
import { buscar, LIMITE_GRUPOS_BUSCA } from './buscar';

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
    // Melhor oferta de cada grupo: Fox 12 14,70/12 = 1,23; Neve 12 14,79/12 = 1,23 (Estrela);
    // X 12 16,60/12 = 1,38; Fox 4 5,79/4 = 1,45. Fox 12 e Neve empatam: vale o nome do grupo
    // ('PAPEL HIGIENICO FOX...' antes de 'Papel Higiênico Neve...', maiúsculas antes).
    expect(codigos(grupos)).toEqual([FOX_12, NEVE_12, X_12, FOX_4]);
    expect(grupos.map((g) => g.ofertas.length)).toEqual([2, 3, 2, 2]);
  });

  it('R24: o código casa se alguma oferta casa; entram também as ofertas com nome abreviado', async () => {
    const grupos = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    const neve = grupos.find((g) => g.codigoBarras === NEVE_12)!;
    expect(neve.nome).toBe('Papel Higiênico Neve Folha Dupla'); // empate de tamanho: mercado de menor id (Bom Preço)
    expect(neve.ofertas.map((o) => [o.mercadoNome, o.nomeNoMercado, o.preco, o.precoPorUnidade])).toEqual([
      ['Supermercado Estrela da Vila', 'Papel Hig. Neve Folha Dupla', 14.79, 1.23],
      ['Mercado Bom Preço', 'Papel Higiênico Neve Folha Dupla', 15.49, 1.29],
      ['Empório Sonia', 'PAPEL HIGIENICO NEVE FOLHA DUPLA', 16.2, 1.35],
    ]);
    const x = grupos.find((g) => g.codigoBarras === X_12)!;
    expect(x.ofertas.map((o) => [o.mercadoNome, o.nomeNoMercado, o.precoPorUnidade])).toEqual([
      ['Empório Sonia', 'PAPEL HIGIENICO X FOLHA SIMPLES', 1.38],
      ['Supermercado Estrela da Vila', 'Papel Hig. X Folha Simples', null],
    ]);
  });

  it('código sem nenhuma oferta que case não aparece', async () => {
    const grupos = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    expect(grupos).toHaveLength(4);
    expect(codigos(await buscar(repo, { q: 'arroz', ordem: 'unidade' }))).not.toContain(NEVE_12);
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
    expect(codigos(grupos)).toEqual([FOX_4, X_12, FOX_12, NEVE_12]);
    expect(grupos[0].ofertas.map((o) => o.preco)).toEqual([5.79, 6.89]);
    expect(grupos[1].ofertas.map((o) => o.preco)).toEqual([14, 16.6]);
    expect(grupos[2].ofertas.map((o) => o.preco)).toEqual([14.7, 18.5]);
    expect(grupos[3].ofertas.map((o) => o.preco)).toEqual([14.79, 15.49, 16.2]);
  });
});

describe('buscar: agrupamento por código de barras', () => {
  it('o mesmo código com nomes diferentes forma um grupo só e o nome é o mais comprido', async () => {
    const grupos = await buscar(repo, { q: 'papel folha simples', ordem: 'unidade' });
    expect(grupos).toHaveLength(1); // 'papel folha simples' casa só o código X
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

  it('oferta indisponível ou de mercado removido não entra no grupo, mesmo com o código casando', async () => {
    const r = await repoComMercados(3);
    await r.salvarOferta(oferta(1, '111', { nome: 'Feijao Preto', preco: 8 }));
    await r.salvarOferta(oferta(2, '111', { nome: 'Fj Pt', preco: 1, disponivel: false }));
    await r.salvarOferta(oferta(3, '111', { nome: 'Fj Pt Extra Longo Demais Para Nome', preco: 2 }));
    await r.atualizarMercado(3, { status: 'removido' });
    const grupos = await buscar(r, { q: 'feijao', ordem: 'unidade' });
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nome).toBe('Feijao Preto'); // o nome longo do mercado removido não conta
    expect(grupos[0].ofertas.map((o) => o.mercadoId)).toEqual([1]);
    // se a única oferta que casa some, o código inteiro some (a que sobra tem outro nome)
    await r.salvarOferta(oferta(2, '111', { nome: 'Fj Pt', preco: 1, disponivel: true }));
    await r.salvarOferta(oferta(1, '111', { nome: 'Feijao Preto', preco: 8, disponivel: false }));
    expect(await buscar(r, { q: 'feijao', ordem: 'unidade' })).toEqual([]);
  });

  it('mercado removido some da busca', async () => {
    await repo.atualizarMercado(4, { status: 'removido' });
    const grupos = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    expect(grupos.flatMap((g) => g.ofertas.map((o) => o.mercadoId))).not.toContain(4);
    expect(grupos.find((g) => g.codigoBarras === FOX_12)!.ofertas).toHaveLength(1);
    expect(grupos.find((g) => g.codigoBarras === NEVE_12)!.ofertas).toHaveLength(3);
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

  it('texto bruto com mais de 1000 caracteres: [] sem erro e sem registro', async () => {
    expect(await buscar(repo, { q: `papel ${' '.repeat(1000)}`, ordem: 'unidade' })).toEqual([]);
    expect(await repo.listarBuscas()).toHaveLength(0);
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
      { usuarioId: 42, termo: 'papel higienico', resultados: 4, mercadosDistintos: 4 },
      { usuarioId: null, termo: 'zzzzzzz', resultados: 0, mercadosDistintos: 0 },
    ]);
  });

  it('conta os mercados distintos de todas as ofertas devolvidas', async () => {
    await repo.atualizarMercado(4, { status: 'removido' });
    await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    expect(await repo.listarBuscas()).toEqual([
      { usuarioId: null, termo: 'papel higienico', resultados: 4, mercadosDistintos: 3 },
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

const rolos = (n: number) => ({ quantidadeTexto: `${n} rolos`, quantidadeValor: n, quantidadeUnidade: 'rolo' as const });
const semQuantidade = { quantidadeTexto: null, quantidadeValor: null, quantidadeUnidade: null };
const mercadosDe = (g: { ofertas: { mercadoId: number }[] }) => g.ofertas.map((o) => o.mercadoId);

describe('buscar: preço por unidade x preço da embalagem dentro de um grupo', () => {
  it('(a) mesma unidade, embalagens diferentes: a menor por rolo vem primeiro em unidade; a mais barata em embalagem', async () => {
    const r = await repoComMercados(2);
    await r.salvarOferta(oferta(1, '500', { nome: 'Papel teste', preco: 9, ...rolos(6) })); // 1,50/rolo
    await r.salvarOferta(oferta(2, '500', { nome: 'Papel teste', preco: 15, ...rolos(12) })); // 1,25/rolo
    const [porUnidade] = await buscar(r, { q: 'papel teste', ordem: 'unidade' });
    expect(mercadosDe(porUnidade)).toEqual([2, 1]);
    expect(porUnidade.ofertas.map((o) => o.precoPorUnidade)).toEqual([1.25, 1.5]);
    const [porEmbalagem] = await buscar(r, { q: 'papel teste', ordem: 'embalagem' });
    expect(mercadosDe(porEmbalagem)).toEqual([1, 2]);
  });

  it('(b) unidades misturadas: ordem fixa kg, L, un, rolo, depois preço por unidade; sem quantidade por último', async () => {
    const r = await repoComMercados(6);
    const q = (texto: string, valor: number, unidade: 'kg' | 'L' | 'un') => ({
      quantidadeTexto: texto,
      quantidadeValor: valor,
      quantidadeUnidade: unidade,
    });
    await r.salvarOferta(oferta(1, '600', { nome: 'Misto', preco: 5, ...q('1 kg', 1, 'kg') })); // 5,00/kg
    await r.salvarOferta(oferta(2, '600', { nome: 'Misto', preco: 1, ...rolos(2) })); // 0,50/rolo
    await r.salvarOferta(oferta(3, '600', { nome: 'Misto', preco: 0.5, ...semQuantidade }));
    await r.salvarOferta(oferta(4, '600', { nome: 'Misto', preco: 9, ...q('1 L', 1, 'L') })); // 9,00/L
    await r.salvarOferta(oferta(5, '600', { nome: 'Misto', preco: 3, ...q('3 un', 3, 'un') })); // 1,00/un
    await r.salvarOferta(oferta(6, '600', { nome: 'Misto', preco: 2, ...q('500 g', 0.5, 'kg') })); // 4,00/kg
    const [g] = await buscar(r, { q: 'misto', ordem: 'unidade' });
    expect(mercadosDe(g)).toEqual([6, 1, 4, 5, 2, 3]);
    const [e] = await buscar(r, { q: 'misto', ordem: 'embalagem' });
    expect(mercadosDe(e)).toEqual([3, 2, 6, 5, 1, 4]);
  });

  it('(c) grupos: a embalagem mais barata pode ter o maior preço por unidade', async () => {
    const r = await repoComMercados(1);
    await r.salvarOferta(oferta(1, '701', { nome: 'Item P', preco: 5, ...rolos(2) })); // embalagem 5, 2,50/rolo
    await r.salvarOferta(oferta(1, '702', { nome: 'Item Q', preco: 12, ...rolos(12) })); // embalagem 12, 1,00/rolo
    expect(codigos(await buscar(r, { q: 'item', ordem: 'unidade' }))).toEqual(['702', '701']);
    expect(codigos(await buscar(r, { q: 'item', ordem: 'embalagem' }))).toEqual(['701', '702']);
  });
});

describe('buscar: desempate pelo valor bruto (R25)', () => {
  it('mesmo preço por unidade mostrado, valores brutos diferentes: ordena pelo bruto, nas ofertas', async () => {
    const r = await repoComMercados(2);
    // 14,79/12 = 1,2325 e 14,70/12 = 1,225: os dois aparecem como 1,23
    await r.salvarOferta(oferta(1, '800', { nome: 'Rolo teste', preco: 14.79, ...rolos(12) }));
    await r.salvarOferta(oferta(2, '800', { nome: 'Rolo teste', preco: 14.7, ...rolos(12) }));
    const [g] = await buscar(r, { q: 'rolo teste', ordem: 'unidade' });
    expect(g.ofertas.map((o) => o.precoPorUnidade)).toEqual([1.23, 1.23]);
    expect(mercadosDe(g)).toEqual([2, 1]); // o id diria [1, 2]
  });

  it('mesmo preço por unidade mostrado, valores brutos diferentes: ordena pelo bruto, nos grupos', async () => {
    const r = await repoComMercados(1);
    await r.salvarOferta(oferta(1, '801', { nome: 'Aaa rolo teste', preco: 14.79, ...rolos(12) })); // 1,2325
    await r.salvarOferta(oferta(1, '802', { nome: 'Zzz rolo teste', preco: 14.7, ...rolos(12) })); // 1,225
    const grupos = await buscar(r, { q: 'rolo teste', ordem: 'unidade' });
    expect(grupos.map((g) => g.ofertas[0].precoPorUnidade)).toEqual([1.23, 1.23]);
    expect(codigos(grupos)).toEqual(['802', '801']); // o nome diria ['801', '802']
  });

  it('valores brutos matematicamente iguais (mesmo com ruído de ponto flutuante) caem nos desempates fixos', async () => {
    const r = await repoComMercados(2);
    // 14,7/12 dá 1,2250000000000001 e 29,4/24 dá 1,225: iguais de verdade
    await r.salvarOferta(oferta(1, '810', { nome: 'Igual teste', preco: 14.7, ...rolos(12) }));
    await r.salvarOferta(oferta(2, '810', { nome: 'Igual teste', preco: 29.4, ...rolos(24) }));
    const [g] = await buscar(r, { q: 'igual teste', ordem: 'unidade' });
    expect(mercadosDe(g)).toEqual([1, 2]);
    // grupos iguais: nome sem depender de caixa/acento, depois código
    await r.salvarOferta(oferta(1, '811', { nome: 'Beta igual teste', preco: 12, ...rolos(12) }));
    await r.salvarOferta(oferta(1, '812', { nome: 'alfa igual teste', preco: 6, ...rolos(6) }));
    await r.salvarOferta(oferta(1, '813', { nome: 'Álfa igual teste', preco: 24, ...rolos(24) }));
    const grupos = await buscar(r, { q: 'igual teste', ordem: 'unidade' });
    // 1,00/rolo nos três: 'alfa' = 'álfa' normalizados -> o texto cru decide ('Álfa' vem depois de 'alfa'); depois 'beta'
    expect(codigos(grupos)).toEqual(['812', '813', '811', '810']);
  });
});

describe('buscar: limite de grupos (R32)', () => {
  it('LIMITE_GRUPOS_BUSCA vale 50', () => {
    expect(LIMITE_GRUPOS_BUSCA).toBe(50);
  });

  it('com 60 códigos que casam devolve os 50 primeiros da ordem (o mais barato primeiro) e registra 50', async () => {
    const r = await repoComMercados(2);
    // Gravados do mais caro ao mais barato, para a ordem não vir de graça da inserção.
    // Os 10 mais caros ficam só no mercado 2: fora do resultado, ele não conta.
    for (let i = 59; i >= 0; i--) {
      const codigo = `789${String(i).padStart(10, '0')}`;
      await r.salvarOferta(oferta(i < 50 ? 1 : 2, codigo, { nome: `Arroz ${i}`, preco: 10 + i }));
    }
    const grupos = await buscar(r, { q: 'arroz', ordem: 'unidade' });
    expect(grupos).toHaveLength(50);
    expect(codigos(grupos)).toEqual(Array.from({ length: 50 }, (_, i) => `789${String(i).padStart(10, '0')}`));
    expect(grupos[0]!.ofertas[0]!.preco).toBe(10);
    expect(await r.listarBuscas()).toEqual([
      { usuarioId: null, termo: 'arroz', resultados: 50, mercadosDistintos: 1 },
    ]);
  });

  it('nos dados de teste nada muda: os quatro grupos de papel higiênico', async () => {
    const grupos = await buscar(repo, { q: 'papel higienico', ordem: 'unidade' });
    expect(codigos(grupos)).toEqual([FOX_12, NEVE_12, X_12, FOX_4]);
  });
});
