import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ErroApi,
  MSG_SEM_SERVIDOR,
  buscar,
  definirAoExpirar,
  definirPrazoResposta,
  definirRenovacaoAutomatica,
  definirToken,
  listarMercados,
  listarProdutos,
  produtosDoMercado,
  renovarCopiaDosProdutos,
} from './api';
import { apagarCatalogoLocal, esquecerCatalogoEmMemoria, guardarCatalogoLocal, lerCatalogoLocal } from './catalogo';
import { estaSemConexao } from './conexao';
import { simularApi } from './teste/ajudas';
import { catalogoDeTeste, ofertaCatalogo } from './teste/catalogo';

beforeEach(() => {
  definirToken('tok');
});

afterEach(() => {
  definirToken(null);
  definirAoExpirar(null);
  definirRenovacaoAutomatica(false);
});

describe('cópia dos produtos guardada no celular', () => {
  it('guarda e lê de volta (mesmo depois de esquecer a memória), em várias partes', async () => {
    const catalogo = catalogoDeTeste();
    catalogo.ofertas = Array.from({ length: 700 }, (_, i) =>
      ofertaCatalogo({ mercadoId: 4, codigoBarras: String(7890000000000 + i), nome: `Produto ${i}` }),
    );
    await guardarCatalogoLocal(catalogo, 1234);

    esquecerCatalogoEmMemoria();
    const lido = await lerCatalogoLocal();
    expect(lido?.baixadoEm).toBe(1234);
    expect(lido?.catalogo.ofertas).toHaveLength(700);
    expect(lido?.catalogo.mercados).toEqual(catalogo.mercados);
    expect(await AsyncStorage.getItem('bolso-certo.catalogo.parte.2')).not.toBeNull(); // 700 ofertas = 3 partes
  });

  it('uma cópia nova menor apaga as partes que sobraram', async () => {
    const grande = catalogoDeTeste();
    grande.ofertas = Array.from({ length: 700 }, (_, i) => ofertaCatalogo({ mercadoId: 4, codigoBarras: String(i), nome: `P ${i}` }));
    await guardarCatalogoLocal(grande);
    await guardarCatalogoLocal(catalogoDeTeste());
    expect(await AsyncStorage.getItem('bolso-certo.catalogo.parte.1')).toBeNull();
    esquecerCatalogoEmMemoria();
    expect((await lerCatalogoLocal())?.catalogo.ofertas).toHaveLength(3);
  });

  it('cópia incompleta (falta uma parte) vale como se não existisse', async () => {
    const catalogo = catalogoDeTeste();
    catalogo.ofertas = Array.from({ length: 400 }, (_, i) => ofertaCatalogo({ mercadoId: 4, codigoBarras: String(i), nome: `P ${i}` }));
    await guardarCatalogoLocal(catalogo);
    await AsyncStorage.removeItem('bolso-certo.catalogo.parte.1');
    esquecerCatalogoEmMemoria();
    expect(await lerCatalogoLocal()).toBeNull();
  });

  it('apagar remove tudo', async () => {
    await guardarCatalogoLocal(catalogoDeTeste());
    await apagarCatalogoLocal();
    expect(await lerCatalogoLocal()).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});

describe('consultas sem o servidor', () => {
  it('com o servidor respondendo, usa as respostas dele e não mexe na cópia', async () => {
    await guardarCatalogoLocal(catalogoDeTeste());
    simularApi({ 'GET /mercados': { status: 200, corpo: [{ id: 9, nome: 'Do servidor', endereco: 'x', totalProdutos: 1 }] } });
    expect(await listarMercados()).toEqual([{ id: 9, nome: 'Do servidor', endereco: 'x', totalProdutos: 1 }]);
    expect(estaSemConexao()).toBe(false);
  });

  it('sem o servidor, busca na cópia (mesma ordem de preço) e avisa que está sem conexão', async () => {
    const baixadoEm = Date.now() - 3600_000;
    await guardarCatalogoLocal(catalogoDeTeste(), baixadoEm);
    simularApi({}); // qualquer rota falha como se não houvesse rede
    const grupos = await buscar('papel higienico', 'unidade');
    expect(grupos).toHaveLength(1);
    expect(grupos[0].ofertas.map((o) => [o.mercadoNome, o.preco, o.precoPorUnidade])).toEqual([
      ['Atacarejo Econômico', 14.7, 1.23],
      ['Supermercado Estrela da Vila', 18.5, 1.54],
    ]);
    expect(estaSemConexao()).toBe(true);
  });

  it('sem o servidor, a lista da tela inicial vem da cópia, com os produtos de mais de um mercado primeiro', async () => {
    await guardarCatalogoLocal(catalogoDeTeste());
    simularApi({}, { semPadroes: true });
    const { grupos, total } = await listarProdutos('unidade', 1);
    expect(total).toBe(2);
    expect(grupos.map((g) => [g.nome, g.ofertas.length])).toEqual([
      ['Papel Higiênico Fox Folha Dupla', 2], // vendido nos 2 mercados: primeiro
      ['Leite Integral 1 L', 1],
    ]);
  });

  it('sem o servidor, lista os mercados e os produtos de cada um', async () => {
    await guardarCatalogoLocal(catalogoDeTeste());
    simularApi({});
    expect((await listarMercados()).map((m) => [m.nome, m.totalProdutos])).toEqual([
      ['Atacarejo Econômico', 2],
      ['Supermercado Estrela da Vila', 1],
    ]);
    const pagina = await produtosDoMercado(4, 1);
    expect(pagina.total).toBe(2);
    expect(pagina.itens.map((i) => i.nome)).toEqual(['Leite Integral 1 L', 'Papel Higiênico Fox Folha Dupla']);
  });

  it('sem o servidor, um mercado que não está na cópia dá 404', async () => {
    await guardarCatalogoLocal(catalogoDeTeste());
    simularApi({});
    await expect(produtosDoMercado(99, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('sem o servidor e sem cópia guardada, o erro é o de sempre', async () => {
    simularApi({});
    await expect(buscar('papel', 'unidade')).rejects.toMatchObject({ message: MSG_SEM_SERVIDOR, status: 0 });
    expect(estaSemConexao()).toBe(false);
  });

  it('erro que não é falta de conexão (ex.: 401) não usa a cópia', async () => {
    await guardarCatalogoLocal(catalogoDeTeste());
    simularApi({ 'GET /mercados': { status: 500, corpo: { erro: 'Falha interna' } } });
    await expect(listarMercados()).rejects.toBeInstanceOf(ErroApi);
    expect(estaSemConexao()).toBe(false);
  });

  it('voltando a ter conexão, o aviso some', async () => {
    await guardarCatalogoLocal(catalogoDeTeste());
    const rotas: Parameters<typeof simularApi>[0] = {};
    simularApi(rotas);
    await listarMercados();
    expect(estaSemConexao()).toBe(true);
    rotas['GET /mercados'] = { status: 200, corpo: [] };
    await listarMercados();
    expect(estaSemConexao()).toBe(false);
  });
});

describe('renovar a cópia', () => {
  it('baixa GET /catalogo e guarda no celular', async () => {
    definirRenovacaoAutomatica(true);
    const api = simularApi({ 'GET /catalogo': { status: 200, corpo: catalogoDeTeste() } });
    await renovarCopiaDosProdutos(true);
    expect(api.chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['GET /catalogo']);
    expect(api.chamadas[0].autorizacao).toBe('Bearer tok');
    esquecerCatalogoEmMemoria();
    expect((await lerCatalogoLocal())?.catalogo.ofertas).toHaveLength(3);
  });

  it('não repete a tentativa dentro de 10 minutos, a não ser que seja forçada', async () => {
    definirRenovacaoAutomatica(true);
    const api = simularApi({ 'GET /catalogo': { status: 200, corpo: catalogoDeTeste() } });
    await renovarCopiaDosProdutos();
    await renovarCopiaDosProdutos();
    expect(api.chamadas).toHaveLength(1);
    await renovarCopiaDosProdutos(true);
    expect(api.chamadas).toHaveLength(2);
  });

  it('falha ao baixar não lança erro, mantém a cópia antiga e deixa tentar de novo', async () => {
    definirRenovacaoAutomatica(true);
    await guardarCatalogoLocal(catalogoDeTeste(), 777);
    const rotas: Parameters<typeof simularApi>[0] = {};
    simularApi(rotas);
    await expect(renovarCopiaDosProdutos()).resolves.toBeUndefined();
    expect((await lerCatalogoLocal())?.baixadoEm).toBe(777);
    rotas['GET /catalogo'] = { status: 200, corpo: catalogoDeTeste() };
    await renovarCopiaDosProdutos(); // a falha não "gastou" os 10 minutos
    expect((await lerCatalogoLocal())?.baixadoEm).not.toBe(777);
  });

  it('com a renovação desligada não faz nenhuma chamada', async () => {
    const api = simularApi({ 'GET /catalogo': { status: 200, corpo: catalogoDeTeste() } });
    await renovarCopiaDosProdutos(true);
    expect(api.fetch).not.toHaveBeenCalled();
  });
});

describe('servidor lento (acordando): com cópia no celular, a lista aparece sem esperar', () => {
  afterEach(() => {
    definirPrazoResposta(4000);
  });

  it('passado o prazo, responde da cópia (marcando que são dados salvos) e o servidor continua sendo esperado', async () => {
    await guardarCatalogoLocal(catalogoDeTeste(), 1234);
    definirPrazoResposta(30);
    let soltar: (() => void) | undefined;
    const demorada = new Promise<Response>((resolve) => {
      soltar = () => resolve({ ok: true, status: 200, json: async () => ({ grupos: [], total: 0 }) } as unknown as Response);
    });
    const fetchFalso = jest.fn().mockReturnValue(demorada);
    const original = globalThis.fetch;
    globalThis.fetch = fetchFalso as unknown as typeof fetch;
    try {
      const { grupos, total } = await listarProdutos('unidade', 1);
      expect(total).toBeGreaterThan(0); // veio da cópia
      expect(grupos.length).toBeGreaterThan(0);
      expect(estaSemConexao()).toBe(true);
      soltar?.();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('servidor que responde dentro do prazo continua valendo (sem aviso de dados salvos)', async () => {
    await guardarCatalogoLocal(catalogoDeTeste(), 1234);
    definirPrazoResposta(5000);
    simularApi({ 'GET /produtos': { status: 200, corpo: { grupos: [], total: 0 } } });
    const r = await listarProdutos('unidade', 1);
    expect(r.total).toBe(0);
    expect(estaSemConexao()).toBe(false);
  });
});
