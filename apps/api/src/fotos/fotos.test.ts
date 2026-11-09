import { describe, expect, it, vi } from 'vitest';
import type { OfertaArmazenada } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { ImagemInvalida } from './baixar';
import { criarGerenciadorDeFotos } from './gerenciador';
import { CHAVE_ILUSTRATIVA, CHAVE_ILUSTRATIVA_SEM, escolherIlustrativa, palavrasDoNome, type Categoria, type EntradaIlustrativa } from './ilustrativas';
import { candidatosDoCodigo, criarBuscadorOpenFoodFacts, criarBuscadorPorNomeOpenFoodFacts, ErroTemporario, parecenca, termosDoNome, type BuscadorDeFotos, type BuscadorPorNome } from './openFoodFacts';

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
  const IMAGEM = 'data:image/jpeg;base64,/9j/4AAQ';
  const sem = { intervaloMs: 0, esperar: async () => undefined, baixador: async () => IMAGEM };

  it('procura o que falta: grava as fotos achadas e marca como "não achou" as que não existem', async () => {
    const { repo } = await cenario(['7890000000001', '7890000000002']);
    const buscador: BuscadorDeFotos = { buscar: async (c) => (c.endsWith('1') ? { url: IMG } : null) };
    const resumo = await criarGerenciadorDeFotos({ repo, buscador, ...sem }).processarPendentes();
    expect(resumo).toEqual({ achadas: 1, naoAchadas: 1, ilustrativas: 0, adiadas: false });
    expect(await repo.listarCodigosComFoto()).toEqual(['7890000000001']);
    // A imagem é BAIXADA e guardada no banco (não só o link): a foto não depende do outro site depois.
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'openfoodfacts', url: IMG, imagem: IMAGEM });
    expect(await repo.acharFoto('7890000000002')).toMatchObject({ url: null, imagem: null }); // procurou e não achou
  });

  it('achou o produto mas a imagem não presta: vale como "sem foto" (sem erro)', async () => {
    const { repo } = await cenario(['7890000000001']);
    const buscador: BuscadorDeFotos = { buscar: async () => ({ url: IMG }) };
    const baixador = async () => {
      throw new ImagemInvalida('não é imagem');
    };
    const resumo = await criarGerenciadorDeFotos({ repo, buscador, ...sem, baixador }).processarPendentes();
    expect(resumo).toEqual({ achadas: 0, naoAchadas: 1, ilustrativas: 0, adiadas: false });
    expect(await repo.listarCodigosComFoto()).toEqual([]);
  });

  describe('fotos indicadas na planilha do mercado (coluna "Foto")', () => {
    const planilha = (codigoBarras: string, url: string) => ({ codigoBarras, origem: 'planilha' as const, url, imagem: null, mercadoId: null, atualizadaEm: new Date('2026-11-01T00:00:00Z') });

    it('baixa o link e guarda a imagem no banco, sem precisar do banco aberto', async () => {
      const { repo } = await cenario(['7890000000001']);
      await repo.salvarFoto(planilha('7890000000001', 'https://loja.exemplo.com/a.jpg'));
      const buscar = vi.fn(async () => null);
      const baixador = vi.fn(async () => IMAGEM);
      const resumo = await criarGerenciadorDeFotos({ repo, buscador: { buscar }, ...sem, baixador }).processarPendentes();
      expect(baixador).toHaveBeenCalledWith('https://loja.exemplo.com/a.jpg');
      expect(buscar).not.toHaveBeenCalled(); // já tinha foto: não precisa procurar
      expect(resumo.achadas).toBe(1);
      expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'planilha', url: 'https://loja.exemplo.com/a.jpg', imagem: IMAGEM });
    });

    it('link que não serve: apaga o registro e o produto é procurado no banco aberto', async () => {
      const { repo } = await cenario(['7890000000001']);
      await repo.salvarFoto(planilha('7890000000001', 'https://loja.exemplo.com/quebrado.jpg'));
      const baixador = vi.fn(async (u: string) => {
        if (u.includes('quebrado')) throw new ImagemInvalida('404');
        return IMAGEM;
      });
      const buscador: BuscadorDeFotos = { buscar: async () => ({ url: IMG }) };
      await criarGerenciadorDeFotos({ repo, buscador, ...sem, baixador }).processarPendentes();
      expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'openfoodfacts', url: IMG, imagem: IMAGEM });
    });

    it('serviço fora do ar ao baixar: para, não apaga o link e tenta de novo depois', async () => {
      const { repo } = await cenario(['7890000000001']);
      await repo.salvarFoto(planilha('7890000000001', 'https://loja.exemplo.com/a.jpg'));
      const baixador = async () => {
        throw new ErroTemporario('sem resposta');
      };
      const resumo = await criarGerenciadorDeFotos({ repo, buscador: { buscar: async () => null }, ...sem, baixador }).processarPendentes();
      expect(resumo.adiadas).toBe(true);
      expect(await repo.acharFoto('7890000000001')).toMatchObject({ url: 'https://loja.exemplo.com/a.jpg', imagem: null });
      expect(await repo.listarFotosParaBaixar(10)).toHaveLength(1);
    });

    it('a foto que um mercado enviou à mão enquanto baixava não é sobrescrita', async () => {
      const { repo, m } = await cenario(['7890000000001']);
      await repo.salvarFoto(planilha('7890000000001', 'https://loja.exemplo.com/a.jpg'));
      const baixador = async () => {
        await repo.salvarFoto({ codigoBarras: '7890000000001', origem: 'mercado', url: null, imagem: 'data:image/jpeg;base64,MANUAL', mercadoId: m.id, atualizadaEm: new Date() });
        return IMAGEM;
      };
      await criarGerenciadorDeFotos({ repo, buscador: { buscar: async () => null }, ...sem, baixador }).processarPendentes();
      expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'mercado', imagem: 'data:image/jpeg;base64,MANUAL' });
    });
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
    expect(resumo).toEqual({ achadas: 1, naoAchadas: 0, ilustrativas: 0, adiadas: true });
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

describe('termosDoNome e parecença', () => {
  it('fica só com as palavras que identificam o produto', () => {
    expect(termosDoNome('Leite Integral Piracanjuba 1L')).toEqual(['leite', 'integral', 'piracanjuba']);
    expect(termosDoNome('PAPEL HIGIÊNICO Neve Folha Dupla 12 rolos')).toEqual(['papel', 'higienico', 'neve', 'dupla']);
    expect(termosDoNome('Arroz Tipo 1 Tio João 5kg')).toEqual(['arroz', 'tio', 'joao']);
  });

  it('parecença: fração dos termos buscados que aparecem no nome e na marca do produto achado', () => {
    const termos = ['leite', 'integral', 'parmalat'];
    expect(parecenca(termos, { product_name: 'Leite UHT Integral Parmalat 1 Litro', brands: 'Parmalat' })).toBe(1);
    expect(parecenca(termos, { product_name: 'Leite em pó integral', brands: 'Parmalat' })).toBe(1); // a marca conta
    expect(parecenca(termos, { product_name: 'Leite integral', brands: 'Outra' })).toBeCloseTo(2 / 3);
    expect(parecenca(termos, { product_name: 'Suco de laranja', brands: 'Del Valle' })).toBe(0);
    expect(parecenca([], { product_name: 'x' })).toBe(0);
  });
});

describe('busca por nome no Open Food Facts', () => {
  const corpo = (produtos: unknown[]) => ({ count: produtos.length, products: produtos });
  const buscador = (fetchFn: typeof fetch) => criarBuscadorPorNomeOpenFoodFacts({ userAgent: UA, fetchFn, tempoLimiteMs: 200 });
  const produto = (nome: string, marca: string, img: string | null = IMG) => ({ code: '1', product_name: nome, brands: marca, image_front_small_url: img });

  it('procura só entre produtos do Brasil, pelas palavras que importam, e se identifica', async () => {
    const fetchFn = vi.fn(async () => resposta(200, corpo([produto('Leite UHT Integral Parmalat 1 Litro', 'Parmalat')])));
    expect(await buscador(fetchFn as unknown as typeof fetch).buscarPorNome('Leite Integral Parmalat 1L')).toEqual({ url: IMG });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const q = new URL(url).searchParams;
    expect(q.get('search_terms')).toBe('leite integral parmalat');
    expect(q.get('tag_0')).toBe('brazil'); // nada de foto de produto de outro país
    expect(q.get('json')).toBe('1');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(UA);
  });

  it('escolhe o resultado mais parecido e ignora os parecidos demais de outro produto', async () => {
    const fetchFn = vi.fn(async () => resposta(200, corpo([
      produto('Suco de laranja', 'Del Valle', 'https://images.openfoodfacts.org/suco.jpg'),
      produto('Leite integral', 'Outra marca', 'https://images.openfoodfacts.org/meio.jpg'),
      produto('Leite UHT Integral Parmalat', 'Parmalat', 'https://images.openfoodfacts.org/certo.jpg'),
    ])));
    expect(await buscador(fetchFn as unknown as typeof fetch).buscarPorNome('Leite Integral Parmalat 1L')).toEqual({ url: 'https://images.openfoodfacts.org/certo.jpg' });
  });

  it('sem nenhum resultado parecido o bastante, não chuta: null', async () => {
    const fetchFn = vi.fn(async () => resposta(200, corpo([produto('Suco de laranja', 'Del Valle'), produto('Leite condensado', 'Moça')])));
    expect(await buscador(fetchFn as unknown as typeof fetch).buscarPorNome('Leite Integral Parmalat 1L')).toBeNull();
  });

  it('resultado sem foto é ignorado; foto de outro site (não do Open Food Facts) também', async () => {
    const f = (img: string | null) => vi.fn(async () => resposta(200, corpo([produto('Leite Integral Parmalat', 'Parmalat', img)]))) as unknown as typeof fetch;
    expect(await buscador(f(null)).buscarPorNome('Leite Integral Parmalat')).toBeNull();
    expect(await buscador(f('https://site-malicioso.com/x.jpg')).buscarPorNome('Leite Integral Parmalat')).toBeNull();
  });

  it('nome curto demais (uma palavra só) não é procurado: qualquer resultado seria chute, e a consulta nem é feita', async () => {
    const fetchFn = vi.fn();
    expect(await buscador(fetchFn as unknown as typeof fetch).buscarPorNome('Leite 1L')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('limite de consultas, serviço indisponível (503) e rede: erro passageiro, não "não achou"', async () => {
    for (const f of [async () => resposta(429), async () => resposta(503), async () => { throw new TypeError('fetch failed'); }]) {
      await expect(buscador(f as unknown as typeof fetch).buscarPorNome('Leite Integral Parmalat')).rejects.toBeInstanceOf(ErroTemporario);
    }
  });
});

describe('gerenciador: busca por nome', () => {
  const IMAGEM = 'data:image/jpeg;base64,/9j/4AAQ';
  async function cenario(produtos: [string, string][]) {
    const repo = criarRepositorioMemoria();
    const m = await repo.criarMercado({ nome: 'A', endereco: 'Rua 1', nomeNorm: 'a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    for (const [codigo, nome] of produtos) {
      await repo.salvarOferta({ mercadoId: m.id, codigoBarras: codigo, nome, nomeNorm: nome.toLowerCase(), preco: 1, quantidadeTexto: null, quantidadeValor: null, quantidadeUnidade: null, categoria: null, disponivel: true, precoAtualizadoEm: new Date(), promocaoPreco: null, promocaoInicio: null, promocaoFim: null });
    }
    return repo;
  }
  const base = { baixador: async () => IMAGEM, esperar: async () => undefined, intervaloMs: 0, intervaloPorNomeMs: 0 };
  const semCodigo: BuscadorDeFotos = { buscar: async () => null }; // o código de barras não existe no banco aberto

  it('quando o código não existe, procura pelo nome do produto e guarda a foto achada', async () => {
    const repo = await cenario([['7890000000001', 'Leite Integral Parmalat 1L']]);
    const porNome: BuscadorPorNome = { buscarPorNome: vi.fn(async () => ({ url: IMG })) };
    const resumo = await criarGerenciadorDeFotos({ repo, buscador: semCodigo, buscadorPorNome: porNome, ...base }).processarPendentes();
    expect(resumo.achadas).toBe(1);
    expect(porNome.buscarPorNome).toHaveBeenCalledWith('Leite Integral Parmalat 1L');
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'openfoodfacts', url: IMG, imagem: IMAGEM });
  });

  it('se o código existe no banco aberto, não procura pelo nome (o código é mais certo)', async () => {
    const repo = await cenario([['7890000000001', 'Leite Integral Parmalat 1L']]);
    const porNome: BuscadorPorNome = { buscarPorNome: vi.fn(async () => ({ url: 'https://images.openfoodfacts.org/outra.jpg' })) };
    await criarGerenciadorDeFotos({ repo, buscador: { buscar: async () => ({ url: IMG }) }, buscadorPorNome: porNome, ...base }).processarPendentes();
    expect(porNome.buscarPorNome).not.toHaveBeenCalled();
    expect((await repo.acharFoto('7890000000001'))?.url).toBe(IMG);
  });

  it('sem o buscador por nome (FOTOS_POR_NOME=0), só procura pelo código', async () => {
    const repo = await cenario([['7890000000001', 'Leite Integral Parmalat 1L']]);
    const resumo = await criarGerenciadorDeFotos({ repo, buscador: semCodigo, ...base }).processarPendentes();
    expect(resumo).toEqual({ achadas: 0, naoAchadas: 1, ilustrativas: 0, adiadas: false });
  });

  it('espera mais entre as buscas por nome (o serviço limita por minuto)', async () => {
    const repo = await cenario([['7890000000001', 'Leite Integral Parmalat 1L'], ['7890000000002', 'Arroz Tipo 1 Tio Joao 5kg']]);
    const esperas: number[] = [];
    await criarGerenciadorDeFotos({
      repo, buscador: semCodigo, buscadorPorNome: { buscarPorNome: async () => null }, ...base, intervaloMs: 5, intervaloPorNomeMs: 7000,
      esperar: async (ms) => void esperas.push(ms),
    }).processarPendentes();
    expect(esperas.filter((e) => e === 7000)).toHaveLength(2); // uma pausa longa por busca por nome
  });

  it('o serviço de busca pediu calma: para sem marcar "não achou" e se reagenda sozinho', async () => {
    const repo = await cenario([['7890000000001', 'Leite Integral Parmalat 1L'], ['7890000000002', 'Arroz Tipo 1 Tio Joao 5kg']]);
    const reagendamentos: number[] = [];
    const porNome: BuscadorPorNome = { buscarPorNome: async () => { throw new ErroTemporario('503'); } };
    const g = criarGerenciadorDeFotos({ repo, buscador: semCodigo, buscadorPorNome: porNome, ...base, reagendarAposMs: 600_000, agendarDepois: (_f, ms) => void reagendamentos.push(ms) });
    g.agendarPendentes();
    await vi.waitFor(() => expect(reagendamentos).toEqual([600_000]));
    expect(await repo.acharFoto('7890000000001')).toBeNull(); // nada marcado: vai tentar de novo
    expect(await repo.listarCodigosSemFoto(10, new Date(0))).toHaveLength(2);
  });
});

describe('escolha da foto ilustrativa pelo nome do produto', () => {
  const entrada = (id: string, ...palavras: string[]): EntradaIlustrativa => ({ id, palavras, imagem: `data:image/jpeg;base64,${id}` });
  const banco = [
    entrada('leite', 'leite'), entrada('leite-condensado', 'leite', 'condensado'), entrada('creme-de-leite', 'creme', 'leite'),
    entrada('chocolate', 'chocolate'), entrada('achocolatado', 'achocolatado'), entrada('arroz', 'arroz'), entrada('sal', 'sal'),
    entrada('papel-higienico', 'papel', 'higienico'), entrada('agua-sanitaria', 'agua', 'sanitaria'), entrada('leite-em-po', 'leite', 'po'),
  ];
  const id = (nome: string) => escolherIlustrativa(nome, banco)?.id ?? null;

  it('palavrasDoNome tira acento e maiúsculas', () => {
    expect(palavrasDoNome('Água Sanitária 2L')).toEqual(['agua', 'sanitaria', '2l']);
  });

  it('entende abreviações comuns dos nomes ("Papel Hig." é papel higiênico)', () => {
    expect(palavrasDoNome('Papel Hig. X Folha Simples')).toEqual(['papel', 'higienico', 'x', 'folha', 'simples']);
    expect(palavrasDoNome('Det. Líq. Brilho Neutro')[0]).toBe('detergente');
  });

  it.each([
    ['Leite UHT Integral Vale Branco 1L', 'leite'],
    ['LEITE UHT INTEGRAL PARMALAT', 'leite'],
    ['Arroz Branco Tipo 1 Grão Dourado 5kg', 'arroz'],
    ['Papel Higiênico Neve Folha Dupla 12 rolos', 'papel-higienico'],
    ['AGUA SANITARIA CLORO PURO 2L', 'agua-sanitaria'],
    ['Sal Refinado Cisne 1kg', 'sal'],
    ['Papel Hig. Neve Folha Dupla', 'papel-higienico'],
  ])('%s → %s', (nome, esperado) => {
    expect(id(nome)).toBe(esperado);
  });

  it('o tipo mais específico ganha do genérico ("leite condensado" não é "leite")', () => {
    expect(id('Leite Condensado Moça 395g')).toBe('leite-condensado');
    expect(id('Creme de Leite Nestlé 200g')).toBe('creme-de-leite');
    expect(id('Leite em Pó Integral Ninho 400g')).toBe('leite-em-po');
  });

  it('em empate vale a palavra que aparece primeiro: "Chocolate ao Leite" é chocolate, não leite', () => {
    expect(id('Chocolate ao Leite Garoto 90g')).toBe('chocolate');
    expect(id('Leite com Chocolate Nescau')).toBe('leite');
  });

  it('só vale palavra inteira: "achocolatado" não é "chocolate", "salsicha" não é "sal"', () => {
    expect(id('Achocolatado em Pó Toddy')).toBe('achocolatado');
    expect(id('Salsicha Hot Dog Sadia')).toBeNull();
  });

  it('sem nenhum tipo parecido (ou sem banco): null, para o produto ficar "sem foto" em vez de receber foto errada', () => {
    expect(id('Produto Qualquer Xyz')).toBeNull();
    expect(escolherIlustrativa('Leite Integral', [])).toBeNull();
  });
});

describe('gerenciador: foto ilustrativa como último recurso', () => {
  const IMAGEM_ILU = 'data:image/jpeg;base64,ILUSTRATIVA';
  const ilustrativas: EntradaIlustrativa[] = [{ id: 'leite', palavras: ['leite'], imagem: IMAGEM_ILU }];
  async function cenario(codigo: string, nome: string) {
    const repo = criarRepositorioMemoria();
    const m = await repo.criarMercado({ nome: 'A', endereco: 'Rua 1', nomeNorm: 'a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    await repo.salvarOferta({ mercadoId: m.id, codigoBarras: codigo, nome, nomeNorm: nome.toLowerCase(), preco: 1, quantidadeTexto: null, quantidadeValor: null, quantidadeUnidade: null, categoria: null, disponivel: true, precoAtualizadoEm: new Date(), promocaoPreco: null, promocaoInicio: null, promocaoFim: null });
    return repo;
  }
  const base = { baixador: async () => 'data:image/jpeg;base64,REAL', esperar: async () => undefined, intervaloMs: 0, intervaloPorNomeMs: 0 };
  const nada: BuscadorDeFotos = { buscar: async () => null };

  it('serviço pedindo calma na busca por código: o produto recebe a ilustrativa mesmo assim, sem insistir no serviço', async () => {
    const repo = await cenario('7890000000001', 'Leite UHT Integral Vale Branco 1L');
    const buscar = vi.fn(async (): Promise<null> => {
      throw new ErroTemporario('muitas consultas');
    });
    const resumo = await criarGerenciadorDeFotos({ repo, buscador: { buscar }, ilustrativas, ...base }).processarPendentes();
    expect(resumo).toEqual({ achadas: 0, naoAchadas: 0, ilustrativas: 1, adiadas: true });
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'ilustrativa', imagem: IMAGEM_ILU });
  });

  it('sem foto específica, o produto recebe a foto do tipo, marcada como ilustrativa', async () => {
    const repo = await cenario('7890000000001', 'Leite UHT Integral Vale Branco 1L');
    const resumo = await criarGerenciadorDeFotos({ repo, buscador: nada, ilustrativas, ...base }).processarPendentes();
    expect(resumo).toEqual({ achadas: 0, naoAchadas: 0, ilustrativas: 1, adiadas: false });
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'ilustrativa', url: null, imagem: IMAGEM_ILU });
    expect(await repo.listarCodigosComFotoIlustrativa()).toEqual(['7890000000001']);
  });

  it('tipo sem foto no banco ilustrativo: fica "sem foto" (não recebe foto errada)', async () => {
    const repo = await cenario('7890000000001', 'Produto Qualquer Xyz');
    const resumo = await criarGerenciadorDeFotos({ repo, buscador: nada, ilustrativas, ...base }).processarPendentes();
    expect(resumo).toMatchObject({ ilustrativas: 0, naoAchadas: 1 });
    expect(await repo.listarCodigosComFoto()).toEqual([]);
  });

  it('sem o banco ilustrativo (FOTOS_ILUSTRATIVAS=0), nada de foto do tipo', async () => {
    const repo = await cenario('7890000000001', 'Leite UHT Integral Vale Branco 1L');
    const resumo = await criarGerenciadorDeFotos({ repo, buscador: nada, ...base }).processarPendentes();
    expect(resumo).toMatchObject({ ilustrativas: 0, naoAchadas: 1 });
  });

  it('a foto específica que aparece depois troca a ilustrativa', async () => {
    const repo = await cenario('7890000000001', 'Leite UHT Integral Vale Branco 1L');
    let agora = new Date('2026-11-01T00:00:00Z');
    const g = (buscador: BuscadorDeFotos) => criarGerenciadorDeFotos({ repo, buscador, ilustrativas, ...base, agora: () => agora, tentarDeNovoAposDias: 30 });
    await g(nada).processarPendentes();
    expect((await repo.acharFoto('7890000000001'))?.origem).toBe('ilustrativa');
    agora = new Date('2026-12-15T00:00:00Z'); // passou o prazo de procurar de novo
    await g({ buscar: async () => ({ url: IMG }) }).processarPendentes();
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'openfoodfacts', imagem: 'data:image/jpeg;base64,REAL' });
    expect(await repo.listarCodigosComFotoIlustrativa()).toEqual([]);
  });

  it('se continua sem a específica, mantém a ilustrativa (não a apaga) e só adia a próxima procura', async () => {
    const repo = await cenario('7890000000001', 'Leite UHT Integral Vale Branco 1L');
    let agora = new Date('2026-11-01T00:00:00Z');
    const g = () => criarGerenciadorDeFotos({ repo, buscador: nada, ilustrativas, ...base, agora: () => agora, tentarDeNovoAposDias: 30 });
    await g().processarPendentes();
    agora = new Date('2026-12-15T00:00:00Z');
    await g().processarPendentes();
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'ilustrativa', imagem: IMAGEM_ILU, atualizadaEm: agora });
  });

  it('a foto enviada pelo mercado nunca é trocada pela ilustrativa', async () => {
    const repo = await cenario('7890000000001', 'Leite UHT Integral Vale Branco 1L');
    const m = (await repo.listarMercados())[0]!;
    await repo.salvarFoto({ codigoBarras: '7890000000001', origem: 'mercado', url: null, imagem: 'data:image/jpeg;base64,MANUAL', mercadoId: m.id, atualizadaEm: new Date() });
    await criarGerenciadorDeFotos({ repo, buscador: nada, ilustrativas, ...base }).processarPendentes();
    expect((await repo.acharFoto('7890000000001'))?.imagem).toBe('data:image/jpeg;base64,MANUAL');
  });
});

describe('gerenciador: busca por tipo sem procurar cada produto pelo nome', () => {
  it('com procurarProdutoPorNome=false, o buscador por nome só é usado para os TIPOS (uma busca por tipo, não por produto)', async () => {
    const repo = criarRepositorioMemoria();
    const m = await repo.criarMercado({ nome: 'A', endereco: 'Rua 1', nomeNorm: 'a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    for (const [c, n] of [['7890000000001', 'Arroz Branco 5kg'], ['7890000000002', 'Arroz Integral 1kg'], ['7890000000003', 'Arroz Parboilizado 2kg']] as const) {
      await repo.salvarOferta({ mercadoId: m.id, codigoBarras: c, nome: n, nomeNorm: n.toLowerCase(), preco: 1, quantidadeTexto: null, quantidadeValor: null, quantidadeUnidade: null, categoria: null, disponivel: true, precoAtualizadoEm: new Date(), promocaoPreco: null, promocaoInicio: null, promocaoFim: null });
    }
    const chamadas: string[] = [];
    const buscadorPorNome = { buscarPorNome: async (busca: string) => (chamadas.push(busca), { url: IMG }) };
    await criarGerenciadorDeFotos({ repo, buscador: { buscar: async () => null }, categorias: [{ id: 'arroz', palavras: ['arroz'], busca: 'arroz branco tio joao' }], buscadorPorNome, procurarProdutoPorNome: false, baixador: async () => 'data:image/jpeg;base64,X', esperar: async () => undefined, intervaloMs: 0, intervaloPorNomeMs: 0 }).processarPendentes();
    expect(chamadas).toEqual(['arroz branco tio joao']); // uma busca para os 3 produtos
  });
});

describe('gerenciador: completa o banco ilustrativo sozinho', () => {
  const categorias: Categoria[] = [
    { id: 'leite', palavras: ['leite'], busca: 'leite integral parmalat' },
    { id: 'leite-condensado', palavras: ['leite', 'condensado'], busca: 'leite condensado moça' },
    { id: 'arroz', palavras: ['arroz'], busca: 'arroz branco tio joao' },
  ];
  const IMG_TIPO = 'data:image/jpeg;base64,DOTIPO';
  async function cenario(produtos: [string, string][]) {
    const repo = criarRepositorioMemoria();
    const m = await repo.criarMercado({ nome: 'A', endereco: 'Rua 1', nomeNorm: 'a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    for (const [codigo, nome] of produtos) {
      await repo.salvarOferta({ mercadoId: m.id, codigoBarras: codigo, nome, nomeNorm: nome.toLowerCase(), preco: 1, quantidadeTexto: null, quantidadeValor: null, quantidadeUnidade: null, categoria: null, disponivel: true, precoAtualizadoEm: new Date(), promocaoPreco: null, promocaoInicio: null, promocaoFim: null });
    }
    return repo;
  }
  const base = { baixador: async () => IMG_TIPO, esperar: async () => undefined, intervaloMs: 0, intervaloPorNomeMs: 0 };
  const nada: BuscadorDeFotos = { buscar: async () => null };
  // Responde só às buscas de TIPO (as de categorias.json); a busca pelo nome de cada produto (outra etapa) não acha nada.
  const ehTipo = (busca: string) => categorias.some((c) => c.busca === busca);
  const porNome = (f: (busca: string) => { url: string } | null) => ({ buscarPorNome: vi.fn(async (busca: string) => (ehTipo(busca) ? f(busca) : null)) });
  const buscasDeTipo = (b: { buscarPorNome: { mock: { calls: unknown[][] } } }) => b.buscarPorNome.mock.calls.filter(([x]) => ehTipo(String(x))).length;

  it('tipo sem imagem: procura UMA vez pela busca do tipo, guarda no banco de dados e dá a foto aos produtos desse tipo', async () => {
    const repo = await cenario([['7890000000001', 'Arroz Branco Tipo 1 Grão Dourado 5kg'], ['7890000000002', 'Arroz Parboilizado Pomar 1kg']]);
    const buscador = porNome(() => ({ url: IMG }));
    const resumo = await criarGerenciadorDeFotos({ repo, buscador: nada, categorias, buscadorPorNome: buscador, ...base }).processarPendentes();
    expect(resumo.ilustrativas).toBe(2);
    expect(buscasDeTipo(buscador)).toBe(1); // procurou o TIPO uma vez, não uma por produto
    expect(await repo.acharConfiguracao(`${CHAVE_ILUSTRATIVA}arroz`)).toBe(IMG_TIPO);
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'ilustrativa', imagem: IMG_TIPO });
    expect(await repo.acharFoto('7890000000002')).toMatchObject({ origem: 'ilustrativa', imagem: IMG_TIPO });
  });

  it('leite condensado NUNCA recebe a foto de leite comum: usa o tipo certo, mesmo que só o genérico tenha imagem', async () => {
    const repo = await cenario([['7890000000001', 'Leite Condensado Moça 395g']]);
    const entradasFixas: EntradaIlustrativa[] = [{ id: 'leite', palavras: ['leite'], imagem: 'data:image/jpeg;base64,LEITECOMUM' }];
    // O serviço não acha o condensado: o produto fica sem foto, em vez de receber a de leite comum.
    await criarGerenciadorDeFotos({ repo, buscador: nada, categorias, ilustrativas: entradasFixas, buscadorPorNome: porNome(() => null), ...base }).processarPendentes();
    expect(await repo.acharFoto('7890000000001')).toMatchObject({ imagem: null });
    // Achando o condensado, usa a do condensado.
    const repo2 = await cenario([['7890000000001', 'Leite Condensado Moça 395g']]);
    await criarGerenciadorDeFotos({ repo: repo2, buscador: nada, categorias, ilustrativas: entradasFixas, buscadorPorNome: porNome((b) => (b.includes('condensado') ? { url: IMG } : null)), ...base }).processarPendentes();
    expect((await repo2.acharFoto('7890000000001'))?.imagem).toBe(IMG_TIPO);
    expect(await repo2.acharConfiguracao(`${CHAVE_ILUSTRATIVA}leite-condensado`)).toBe(IMG_TIPO);
  });

  it('usa as imagens que vão junto do sistema sem procurar nada', async () => {
    const repo = await cenario([['7890000000001', 'Arroz Branco 5kg']]);
    const buscador = porNome(() => ({ url: IMG }));
    await criarGerenciadorDeFotos({ repo, buscador: nada, categorias, ilustrativas: [{ id: 'arroz', palavras: ['arroz'], imagem: 'data:image/jpeg;base64,FIXA' }], buscadorPorNome: buscador, ...base }).processarPendentes();
    expect(buscasDeTipo(buscador)).toBe(0);
    expect((await repo.acharFoto('7890000000001'))?.imagem).toBe('data:image/jpeg;base64,FIXA');
  });

  it('o que o servidor já guardou no banco de dados vale nas rodadas seguintes, sem procurar de novo', async () => {
    const repo = await cenario([['7890000000001', 'Arroz Branco 5kg']]);
    await repo.salvarConfiguracao(`${CHAVE_ILUSTRATIVA}arroz`, 'data:image/jpeg;base64,GUARDADA');
    const buscador = porNome(() => ({ url: IMG }));
    await criarGerenciadorDeFotos({ repo, buscador: nada, categorias, buscadorPorNome: buscador, ...base }).processarPendentes();
    expect(buscasDeTipo(buscador)).toBe(0);
    expect((await repo.acharFoto('7890000000001'))?.imagem).toBe('data:image/jpeg;base64,GUARDADA');
  });

  it('tipo que não se acha: marca para não procurar de novo por 7 dias e o produto fica sem foto', async () => {
    const repo = await cenario([['7890000000001', 'Arroz Branco 5kg'], ['7890000000002', 'Arroz Integral 1kg']]);
    const buscador = porNome(() => null);
    let agora = new Date('2026-11-01T00:00:00Z');
    const g = () => criarGerenciadorDeFotos({ repo, buscador: nada, categorias, buscadorPorNome: buscador, ...base, agora: () => agora, tentarDeNovoAposDias: 1 });
    await g().processarPendentes();
    expect(buscasDeTipo(buscador)).toBe(1); // dois produtos do mesmo tipo, uma procura só
    expect(await repo.acharConfiguracao(`${CHAVE_ILUSTRATIVA_SEM}arroz`)).not.toBeNull();
    agora = new Date('2026-11-04T00:00:00Z'); // 3 dias depois: ainda dentro dos 7
    await g().processarPendentes();
    expect(buscasDeTipo(buscador)).toBe(1);
    agora = new Date('2026-11-12T00:00:00Z'); // 11 dias depois: tenta de novo
    await g().processarPendentes();
    expect(buscasDeTipo(buscador)).toBe(2);
  });

  it('serviço pediu calma ao procurar o tipo: para, não marca nada e volta mais tarde', async () => {
    const repo = await cenario([['7890000000001', 'Arroz Branco 5kg']]);
    const buscador = { buscarPorNome: async () => { throw new ErroTemporario('503'); } };
    const resumo = await criarGerenciadorDeFotos({ repo, buscador: nada, categorias, buscadorPorNome: buscador, ...base }).processarPendentes();
    expect(resumo.adiadas).toBe(true);
    expect(await repo.listarConfiguracoes('ilustrativa')).toEqual([]);
    expect(await repo.acharFoto('7890000000001')).toBeNull();
  });
});

describe('gerenciador: links de foto PRÓPRIA dos mercados', () => {
  it('baixa e guarda para o mercado, sem mexer na foto compartilhada; link que não serve é descartado', async () => {
    const repo = criarRepositorioMemoria();
    const m = await repo.criarMercado({ nome: 'A', endereco: 'Rua 1', nomeNorm: 'a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const em = new Date('2026-11-05T00:00:00Z');
    for (const c of ['7891000100103', '7891000200200']) {
      await repo.salvarFoto({ codigoBarras: c, origem: 'openfoodfacts', url: null, imagem: 'data:image/jpeg;base64,OFF', mercadoId: null, atualizadaEm: em });
    }
    await repo.salvarFotosDoMercado(m.id, [{ codigoBarras: '7891000100103', url: 'https://l.exemplo.com/ok.jpg' }, { codigoBarras: '7891000200200', url: 'https://l.exemplo.com/quebrado.jpg' }], em);
    const baixador = async (u: string) => {
      if (u.includes('quebrado')) throw new ImagemInvalida('404');
      return 'data:image/jpeg;base64,BAIXADA';
    };
    await criarGerenciadorDeFotos({ repo, buscador: { buscar: async () => null }, baixador, esperar: async () => undefined, intervaloMs: 0 }).processarPendentes();
    expect((await repo.acharFotoDoMercado(m.id, '7891000100103'))?.imagem).toBe('data:image/jpeg;base64,BAIXADA');
    expect(await repo.acharFoto('7891000100103')).toMatchObject({ imagem: 'data:image/jpeg;base64,OFF' }); // a dos outros continua
    expect(await repo.acharFotoDoMercado(m.id, '7891000200200')).toBeNull(); // link ruim descartado
    expect(await repo.listarFotosDoMercadoParaBaixar(10)).toEqual([]);
  });
});
