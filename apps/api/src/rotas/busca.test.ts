import { normalizarTexto, type GrupoProduto, type ProdutoMercado } from '@mercado/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { importarPlanilha } from '../planilha/importar';
import type { OfertaArmazenada } from '../repositorio';
import { type Ambiente, comToken, criarAmbiente, lerPlanilha } from './apoioTeste';

const PLANILHAS = [
  'mercado-1-bom-preco.xlsx',
  'mercado-2-estrela-da-vila.xlsx',
  'mercado-3-emporio-sonia.xlsx',
  'mercado-4-atacarejo-economico.xlsx',
];

let amb: Ambiente;
let token: string;

beforeEach(async () => {
  amb = await criarAmbiente();
  for (const p of PLANILHAS) await importarPlanilha(amb.repo, lerPlanilha(p), { papel: 'admin' });
  token = (await amb.criarComPapel('cliente')).token;
});

const get = (url: string, tk: string | null = token) =>
  amb.app.inject({ method: 'GET', url, headers: tk ? comToken(tk) : {} });

describe('acesso', () => {
  const rotas = ['/busca?q=arroz', '/mercados', '/mercados/1/produtos'];

  it.each(rotas)('%s sem token: 401', async (url) => {
    const res = await get(url, null);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ erro: 'Não autenticado' });
  });

  it.each(rotas)('%s com token inválido: 401', async (url) => {
    expect((await get(url, 'lixo')).statusCode).toBe(401);
  });

  for (const papel of ['mercado', 'admin'] as const) {
    it.each(rotas)(`%s para o papel ${papel}: 403`, async (url) => {
      const { token: outro } = await amb.criarComPapel(papel);
      const res = await get(url, outro);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ erro: 'Sem permissão para esta ação' });
    });
  }
});

describe('GET /busca', () => {
  it('devolve o array de grupos direto, em ordem de preço por unidade (padrão)', async () => {
    const res = await get('/busca?q=papel%20higienico');
    expect(res.statusCode).toBe(200);
    const grupos = res.json() as GrupoProduto[];
    expect(Array.isArray(grupos)).toBe(true);
    expect(grupos.map((g) => g.codigoBarras)).toEqual([
      '7890070035629',
      '7890070039733',
      '7890070038361',
      '7890070036992',
    ]);
    expect(grupos[0].ofertas[0]).toMatchObject({
      mercadoNome: 'Atacarejo Econômico',
      precoPorUnidade: 1.23,
      unidade: 'rolo',
      desatualizado: false,
    });
  });

  it('ordem=unidade explícito é igual ao padrão; ordem=embalagem ordena pelo preço da embalagem', async () => {
    const padrao = (await get('/busca?q=papel%20higienico')).json();
    expect((await get('/busca?q=papel%20higienico&ordem=unidade')).json()).toEqual(padrao);
    const emb = (await get('/busca?q=papel%20higienico&ordem=embalagem')).json() as GrupoProduto[];
    expect(emb.map((g) => g.codigoBarras)).toEqual([
      '7890070036992',
      '7890070035629',
      '7890070039733',
      '7890070038361',
    ]);
  });

  it('sem q: 400', async () => {
    const res = await get('/busca');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Informe o que deseja buscar' });
    expect(await amb.repo.listarBuscas()).toHaveLength(0);
  });

  it('q repetido não é texto: 400', async () => {
    expect((await get('/busca?q=arroz&q=sal')).statusCode).toBe(400);
  });

  it.each(['/busca?q=arroz&ordem=preco', '/busca?q=arroz&ordem=', '/busca?q=arroz&ordem=UNIDADE'])(
    '%s: ordem inválida, 400',
    async (url) => {
      const res = await get(url);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ erro: 'Ordem inválida' });
    },
  );

  it.each(['q=', 'q=a', 'q=%25', 'q=_', `q=${'a'.repeat(500)}`, 'q=um+dois+tres+quatro+cinco+seis+sete+oito+nove'])(
    '%s: 200 com [] e sem registrar',
    async (consulta) => {
      const res = await get(`/busca?${consulta.slice(0, 120)}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
      expect(await amb.repo.listarBuscas()).toHaveLength(0);
    },
  );

  it('registra a busca com o usuário que a fez', async () => {
    const { id, token: tk } = await amb.criarComPapel('cliente', 'outro@exemplo.com');
    await get('/busca?q=papel%20higienico', tk);
    expect(await amb.repo.listarBuscas()).toEqual([
      { usuarioId: id, termo: 'papel higienico', resultados: 4, mercadosDistintos: 3 },
    ]);
  });
});

describe('GET /mercados', () => {
  it('lista os mercados ativos por nome com o total de produtos disponíveis', async () => {
    const res = await get('/mercados');
    expect(res.statusCode).toBe(200);
    const lista = res.json() as { id: number; nome: string; endereco: string; totalProdutos: number }[];
    expect(lista.map((m) => m.nome)).toEqual([
      'Atacarejo Econômico',
      'Empório Sonia',
      'Mercado Bom Preço',
      'Supermercado Estrela da Vila',
    ]);
    expect(Object.keys(lista[0]).sort()).toEqual(['endereco', 'id', 'nome', 'totalProdutos']);
    for (const m of lista) {
      const disponiveis = (await amb.repo.listarOfertasDoMercado(m.id)).filter((o) => o.disponivel).length;
      expect(m.totalProdutos).toBe(disponiveis);
      expect(m.totalProdutos).toBeGreaterThan(0);
    }
    // o Empório tem um produto indisponível, que não conta
    const todas = await amb.repo.listarOfertasDoMercado(3);
    expect(lista.find((m) => m.id === 3)!.totalProdutos).toBe(todas.length - 1);
  });

  it('mercado removido some da lista', async () => {
    await amb.repo.atualizarMercado(2, { status: 'removido' });
    const lista = (await get('/mercados')).json() as { id: number }[];
    expect(lista.map((m) => m.id).sort()).toEqual([1, 3, 4]);
  });
});

describe('GET /mercados/:id/produtos', () => {
  function ofertaExtra(mercadoId: number, i: number, extra: Partial<OfertaArmazenada> = {}): OfertaArmazenada {
    const nome = `Zeta ${String(i).padStart(3, '0')}`;
    return {
      mercadoId,
      codigoBarras: `99${String(i).padStart(11, '0')}`,
      nome,
      nomeNorm: normalizarTexto(nome),
      preco: 5,
      quantidadeTexto: '500 g',
      quantidadeValor: 0.5,
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

  it('devolve os produtos disponíveis do mercado, ordenados pelo nome, com total', async () => {
    const res = await get('/mercados/3/produtos');
    expect(res.statusCode).toBe(200);
    const { itens, total } = res.json() as { itens: ProdutoMercado[]; total: number };
    const disponiveis = (await amb.repo.listarOfertasDoMercado(3)).filter((o) => o.disponivel);
    expect(total).toBe(disponiveis.length);
    expect(itens).toHaveLength(disponiveis.length);
    const esperado = [...disponiveis]
      .sort((a, b) => (a.nomeNorm < b.nomeNorm ? -1 : a.nomeNorm > b.nomeNorm ? 1 : a.codigoBarras < b.codigoBarras ? -1 : 1))
      .map((o) => o.codigoBarras);
    expect(itens.map((i) => i.codigoBarras)).toEqual(esperado);
    expect(itens.map((i) => i.codigoBarras)).not.toContain('7890070005486'); // óleo indisponível
    const fox12 = itens.find((i) => i.codigoBarras === '7890070035629')!;
    expect(fox12).toEqual({
      codigoBarras: '7890070035629',
      nome: 'PAPEL HIGIENICO FOX FOLHA DUPLA',
      preco: 18.5,
      quantidadeTexto: '12rolos',
      precoPorUnidade: 1.54,
      unidade: 'rolo',
      atualizadoEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      diasDesdeAtualizacao: 0,
      desatualizado: false,
    });
    const fox4 = itens.find((i) => i.codigoBarras === '7890070036992')!;
    expect(fox4).toMatchObject({ quantidadeTexto: null, precoPorUnidade: null, unidade: null });
  });

  it('pagina de 50 em 50', async () => {
    for (let i = 1; i <= 120; i++) await amb.repo.salvarOferta(ofertaExtra(1, i));
    const total = (await amb.repo.listarOfertasDoMercado(1)).length;
    expect(total).toBeGreaterThan(120);

    const p1 = (await get('/mercados/1/produtos')).json() as { itens: ProdutoMercado[]; total: number };
    const p1b = (await get('/mercados/1/produtos?pagina=1')).json();
    expect(p1b).toEqual(p1);
    expect(p1.total).toBe(total);
    expect(p1.itens).toHaveLength(50);

    const p2 = (await get('/mercados/1/produtos?pagina=2')).json() as { itens: ProdutoMercado[]; total: number };
    expect(p2.total).toBe(total);
    expect(p2.itens).toHaveLength(50);
    expect(new Set([...p1.itens, ...p2.itens].map((i) => i.codigoBarras)).size).toBe(100);

    const ultima = Math.ceil(total / 50);
    const pu = (await get(`/mercados/1/produtos?pagina=${ultima}`)).json() as { itens: ProdutoMercado[] };
    expect(pu.itens).toHaveLength(total - (ultima - 1) * 50);

    const alem = await get(`/mercados/1/produtos?pagina=${ultima + 1}`);
    expect(alem.statusCode).toBe(200);
    expect(alem.json()).toEqual({ itens: [], total });
  });

  it.each(['0', '-1', 'abc', '1.5', '', ' 2', '1e2', '99999999999999999999'])('pagina=%j: 400', async (pagina) => {
    const res = await get(`/mercados/1/produtos?pagina=${encodeURIComponent(pagina)}`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Página inválida' });
  });

  it('mercado removido ou inexistente: 404', async () => {
    await amb.repo.atualizarMercado(1, { status: 'removido' });
    for (const url of ['/mercados/1/produtos', '/mercados/999/produtos', '/mercados/abc/produtos']) {
      const res = await get(url);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ erro: 'Mercado não encontrado' });
    }
  });

  it('marca como desatualizado só depois de 7 dias', async () => {
    const o = (await amb.repo.acharOferta(4, '7890070035629'))!;
    await amb.repo.salvarOferta({ ...o, precoAtualizadoEm: new Date(Date.now() - 8 * 86_400_000 - 60_000) });
    const { itens } = (await get('/mercados/4/produtos')).json() as { itens: ProdutoMercado[] };
    const velho = itens.find((i) => i.codigoBarras === '7890070035629')!;
    expect(velho).toMatchObject({ diasDesdeAtualizacao: 8, desatualizado: true });
    expect(itens.filter((i) => i.desatualizado)).toHaveLength(1);
  });
});
