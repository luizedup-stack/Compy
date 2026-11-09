import { describe, expect, it, vi } from 'vitest';
import { criarAmbiente } from './apoioTeste';

describe('cache curto da lista de produtos (cacheRespostasMs)', () => {
  it('com cache, vários pedidos seguidos montam a lista do banco uma vez só; sem cache, toda vez', async () => {
    const comCache = await criarAmbiente({ cacheRespostasMs: 60_000 });
    const espiaCom = vi.spyOn(comCache.repo, 'listarOfertasParaBusca');
    for (const url of ['/produtos', '/produtos?pagina=2', '/catalogo', '/busca?q=leite']) {
      expect((await comCache.app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    expect(espiaCom).toHaveBeenCalledTimes(1);

    const semCache = await criarAmbiente();
    const espiaSem = vi.spyOn(semCache.repo, 'listarOfertasParaBusca');
    for (const url of ['/produtos', '/catalogo']) await semCache.app.inject({ method: 'GET', url });
    expect(espiaSem).toHaveBeenCalledTimes(2);
  });

  it('falha ao montar não fica guardada: o pedido seguinte tenta de novo', async () => {
    const amb = await criarAmbiente({ cacheRespostasMs: 60_000 });
    const original = amb.repo.listarOfertasParaBusca.bind(amb.repo);
    vi.spyOn(amb.repo, 'listarOfertasParaBusca').mockRejectedValueOnce(new Error('banco caiu')).mockImplementation(original);
    expect((await amb.app.inject({ method: 'GET', url: '/catalogo' })).statusCode).toBe(500);
    expect((await amb.app.inject({ method: 'GET', url: '/catalogo' })).statusCode).toBe(200);
  });
});

describe('cache curto: depois do prazo entrega o antigo na hora e renova por trás', () => {
  it('passado o prazo, a resposta não espera a montagem; o pedido seguinte já vem renovado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const amb = await criarAmbiente({ cacheRespostasMs: 1000 });
      const espia = vi.spyOn(amb.repo, 'listarOfertasParaBusca');
      await amb.app.inject({ method: 'GET', url: '/catalogo' });
      expect(espia).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 5000); // venceu o prazo (1 s), mas não é velho demais
      await amb.app.inject({ method: 'GET', url: '/catalogo' }); // entrega o antigo e dispara a renovação
      expect(espia).toHaveBeenCalledTimes(1); // a renovação sai depois da resposta
      await new Promise((r) => setTimeout(r, 120));
      expect(espia).toHaveBeenCalledTimes(2);
      await amb.app.inject({ method: 'GET', url: '/catalogo' }); // já usa o renovado
      expect(espia).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('lista de mercados com o catálogo reaproveitado', () => {
  it('traz os mesmos mercados e totais que a contagem direta no banco (inclusive mercado sem produtos)', async () => {
    const dados = async (cacheRespostasMs?: number) => {
      const amb = await criarAmbiente(cacheRespostasMs ? { cacheRespostasMs } : {});
      const m = (nome: string, rua: string) =>
        amb.repo.criarMercado({ nome, endereco: rua, nomeNorm: nome.toLowerCase(), enderecoNorm: rua.toLowerCase(), status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
      const b = await m('Beta', 'Rua 2');
      await m('Alfa', 'Rua 1'); // sem produtos
      const oferta = (codigoBarras: string, disponivel: boolean) => ({
        mercadoId: b.id, codigoBarras, nome: 'Leite', nomeNorm: 'leite', preco: 5, quantidadeTexto: null, quantidadeValor: null, quantidadeUnidade: null,
        categoria: null, disponivel, precoAtualizadoEm: new Date(), promocaoPreco: null, promocaoInicio: null, promocaoFim: null,
      });
      await amb.repo.salvarOfertas([oferta('7891000100103', true), oferta('7891000100104', true), oferta('7891000100105', false)]);
      return (await amb.app.inject({ method: 'GET', url: '/mercados' })).json();
    };
    const direto = await dados();
    expect(direto.map((x: { nome: string; totalProdutos: number }) => [x.nome, x.totalProdutos])).toEqual([['Alfa', 0], ['Beta', 2]]);
    expect(await dados(60_000)).toEqual(direto);
  });
});
