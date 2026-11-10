import { fireEvent, screen, userEvent } from '@testing-library/react-native';

import { urlApi } from '../api';
import { aba, abrirApp, simularApi } from '../teste/ajudas';
import { CREDITO_FOTOS } from './Conta';

const oferta = {
  mercadoId: 1, mercadoNome: 'Mercado Bom Preço', endereco: 'Rua A, 10', nomeNoMercado: 'Leite', preco: 5.99, quantidadeTexto: '1 L',
  precoPorUnidade: 5.99, unidade: 'L', atualizadoEm: '2026-11-06T10:00:00.000Z', diasDesdeAtualizacao: 1, desatualizado: false,
};
const COM_FOTO = { codigoBarras: '7891000100103', nome: 'Leite Integral Piracanjuba 1L', ofertas: [oferta], foto: '/fotos/7891000100103' };
const SEM_FOTO = { codigoBarras: '7891000200200', nome: 'Leite Outra Marca 1L', ofertas: [oferta], foto: null };

async function buscarLeite(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Buscar produto'), 'leite');
  await screen.findByText(COM_FOTO.nome, {}, { timeout: 4000 });
}

describe('fotos dos produtos no app', () => {
  it('na busca, o produto com foto mostra a imagem do servidor e o sem foto mostra "Sem foto"', async () => {
    simularApi({ 'GET /busca': { status: 200, corpo: [COM_FOTO, SEM_FOTO] } });
    const user = userEvent.setup();
    await abrirApp();
    await buscarLeite(user);

    const imagem = screen.getByLabelText('Foto de Leite Integral Piracanjuba 1L');
    expect(imagem.props.source).toEqual({ uri: `${urlApi()}/fotos/7891000100103` });
    expect(screen.getAllByTestId('foto-produto')).toHaveLength(1);
    // O quadrado "Sem foto" é decorativo e escondido de leitores de tela, por isso a consulta inclui elementos escondidos.
    expect(screen.getAllByTestId('sem-foto', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('foto ilustrativa mostra a etiqueta "ilustrativa" e avisa também para leitores de tela; a específica não tem etiqueta', async () => {
    simularApi({ 'GET /busca': { status: 200, corpo: [{ ...COM_FOTO, fotoIlustrativa: true }, { ...SEM_FOTO, foto: '/fotos/7891000200200' }] } });
    const user = userEvent.setup();
    await abrirApp();
    await buscarLeite(user);

    expect(screen.getByLabelText('Foto ilustrativa de Leite Integral Piracanjuba 1L')).toBeOnTheScreen();
    expect(screen.getByLabelText('Foto de Leite Outra Marca 1L')).toBeOnTheScreen();
    expect(screen.getAllByTestId('etiqueta-ilustrativa', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('a lista inicial (sem digitar nada) já mostra as fotos', async () => {
    simularApi({ 'GET /produtos': { status: 200, corpo: { grupos: [COM_FOTO], total: 1 } } });
    await abrirApp();
    expect(await screen.findByLabelText('Foto de Leite Integral Piracanjuba 1L')).toBeOnTheScreen();
  });

  it('se a imagem não carrega, vira "Sem foto" em vez de um buraco', async () => {
    simularApi({ 'GET /busca': { status: 200, corpo: [COM_FOTO] } });
    const user = userEvent.setup();
    await abrirApp();
    await buscarLeite(user);

    await fireEvent(screen.getByTestId('foto-produto'), 'error');
    expect(screen.queryByTestId('foto-produto')).not.toBeOnTheScreen();
    expect(screen.getByTestId('sem-foto', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('quando a resposta nem informa fotos (cópia antiga), não ocupa espaço', async () => {
    const { foto: _foto, ...semCampo } = COM_FOTO;
    simularApi({ 'GET /busca': { status: 200, corpo: [semCampo] } });
    const user = userEvent.setup();
    await abrirApp();
    await buscarLeite(user);
    expect(screen.queryByTestId('foto-produto')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('sem-foto', { includeHiddenElements: true })).toBeNull();
  });

  it('os produtos de um mercado também mostram a foto', async () => {
    simularApi({
      'GET /mercados': { status: 200, corpo: [{ id: 1, nome: 'Mercado Bom Preço', endereco: 'Rua A, 10', totalProdutos: 1 }] },
      'GET /mercados/1/produtos': {
        status: 200,
        corpo: { total: 1, itens: [{ codigoBarras: '7891000100103', nome: 'Leite Piracanjuba', preco: 5.99, quantidadeTexto: '1 L', precoPorUnidade: 5.99, unidade: 'L', atualizadoEm: '2026-11-06T10:00:00.000Z', diasDesdeAtualizacao: 1, desatualizado: false, foto: '/fotos/7891000100103' }] },
      },
    });
    const user = userEvent.setup();
    await abrirApp();
    await user.press(aba('Estabelecimentos'));
    await user.press(await screen.findByText('Mercado Bom Preço'));
    expect(await screen.findByLabelText('Foto de Leite Piracanjuba')).toBeOnTheScreen();
  });

  it('a aba Conta credita a origem das fotos (licença do Open Food Facts)', async () => {
    simularApi({});
    const user = userEvent.setup();
    await abrirApp();
    await user.press(aba('Conta'));
    expect(await screen.findByText(CREDITO_FOTOS)).toBeOnTheScreen();
  });
});
