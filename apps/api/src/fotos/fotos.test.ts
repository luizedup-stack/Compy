import { describe, expect, it, vi } from 'vitest';
import type { OfertaArmazenada } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { criarGerenciadorDeFotos } from './gerenciador';
import { candidatosDoCodigo, criarBuscadorOpenFoodFacts, ErroTemporario, type BuscadorDeFotos } from './openFoodFacts';

const UA = 'BolsoCertoTeste/1.0 (contato@exemplo.com)';
const IMG = 'https://images.openfoodfacts.org/images/products/789/100/010/0103/front_pt.200.jpg';

const resposta = (status: number, corpo?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as unknown as Response;

describe('candidatosDoCodigo', () => {
  it('UPC-A de 12 dígitos também é consultado como EAN-13 (com um zero na frente)', () => {
    expect(candidatosDoCodigo('012345678905')).toEqual(['012345678905', '0012345678905']);
  });
  it('GTIN-14 que começa com zero também é consultado sem o zero', () => {
    expect(candidatosDoCodigo('07891000100103')).toEqual(['07891000100103', '7891000100103']);
  });
  it('EAN-13 e EAN-8 ficam como estão', () => {
    expect(candidatosDoCodigo('7891000100103')).toEqual(['7891000100103']);
    expect(candidatosDoCodigo('96385074')).toEqual(['96385074']);
  });
});

describe('buscador do Open Food Facts', () => {
  const buscador = (fetchFn: typeof fetch) => criarBuscadorOpenFoodFacts({ userAgent: UA, fetchFn, tempoLimiteMs: 200 });

  it('devolve a foto de frente, pequena, e se identifica no User-Agent', async () => {
    const fetchFn = vi.fn(async () => resposta(200, { status: 1, product: { image_front_small_url: IMG, image_front_url: 'https://images.openfoodfacts.org/grande.jpg' } }));
    expect(await buscador(fetchFn as unknown as typeof fetch).buscar('7891000100103')).toEqual({ url: IMG });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://world.openfoodfacts.org/api/v2/product/7891000100103.json?fields=image_front_small_url,image_front_url,image_url');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(UA);
  });

  it('sem a foto pequena, usa a normal; depois a geral', async () => {
    const a = vi.fn(async () => resposta(200, { status: 1, product: { image_front_url: IMG } }));
    expect(await buscador(a as unknown as typeof fetch).buscar('1')).toEqual({ url: IMG });
    const b = vi.fn(async () => resposta(200, { status: 1, product: { image_url: IMG } }));
    expect(await buscador(b as unknown as typeof fetch).buscar('1')).toEqual({ url: IMG });
  });

  it('produto que não existe (404 ou status 0) ou sem foto: null', async () => {
    expect(await buscador((async () => resposta(404, { status: 0 })) as unknown as typeof fetch).buscar('1')).toBeNull();
    expect(await buscador((async () => resposta(200, { status: 0 })) as unknown as typeof fetch).buscar('1')).toBeNull();
    expect(await buscador((async () => resposta(200, { status: 1, product: {} })) as unknown as typeof fetch).buscar('1')).toBeNull();
  });

  it('não aceita imagem de outro site nem http (a resposta vem de fora)', async () => {
    const f = async (u: string) => (async () => resposta(200, { status: 1, product: { image_front_small_url: u } })) as unknown as typeof fetch;
    expect(await buscador(await f('https://site-malicioso.com/x.jpg')).buscar('1')).toBeNull();
    expect(await buscador(await f('http://images.openfoodfacts.org/x.jpg')).buscar('1')).toBeNull();
    expect(await buscador(await f('https://openfoodfacts.org.malicioso.com/x.jpg')).buscar('1')).toBeNull();
    expect(await buscador(await f('javascript:alert(1)')).buscar('1')).toBeNull();
  });

  it('tenta o código de 13 dígitos quando o de 12 não existe', async () => {
    const fetchFn = vi.fn(async (u: string) => (u.includes('/0012345678905.json') ? resposta(200, { status: 1, product: { image_front_small_url: IMG } }) : resposta(404)));
    expect(await buscador(fetchFn as unknown as typeof fetch).buscar('012345678905')).toEqual({ url: IMG });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('limite de consultas (429), servidor com erro (5xx), rede e tempo esgotado: erro temporário, não "não achou"', async () => {
    for (const f of [
      async () => resposta(429),
      async () => resposta(503),
      async () => {
        throw new TypeError('fetch failed');
      },
      (_u: string, init?: RequestInit) => new Promise<Response>((_ok, erro) => init!.signal!.addEventListener('abort', () => erro(new Error('abortado')))),
    ]) {
      await expect(buscador(f as unknown as typeof fetch).buscar('1')).rejects.toBeInstanceOf(ErroTemporario);
    }
  });
});

describe('gerenciador de fotos', () => {
  const oferta = (mercadoId: number, codigoBarras: string): OfertaArmazenada => ({
    mercadoId, codigoBarras, nome: 'Produto', nomeNorm: 'produto', preco: 1, quantidadeTexto: null, quantidadeValor: null, quantidadeUnidade: null,
    categoria: null, disponivel: true, precoAtualizadoEm: new Date('2026-11-01T00:00:00Z'), promocaoPreco: null, promocaoInicio: null, promocaoFim: null,
  });

  async function cenario(codigos: string[]) {
    const repo = criarRepositorioMemoria();
    const m = await repo.criarMercado({ nome: 'A', endereco: 'Rua 1', nomeNorm: 'a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    for (const c of codigos) await repo.salvarOferta(oferta(m.id, c));
    return { repo, m };
  }
  const sem = { intervaloMs: 0, esperar: async () => undefined };

  it('procura o que falta: grava as fotos achadas e marca como "não achou" as que não existem', async () => {
    const { repo } = await cenario(['7890000000001', '7890000000002']);
    const buscador: BuscadorDeFotos = { buscar: async (c) => (c.endsWith('1') ? { url: IMG } : null) };
    const resumo = await criarGerenciadorDeFotos({ repo, buscador, ...sem }).processarPendentes();
    expect(resumo).toEqual({ achadas: 1, naoAchadas: 1, adiadas: false });
    expect(await repo.listarCodigosComFoto()).toEqual(['7890000000001']);
    expect(await repo.acharFoto('7890000000002')).toMatchObject({ url: null, imagem: null }); // procurou e não achou
  });

  it('cada produto é consultado uma vez só, mesmo rodando de novo', async () => {
    const { repo } = await cenario(['7890000000001', '7890000000002']);
    const buscar = vi.fn(async () => null);
    const g = criarGerenciadorDeFotos({ repo, buscador: { buscar }, ...sem });
    await g.processarPendentes();
    await g.processarPendentes();
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('o que não foi achado é procurado de novo depois de alguns dias', async () => {
    const { repo } = await cenario(['7890000000001']);
    const buscar = vi.fn(async () => null);
    let agora = new Date('2026-11-07T00:00:00Z');
    const g = criarGerenciadorDeFotos({ repo, buscador: { buscar }, agora: () => agora, tentarDeNovoAposDias: 30, ...sem });
    await g.processarPendentes();
    agora = new Date('2026-11-20T00:00:00Z'); // 13 dias depois: ainda não
    await g.processarPendentes();
    expect(buscar).toHaveBeenCalledTimes(1);
    agora = new Date('2026-12-10T00:00:00Z'); // 33 dias depois: agora sim
    await g.processarPendentes();
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('serviço pedindo calma (erro temporário): para, não marca "não achou" e o resto fica para depois', async () => {
    const { repo } = await cenario(['7890000000001', '7890000000002', '7890000000003']);
    let n = 0;
    const buscador: BuscadorDeFotos = {
      buscar: async () => {
        if (++n === 2) throw new ErroTemporario('limite');
        return { url: IMG };
      },
    };
    const resumo = await criarGerenciadorDeFotos({ repo, buscador, ...sem }).processarPendentes();
    expect(resumo).toEqual({ achadas: 1, naoAchadas: 0, adiadas: true });
    expect(await repo.acharFoto('7890000000002')).toBeNull();
    expect(await repo.listarCodigosSemFoto(10, new Date(0))).toEqual(['7890000000002', '7890000000003']);
  });

  it('a foto enviada por um mercado enquanto procurava não é sobrescrita', async () => {
    const { repo, m } = await cenario(['7890000000001']);
    const buscador: BuscadorDeFotos = {
      buscar: async (c) => {
        await repo.salvarFoto({ codigoBarras: c, origem: 'mercado', url: null, imagem: 'data:image/jpeg;base64,AAAA', mercadoId: m.id, atualizadaEm: new Date() });
        return { url: IMG };
      },
    };
    await criarGerenciadorDeFotos({ repo, buscador, ...sem }).processarPendentes();
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'mercado', imagem: 'data:image/jpeg;base64,AAAA' });
  });

  it('agendarPendentes volta na hora, roda em segundo plano e não roda duas vezes ao mesmo tempo', async () => {
    const { repo } = await cenario(['7890000000001']);
    let simultaneas = 0;
    let maxima = 0;
    const buscador: BuscadorDeFotos = {
      buscar: async () => {
        simultaneas += 1;
        maxima = Math.max(maxima, simultaneas);
        await new Promise((r) => setTimeout(r, 20));
        simultaneas -= 1;
        return { url: IMG };
      },
    };
    const g = criarGerenciadorDeFotos({ repo, buscador, ...sem });
    g.agendarPendentes();
    g.agendarPendentes();
    g.agendarPendentes();
    await vi.waitFor(async () => expect(await repo.listarCodigosComFoto()).toEqual(['7890000000001']));
    expect(maxima).toBe(1);
  });
});
