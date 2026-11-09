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
