import { normalizarTexto, type GrupoProduto, type ProdutoPainel } from '@mercado/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FotoProduto, Mercado, OfertaArmazenada } from '../repositorio';
import { type Ambiente, comToken, criarAmbiente, enviarPlanilha, lerPlanilha } from './apoioTeste';

const LEITE = '7891000100103';
const ARROZ = '7891000200200';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const dataUrl = (tipo: string, bytes: Buffer) => `data:${tipo};base64,${bytes.toString('base64')}`;
const FOTO_JPEG = dataUrl('image/jpeg', JPEG);
const IMG_OFF = 'https://images.openfoodfacts.org/images/products/789/100/010/0103/front_pt.200.jpg';

let amb: Ambiente;
let agendar: ReturnType<typeof vi.fn>;
let mercadoA: Mercado;
let mercadoB: Mercado;
let tokenA: string;
let tokenB: string;

const oferta = (mercadoId: number, codigoBarras: string, nome: string): OfertaArmazenada => ({
  mercadoId, codigoBarras, nome, nomeNorm: normalizarTexto(nome), preco: 5.99, quantidadeTexto: '1 L', quantidadeValor: 1, quantidadeUnidade: 'L',
  categoria: null, disponivel: true, precoAtualizadoEm: new Date(), promocaoPreco: null, promocaoInicio: null, promocaoFim: null,
});

async function mercadoComLogin(nome: string, endereco: string, email: string) {
  const { id, token } = await amb.criarComPapel('mercado', email);
  const mercado = await amb.repo.criarMercado({
    nome, endereco, nomeNorm: normalizarTexto(nome), enderecoNorm: normalizarTexto(endereco), status: 'ativo', contaSituacao: 'gratuita', usuarioId: id,
  });
  return { mercado, token };
}

const foto = (parcial: Partial<FotoProduto> = {}): FotoProduto => ({
  codigoBarras: LEITE, origem: 'openfoodfacts', url: IMG_OFF, imagem: null, mercadoId: null, atualizadaEm: new Date(), ...parcial,
});

beforeEach(async () => {
  agendar = vi.fn();
  amb = await criarAmbiente({ fotos: { agendarPendentes: agendar } });
  ({ mercado: mercadoA, token: tokenA } = await mercadoComLogin('Mercado A', 'Rua A, 1', 'a@exemplo.com'));
  ({ mercado: mercadoB, token: tokenB } = await mercadoComLogin('Mercado B', 'Rua B, 2', 'b@exemplo.com'));
  await amb.repo.salvarOferta(oferta(mercadoA.id, LEITE, 'Leite Integral Piracanjuba 1L'));
  await amb.repo.salvarOferta(oferta(mercadoA.id, ARROZ, 'Arroz Tipo 1 5kg'));
  await amb.repo.salvarOferta(oferta(mercadoB.id, LEITE, 'Leite Piracanjuba 1 L'));
});

const colocarFoto = (token: string, codigo: string, imagem: unknown) =>
  amb.app.inject({ method: 'PUT', url: `/painel/produtos/${codigo}/foto`, headers: comToken(token), payload: { imagem } as object });
const removerFotoDoPainel = (token: string, codigo: string, extra = '') =>
  amb.app.inject({ method: 'DELETE', url: `/painel/produtos/${codigo}/foto${extra}`, headers: comToken(token) });

describe('GET /fotos/:codigo (pública)', () => {
  it('sem foto: 404; código que não é código de barras: 404', async () => {
    expect((await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` })).statusCode).toBe(404);
    expect((await amb.app.inject({ method: 'GET', url: '/fotos/abc' })).statusCode).toBe(404);
    expect((await amb.app.inject({ method: 'GET', url: '/fotos/123' })).statusCode).toBe(404);
  });

  it('foto enviada por um mercado: entrega a imagem, sem login, com cache e sem deixar o navegador adivinhar o tipo', async () => {
    await amb.repo.salvarFoto(foto({ origem: 'mercado', url: null, imagem: FOTO_JPEG, mercadoId: mercadoA.id }));
    const res = await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(String(res.headers['cache-control'])).toContain('max-age=');
    expect(res.rawPayload.equals(JPEG)).toBe(true);
  });

  it('foto achada no banco aberto: leva (302) para a imagem de lá', async () => {
    await amb.repo.salvarFoto(foto());
    const res = await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(IMG_OFF);
  });

  it('link vindo de uma planilha NUNCA vira redirecionamento (o servidor não redireciona para qualquer endereço); sem imagem baixada, 404', async () => {
    await amb.repo.salvarFoto(foto({ origem: 'planilha', url: 'https://site-qualquer.exemplo.com/x.jpg' }));
    const res = await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` });
    expect(res.statusCode).toBe(404);
    expect(res.headers.location).toBeUndefined();
  });

  it('foto de planilha já baixada é entregue do banco, sem redirecionar', async () => {
    await amb.repo.salvarFoto(foto({ origem: 'planilha', url: 'https://site-qualquer.exemplo.com/x.jpg', imagem: FOTO_JPEG }));
    const res = await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(JPEG)).toBe(true);
  });

  it('"procurou e não achou": 404', async () => {
    await amb.repo.salvarFoto(foto({ url: null }));
    expect((await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` })).statusCode).toBe(404);
  });

  it('imagem guardada que não é válida não é entregue', async () => {
    await amb.repo.salvarFoto(foto({ origem: 'mercado', url: null, imagem: 'data:text/html;base64,PHNjcmlwdD4=', mercadoId: mercadoA.id }));
    expect((await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` })).statusCode).toBe(404);
  });
});

describe('PUT /painel/produtos/:codigo/foto', () => {
  it('o mercado envia a foto do produto que vende: fica guardada, é servida e aparece na lista do painel', async () => {
    const res = await colocarFoto(tokenA, LEITE, FOTO_JPEG);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ foto: `/fotos/${LEITE}`, fotoOrigem: 'mercado' });
    expect(await amb.repo.acharFoto(LEITE)).toMatchObject({ origem: 'mercado', imagem: FOTO_JPEG, url: null, mercadoId: mercadoA.id });
    expect((await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` })).statusCode).toBe(200);

    const lista = (await amb.app.inject({ method: 'GET', url: '/painel/produtos', headers: comToken(tokenA) })).json() as { itens: ProdutoPainel[] };
    expect(lista.itens.find((i) => i.codigoBarras === LEITE)).toMatchObject({ foto: `/fotos/${LEITE}`, fotoOrigem: 'mercado' });
    expect(lista.itens.find((i) => i.codigoBarras === ARROZ)).toMatchObject({ foto: null, fotoOrigem: null });
  });

  it('a foto é do código de barras: o outro mercado que vende o mesmo produto também a vê', async () => {
    await colocarFoto(tokenA, LEITE, FOTO_JPEG);
    const lista = (await amb.app.inject({ method: 'GET', url: '/painel/produtos', headers: comToken(tokenB) })).json() as { itens: ProdutoPainel[] };
    expect(lista.itens.find((i) => i.codigoBarras === LEITE)).toMatchObject({ foto: `/fotos/${LEITE}`, fotoOrigem: 'mercado' });
  });

  it('foto enviada onde o produto NÃO tem foto de verdade (nenhuma ou ilustrativa) vira a foto de todos', async () => {
    const semFoto = await colocarFoto(tokenA, LEITE, FOTO_JPEG);
    expect(semFoto.statusCode).toBe(200);
    expect(semFoto.json()).toEqual({ foto: `/fotos/${LEITE}`, fotoOrigem: 'mercado' });
    expect(await amb.repo.acharFoto(LEITE)).toMatchObject({ origem: 'mercado', mercadoId: mercadoA.id });
    await amb.repo.salvarFoto(foto({ codigoBarras: ARROZ, origem: 'ilustrativa', url: null, imagem: FOTO_JPEG }));
    expect((await colocarFoto(tokenA, ARROZ, FOTO_JPEG)).statusCode).toBe(200);
    expect(await amb.repo.acharFoto(ARROZ)).toMatchObject({ origem: 'mercado' });
  });

  it('foto enviada onde o produto JÁ tem foto de verdade fica só para quem enviou; a que existia continua para os outros', async () => {
    await amb.repo.salvarFoto(foto({ origem: 'openfoodfacts', url: null, imagem: FOTO_JPEG }));
    const outra = dataUrl('image/png', PNG);
    const res = await colocarFoto(tokenA, LEITE, outra);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ foto: `/fotos/${LEITE}?mercadoId=${mercadoA.id}`, fotoOrigem: 'mercado' }); // a foto própria de A
    expect(await amb.repo.acharFoto(LEITE)).toMatchObject({ origem: 'openfoodfacts', imagem: FOTO_JPEG }); // a dos outros não mudou
    const daA = await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}?mercadoId=${mercadoA.id}` });
    expect(daA.headers['content-type']).toContain('image/png');
    const dosOutros = await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` });
    expect(dosOutros.headers['content-type']).toContain('image/jpeg');
    const doB = await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}?mercadoId=${mercadoB.id}` });
    expect(doB.headers['content-type']).toContain('image/jpeg'); // B não tem própria: vê a compartilhada
    // no painel de A e na lista dele no aplicativo aparece a foto própria; no do B, a compartilhada
    const lista = (await amb.app.inject({ method: 'GET', url: '/painel/produtos', headers: comToken(tokenA) })).json() as { itens: ProdutoPainel[] };
    expect(lista.itens.find((i) => i.codigoBarras === LEITE)).toMatchObject({ foto: `/fotos/${LEITE}?mercadoId=${mercadoA.id}`, fotoOrigem: 'mercado' });
    const doMercado = (await amb.app.inject({ method: 'GET', url: `/mercados/${mercadoA.id}/produtos` })).json() as { itens: { codigoBarras: string; foto: string | null }[] };
    expect(doMercado.itens.find((i) => i.codigoBarras === LEITE)?.foto).toBe(`/fotos/${LEITE}?mercadoId=${mercadoA.id}`);
    // apagar a própria devolve a compartilhada (e não mexe nela)
    expect((await amb.app.inject({ method: 'DELETE', url: `/painel/produtos/${LEITE}/foto`, headers: comToken(tokenA) })).statusCode).toBe(204);
    expect(await amb.repo.acharFotoDoMercado(mercadoA.id, LEITE)).toBeNull();
    expect(await amb.repo.acharFoto(LEITE)).toMatchObject({ origem: 'openfoodfacts' });
  });

  it('aceita PNG e WebP, e rejeita o que não é imagem permitida (SVG, texto, base64 solto)', async () => {
    expect((await colocarFoto(tokenA, LEITE, dataUrl('image/png', PNG))).statusCode).toBe(200);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
    expect((await colocarFoto(tokenA, LEITE, dataUrl('image/webp', webp))).statusCode).toBe(200);
    for (const ruim of [
      dataUrl('image/svg+xml', Buffer.from('<svg onload="alert(1)"/>')),
      dataUrl('text/html', Buffer.from('<script>alert(1)</script>')),
      JPEG.toString('base64'),
      'data:image/jpeg;base64,@@@@',
      '',
      null,
      42,
    ]) {
      const res = await colocarFoto(tokenA, ARROZ, ruim);
      expect(res.statusCode, String(ruim).slice(0, 30)).toBe(400);
      expect(res.json()).toEqual({ erro: 'Envie uma foto em JPEG, PNG ou WebP.' });
    }
  });

  it('o cabeçalho do arquivo precisa combinar com o tipo dito (um PNG que é na verdade um texto é recusado)', async () => {
    const res = await colocarFoto(tokenA, LEITE, dataUrl('image/png', Buffer.from('isto não é um png de verdade')));
    expect(res.statusCode).toBe(400);
  });

  it('foto grande demais (mais de 300 KB): 400 com a explicação', async () => {
    const grande = Buffer.concat([JPEG, Buffer.alloc(310 * 1024, 1)]);
    const res = await colocarFoto(tokenA, LEITE, dataUrl('image/jpeg', grande));
    expect(res.statusCode).toBe(400);
    expect((res.json() as { erro: string }).erro).toContain('300 KB');
    expect(await amb.repo.acharFoto(LEITE)).toBeNull();
  });

  it('corpo sem imagem: 400', async () => {
    const res = await amb.app.inject({ method: 'PUT', url: `/painel/produtos/${LEITE}/foto`, headers: comToken(tokenA), payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('só quem vende o produto envia a foto dele: 404 para um produto que o mercado não tem', async () => {
    expect((await colocarFoto(tokenB, ARROZ, FOTO_JPEG)).statusCode).toBe(404); // o arroz é só do mercado A
    expect(await amb.repo.acharFoto(ARROZ)).toBeNull();
  });

  it('exige login de mercado: sem token 401, cliente 403', async () => {
    expect((await amb.app.inject({ method: 'PUT', url: `/painel/produtos/${LEITE}/foto`, payload: { imagem: FOTO_JPEG } })).statusCode).toBe(401);
    const cliente = await amb.criarComPapel('cliente', 'c@exemplo.com');
    expect((await colocarFoto(cliente.token, LEITE, FOTO_JPEG)).statusCode).toBe(403);
  });
});

describe('DELETE /painel/produtos/:codigo/foto', () => {
  it('o mercado remove a foto que ele mesmo enviou; a busca automática é chamada de novo', async () => {
    await colocarFoto(tokenA, LEITE, FOTO_JPEG);
    agendar.mockClear();
    expect((await removerFotoDoPainel(tokenA, LEITE)).statusCode).toBe(204);
    expect(await amb.repo.acharFoto(LEITE)).toBeNull();
    expect((await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` })).statusCode).toBe(404);
    expect(agendar).toHaveBeenCalledTimes(1);
  });

  it('a foto achada sozinha não se remove (409): para trocar, é só enviar outra', async () => {
    await amb.repo.salvarFoto(foto());
    const res = await removerFotoDoPainel(tokenA, LEITE);
    expect(res.statusCode).toBe(409);
    expect(await amb.repo.acharFoto(LEITE)).not.toBeNull();
  });

  it('um mercado não remove a foto enviada por outro (403); o administrador remove qualquer uma', async () => {
    await colocarFoto(tokenA, LEITE, FOTO_JPEG);
    expect((await removerFotoDoPainel(tokenB, LEITE)).statusCode).toBe(403);
    expect(await amb.repo.acharFoto(LEITE)).not.toBeNull();

    const admin = await amb.criarComPapel('admin', 'admin@exemplo.com');
    expect((await removerFotoDoPainel(admin.token, LEITE, `?mercadoId=${mercadoB.id}`)).statusCode).toBe(204);
    expect(await amb.repo.acharFoto(LEITE)).toBeNull();
  });

  it('sem foto: 404; produto que o mercado não vende: 404', async () => {
    expect((await removerFotoDoPainel(tokenA, LEITE)).statusCode).toBe(404);
    expect((await removerFotoDoPainel(tokenB, ARROZ)).statusCode).toBe(404);
  });
});

describe('a foto aparece onde o app olha', () => {
  it('busca, lista inicial, catálogo e produtos do mercado trazem o caminho da foto (e null para quem não tem)', async () => {
    await amb.repo.salvarFoto(foto());

    const busca = (await amb.app.inject({ method: 'GET', url: '/busca?q=leite' })).json() as GrupoProduto[];
    expect(busca.find((g) => g.codigoBarras === LEITE)?.foto).toBe(`/fotos/${LEITE}`);

    const inicial = (await amb.app.inject({ method: 'GET', url: '/produtos' })).json() as { grupos: GrupoProduto[] };
    expect(inicial.grupos.find((g) => g.codigoBarras === LEITE)?.foto).toBe(`/fotos/${LEITE}`);
    expect(inicial.grupos.find((g) => g.codigoBarras === ARROZ)?.foto).toBeNull();

    const catalogo = (await amb.app.inject({ method: 'GET', url: '/catalogo' })).json() as { comFoto: string[] };
    expect(catalogo.comFoto).toEqual([LEITE]);

    const doMercado = (await amb.app.inject({ method: 'GET', url: `/mercados/${mercadoA.id}/produtos` })).json() as { itens: { codigoBarras: string; foto: string | null }[] };
    expect(doMercado.itens.find((i) => i.codigoBarras === LEITE)?.foto).toBe(`/fotos/${LEITE}`);
    expect(doMercado.itens.find((i) => i.codigoBarras === ARROZ)?.foto).toBeNull();
  });

  it('a foto ilustrativa (do tipo de produto) é marcada como tal na busca e no catálogo; a específica não', async () => {
    await amb.repo.salvarFoto(foto({ origem: 'ilustrativa', url: null, imagem: FOTO_JPEG }));
    await amb.repo.salvarFoto(foto({ codigoBarras: ARROZ, origem: 'planilha', url: 'https://l.exemplo.com/a.jpg', imagem: FOTO_JPEG }));
    const busca = (await amb.app.inject({ method: 'GET', url: '/busca?q=leite' })).json() as GrupoProduto[];
    const leite = busca.find((g) => g.codigoBarras === LEITE)!;
    expect(leite).toMatchObject({ foto: `/fotos/${LEITE}`, fotoIlustrativa: true });
    const inicial = (await amb.app.inject({ method: 'GET', url: '/produtos' })).json() as { grupos: GrupoProduto[] };
    expect(inicial.grupos.find((g) => g.codigoBarras === ARROZ)?.fotoIlustrativa).toBeUndefined(); // específica: sem a marca
    const catalogo = (await amb.app.inject({ method: 'GET', url: '/catalogo' })).json() as { fotosIlustrativas: string[] };
    expect(catalogo.fotosIlustrativas).toEqual([LEITE]);
  });

  it('confirmar o preço (ou editar) devolve o produto COM a foto: ela não some da tela', async () => {
    await amb.repo.salvarFoto(foto({ origem: 'mercado', url: null, imagem: FOTO_JPEG, mercadoId: mercadoA.id }));
    const confirmar = await amb.app.inject({ method: 'PATCH', url: `/painel/produtos/${LEITE}`, headers: comToken(tokenA), payload: { preco: 5.99 } });
    expect(confirmar.statusCode).toBe(200);
    expect(confirmar.json()).toMatchObject({ codigoBarras: LEITE, foto: `/fotos/${LEITE}`, fotoOrigem: 'mercado' });
    const editar = await amb.app.inject({ method: 'PATCH', url: `/painel/produtos/${LEITE}`, headers: comToken(tokenA), payload: { nome: 'Leite Integral 1L' } });
    expect(editar.json()).toMatchObject({ foto: `/fotos/${LEITE}`, fotoOrigem: 'mercado' });
    const semFoto = await amb.app.inject({ method: 'PATCH', url: `/painel/produtos/${ARROZ}`, headers: comToken(tokenA), payload: { preco: 7 } });
    expect(semFoto.json()).toMatchObject({ foto: null, fotoOrigem: null }); // sem foto continua sem foto
  });

  it('produto novo cadastrado à mão com um código que já tem foto (de outro mercado) já vem com a foto', async () => {
    await amb.repo.salvarFoto(foto({ codigoBarras: '7891000300305', origem: 'mercado', url: null, imagem: FOTO_JPEG, mercadoId: mercadoB.id }));
    const res = await amb.app.inject({ method: 'POST', url: '/painel/produtos', headers: comToken(tokenA), payload: { codigoBarras: '7891000300305', nome: 'Feijão 1kg', preco: 8.5 } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ foto: '/fotos/7891000300305', fotoOrigem: 'mercado' });
  });

  it('o painel mostra a origem "ilustrativa" para o dono do mercado trocar pela foto certa', async () => {
    await amb.repo.salvarFoto(foto({ origem: 'ilustrativa', url: null, imagem: FOTO_JPEG }));
    const lista = (await amb.app.inject({ method: 'GET', url: '/painel/produtos', headers: comToken(tokenA) })).json() as { itens: ProdutoPainel[] };
    expect(lista.itens.find((i) => i.codigoBarras === LEITE)).toMatchObject({ foto: `/fotos/${LEITE}`, fotoOrigem: 'ilustrativa' });
  });

  it('foto "não achada" não conta como foto', async () => {
    await amb.repo.salvarFoto(foto({ url: null }));
    const busca = (await amb.app.inject({ method: 'GET', url: '/busca?q=leite' })).json() as GrupoProduto[];
    expect(busca.find((g) => g.codigoBarras === LEITE)?.foto).toBeNull();
  });
});

describe('a procura automática é acionada quando entram produtos', () => {
  it('ao enviar uma planilha', async () => {
    const admin = await amb.criarComPapel('admin', 'admin@exemplo.com');
    const res = await enviarPlanilha(amb.app, admin.token, lerPlanilha('mercado-1-bom-preco.xlsx'));
    expect(res.statusCode).toBe(200);
    expect(agendar).toHaveBeenCalledTimes(1);
  });

  it('ao cadastrar um produto novo à mão', async () => {
    const res = await amb.app.inject({
      method: 'POST', url: '/painel/produtos', headers: comToken(tokenA),
      payload: { codigoBarras: '7890070035629', nome: 'Feijão Carioca 1kg', preco: '8,90', quantidade: '1 kg' } as object,
    });
    expect(res.statusCode).toBe(201);
    expect(agendar).toHaveBeenCalledTimes(1);
  });

  it('uma planilha com erro (rejeitada) não aciona', async () => {
    const admin = await amb.criarComPapel('admin', 'admin2@exemplo.com');
    const res = await enviarPlanilha(amb.app, admin.token, Buffer.from('não é uma planilha'));
    expect(res.statusCode).toBe(422);
    expect(agendar).not.toHaveBeenCalled();
  });
});

