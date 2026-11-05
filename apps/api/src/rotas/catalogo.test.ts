import {
  buscarNoCatalogo,
  mercadosDoCatalogo,
  produtosDoMercadoNoCatalogo,
  type Catalogo,
} from '@mercado/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { importarPlanilha } from '../planilha/importar';
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

const get = (url: string) => amb.app.inject({ method: 'GET', url, headers: comToken(token) });

describe('GET /catalogo (a cópia que o app guarda para buscar sem internet)', () => {
  it('buscar, listar mercados e listar produtos no catálogo dão o mesmo que as rotas do servidor', async () => {
    const res = await get('/catalogo');
    expect(res.statusCode).toBe(200);
    const catalogo = res.json() as Catalogo;
    expect(catalogo.mercados).toHaveLength(4);
    expect(catalogo.ofertas.length).toBeGreaterThan(100);

    for (const ordem of ['unidade', 'embalagem'] as const) {
      for (const q of ['papel higienico', 'papl higiênico', 'arroz', 'x']) {
        const doServidor = (await get(`/busca?q=${encodeURIComponent(q)}&ordem=${ordem}`)).json();
        expect(buscarNoCatalogo(catalogo, { q, ordem })).toEqual(doServidor);
      }
    }
    expect(mercadosDoCatalogo(catalogo)).toEqual((await get('/mercados')).json());
    for (const m of catalogo.mercados) {
      for (const pagina of [1, 2, 3]) {
        const doServidor = (await get(`/mercados/${m.id}/produtos?pagina=${pagina}`)).json();
        expect(produtosDoMercadoNoCatalogo(catalogo, m.id, pagina)).toEqual(doServidor);
      }
    }
  });

  it('não leva ofertas indisponíveis nem mercados removidos', async () => {
    const [oferta] = await amb.repo.listarOfertasDoMercado(1);
    await amb.repo.salvarOferta({ ...oferta, disponivel: false });
    await amb.repo.atualizarMercado(2, { status: 'removido' });
    const catalogo = (await get('/catalogo')).json() as Catalogo;
    expect(catalogo.mercados.map((m) => m.id)).not.toContain(2);
    expect(catalogo.ofertas.some((o) => o.mercadoId === 2)).toBe(false);
    expect(catalogo.ofertas.some((o) => o.mercadoId === 1 && o.codigoBarras === oferta.codigoBarras)).toBe(false);
  });

  it('produtosDoMercadoNoCatalogo devolve null para um mercado que não está no catálogo', async () => {
    const catalogo = (await get('/catalogo')).json() as Catalogo;
    expect(produtosDoMercadoNoCatalogo(catalogo, 999, 1)).toBeNull();
  });
});
