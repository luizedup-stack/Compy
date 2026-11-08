import { normalizarTexto, type GrupoProduto } from '@mercado/shared';
import { describe, expect, it } from 'vitest';
import { criarAmbiente } from '../rotas/apoioTeste';
import { criarFotosEmbutidas } from './embutidas';
import { carregarBancoIlustrativo, carregarCategorias } from './ilustrativas';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00]);
const IMAGEM = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
const categorias = [
  { id: 'leite', palavras: ['leite'], busca: 'leite' },
  { id: 'leite-condensado', palavras: ['leite', 'condensado'], busca: 'leite condensado' },
  { id: 'arroz', palavras: ['arroz'], busca: 'arroz' },
];
const ilustrativas = [
  { id: 'leite', palavras: ['leite'], imagem: IMAGEM },
  { id: 'leite-condensado', palavras: ['leite', 'condensado'], imagem: `${IMAGEM}` },
];
const LEITE = '7891000100103';
const ARROZ = '7891000200200';

describe('fotos embutidas (ilustrativas direto do banco do sistema)', () => {
  it('acha o tipo certo pelo nome; tipo sem imagem ou nome desconhecido: null', () => {
    const e = criarFotosEmbutidas(ilustrativas, categorias);
    expect(e.imagemDoNome('Leite UHT Integral Piracanjuba 1L')).toBe(IMAGEM);
    expect(e.imagemDoNome('Leite Condensado Moça 395g')).toBe(IMAGEM);
    expect(e.imagemDoNome('Arroz Branco Tipo 1')).toBeNull(); // o tipo existe mas ainda não tem imagem
    expect(e.imagemDoNome('Parafuso sextavado')).toBeNull();
  });

  it('o banco de fotos que vai no sistema carrega e dá foto a um leite e a um arroz', () => {
    const e = criarFotosEmbutidas(carregarBancoIlustrativo(), carregarCategorias());
    expect(e.imagemDoNome('Leite Integral Parmalat 1L')).toMatch(/^data:image\/jpeg;base64,/);
    expect(e.imagemDoNome('Arroz Branco Tipo 1 Grão Dourado 5kg')).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('o servidor entrega a ilustrativa no catálogo, na busca e em /fotos sem nada guardado no banco; foto guardada vale mais', async () => {
    const amb = await criarAmbiente({ fotosEmbutidas: criarFotosEmbutidas(ilustrativas, categorias) });
    const m = await amb.repo.criarMercado({ nome: 'A', endereco: 'Rua 1', nomeNorm: 'a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const oferta = (codigoBarras: string, nome: string) => ({
      mercadoId: m.id, codigoBarras, nome, nomeNorm: normalizarTexto(nome), preco: 5, quantidadeTexto: null, quantidadeValor: null, quantidadeUnidade: null,
      categoria: null, disponivel: true, precoAtualizadoEm: new Date(), promocaoPreco: null, promocaoInicio: null, promocaoFim: null,
    });
    await amb.repo.salvarOferta(oferta(LEITE, 'Leite Integral Parmalat 1L'));
    await amb.repo.salvarOferta(oferta(ARROZ, 'Arroz Branco Tipo 1'));

    const catalogo = (await amb.app.inject({ method: 'GET', url: '/catalogo' })).json() as { comFoto: string[]; fotosIlustrativas: string[] };
    expect(catalogo.comFoto).toEqual([LEITE]); // arroz: o tipo ainda não tem imagem no sistema
    expect(catalogo.fotosIlustrativas).toEqual([LEITE]);
    const busca = (await amb.app.inject({ method: 'GET', url: '/busca?q=leite' })).json() as GrupoProduto[];
    expect(busca[0]).toMatchObject({ foto: `/fotos/${LEITE}`, fotoIlustrativa: true });
    const foto = await amb.app.inject({ method: 'GET', url: `/fotos/${LEITE}` });
    expect(foto.statusCode).toBe(200);
    expect(foto.headers['content-type']).toContain('image/jpeg');
    expect((await amb.app.inject({ method: 'GET', url: `/fotos/${ARROZ}` })).statusCode).toBe(404);
    const doMercado = (await amb.app.inject({ method: 'GET', url: `/mercados/${m.id}/produtos` })).json() as { itens: { codigoBarras: string; foto: string | null; fotoIlustrativa?: boolean }[] };
    expect(doMercado.itens.find((i) => i.codigoBarras === LEITE)).toMatchObject({ foto: `/fotos/${LEITE}`, fotoIlustrativa: true });

    // Uma foto específica guardada no banco vence a embutida e perde a marca de ilustrativa.
    await amb.repo.salvarFoto({ codigoBarras: LEITE, origem: 'planilha', url: 'https://l.exemplo.com/a.jpg', imagem: IMAGEM, mercadoId: null, atualizadaEm: new Date() });
    const depois = (await amb.app.inject({ method: 'GET', url: '/catalogo' })).json() as { comFoto: string[]; fotosIlustrativas: string[] };
    expect(depois.comFoto).toEqual([LEITE]);
    expect(depois.fotosIlustrativas).toEqual([]);
  });
});
