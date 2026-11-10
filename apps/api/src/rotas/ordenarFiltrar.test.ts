import { normalizarTexto, type GrupoProduto } from '@mercado/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Mercado, OfertaArmazenada } from '../repositorio';
import { type Ambiente, criarAmbiente } from './apoioTeste';

// Rotas públicas /busca, /produtos e /catalogo com ordenação, filtros e promoção.

const ARROZ = '7891000000011';
const FEIJAO = '7891000000028';

let amb: Ambiente;
let a: Mercado;
let b: Mercado;

const oferta = (mercadoId: number, codigoBarras: string, nome: string, preco: number, extra: Partial<OfertaArmazenada> = {}): OfertaArmazenada => ({
  mercadoId, codigoBarras, nome, nomeNorm: normalizarTexto(nome), preco, quantidadeTexto: '1 kg', quantidadeValor: 1, quantidadeUnidade: 'kg',
  categoria: null, disponivel: true, precoAtualizadoEm: new Date(), promocaoPreco: null, promocaoInicio: null, promocaoFim: null, ...extra,
});

async function novoMercado(nome: string, endereco: string): Promise<Mercado> {
  return amb.repo.criarMercado({ nome, endereco, nomeNorm: normalizarTexto(nome), enderecoNorm: normalizarTexto(endereco), status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
}

beforeEach(async () => {
  amb = await criarAmbiente();
  a = await novoMercado('Comércio A', 'Rua A, 1');
  b = await novoMercado('Comércio B', 'Rua B, 2');
  const em2dias = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  await amb.repo.salvarOferta(oferta(a.id, ARROZ, 'Arroz Tipo 1 1kg', 6, { promocaoPreco: 4, promocaoInicio: new Date(Date.now() - 3600_000), promocaoFim: em2dias }));
  await amb.repo.salvarOferta(oferta(b.id, ARROZ, 'Arroz Tipo 1 1kg', 5));
  await amb.repo.salvarOferta(oferta(a.id, FEIJAO, 'Feijão Carioca 1kg', 9));
});

const pegar = async <T>(url: string) => {
  const res = await amb.app.inject({ method: 'GET', url });
  return { status: res.statusCode, corpo: res.json() as T };
};

describe('GET /produtos com ordenar e filtros', () => {
  it('maior preço e menor preço mudam a ordem', async () => {
    const menor = await pegar<{ grupos: GrupoProduto[] }>('/produtos?ordenar=menor-preco');
    expect(menor.corpo.grupos.map((g) => g.codigoBarras)).toEqual([ARROZ, FEIJAO]); // arroz em promoção a R$ 4
    const maior = await pegar<{ grupos: GrupoProduto[] }>('/produtos?ordenar=maior-preco');
    expect(maior.corpo.grupos.map((g) => g.codigoBarras)).toEqual([FEIJAO, ARROZ]);
  });

  it('filtro de comércio, faixa de preço, só promoção e só comparáveis', async () => {
    const soB = await pegar<{ grupos: GrupoProduto[]; total: number }>(`/produtos?comercios=${b.id}`);
    expect(soB.corpo.grupos.map((g) => g.codigoBarras)).toEqual([ARROZ]);
    expect(soB.corpo.total).toBe(1);

    const faixa = await pegar<{ grupos: GrupoProduto[] }>('/produtos?precoMin=8');
    expect(faixa.corpo.grupos.map((g) => g.codigoBarras)).toEqual([FEIJAO]);

    const promo = await pegar<{ grupos: GrupoProduto[] }>('/produtos?promocao=1');
    expect(promo.corpo.grupos).toHaveLength(1);
    expect(promo.corpo.grupos[0]!.ofertas).toHaveLength(1);
    expect(promo.corpo.grupos[0]!.ofertas[0]).toMatchObject({ mercadoId: a.id, preco: 4, precoOriginal: 6 });

    const comparaveis = await pegar<{ grupos: GrupoProduto[] }>('/produtos?comparaveis=1');
    expect(comparaveis.corpo.grupos.map((g) => g.codigoBarras)).toEqual([ARROZ]);
  });

  it('valores inválidos: 400 com a explicação', async () => {
    for (const [url, erro] of [
      ['/produtos?ordenar=barato', 'Ordenação inválida'],
      ['/produtos?precoMin=abc', 'Preço mínimo inválido'],
      ['/produtos?precoMax=-1', 'Preço máximo inválido'],
      ['/produtos?unidade=metro', 'Unidade inválida'],
      ['/produtos?comercios=1,x', 'Comércios inválidos'],
    ] as const) {
      const r = await pegar<{ erro: string }>(url);
      expect(r.status, url).toBe(400);
      expect(r.corpo.erro).toBe(erro);
    }
  });

  it('aceita vírgula nos preços (como se digita no Brasil)', async () => {
    const r = await pegar<{ grupos: GrupoProduto[] }>('/produtos?precoMin=8,5');
    expect(r.status).toBe(200);
    expect(r.corpo.grupos.map((g) => g.codigoBarras)).toEqual([FEIJAO]);
  });
});

describe('GET /busca com ordenar e filtros', () => {
  it('a promoção entra no preço e a busca respeita os filtros', async () => {
    const r = await pegar<GrupoProduto[]>('/busca?q=arroz&ordenar=menor-preco');
    expect(r.corpo[0]!.ofertas[0]).toMatchObject({ mercadoId: a.id, preco: 4, precoOriginal: 6 });
    const soB = await pegar<GrupoProduto[]>(`/busca?q=arroz&comercios=${b.id}`);
    expect(soB.corpo[0]!.ofertas.map((o) => o.mercadoId)).toEqual([b.id]);
    expect((await pegar<{ erro: string }>('/busca?q=arroz&ordenar=x')).status).toBe(400);
  });
});

describe('promoção no catálogo e nos produtos do comércio', () => {
  it('o catálogo leva os campos da promoção só de quem tem', async () => {
    const r = await pegar<{ ofertas: { mercadoId: number; codigoBarras: string; precoPromocional?: number }[] }>('/catalogo');
    expect(r.corpo.ofertas.find((o) => o.mercadoId === a.id && o.codigoBarras === ARROZ)?.precoPromocional).toBe(4);
    expect(r.corpo.ofertas.find((o) => o.mercadoId === b.id && o.codigoBarras === ARROZ)).not.toHaveProperty('precoPromocional');
  });

  it('a lista do comércio mostra o preço promocional e o normal', async () => {
    const r = await pegar<{ itens: { codigoBarras: string; preco: number; precoOriginal?: number }[] }>(`/mercados/${a.id}/produtos`);
    expect(r.corpo.itens.find((i) => i.codigoBarras === ARROZ)).toMatchObject({ preco: 4, precoOriginal: 6 });
    expect(r.corpo.itens.find((i) => i.codigoBarras === FEIJAO)?.precoOriginal).toBeUndefined();
  });

  it('promoção vencida ou que ainda não começou não vale', async () => {
    await amb.repo.salvarOferta(oferta(a.id, FEIJAO, 'Feijão Carioca 1kg', 9, { promocaoPreco: 5, promocaoInicio: new Date(Date.now() - 10 * 24 * 3600_000), promocaoFim: new Date(Date.now() - 3600_000) }));
    const r = await pegar<{ itens: { codigoBarras: string; preco: number; precoOriginal?: number }[] }>(`/mercados/${a.id}/produtos`);
    expect(r.corpo.itens.find((i) => i.codigoBarras === FEIJAO)).toMatchObject({ preco: 9 });
  });
});
