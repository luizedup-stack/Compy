import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, produto, resposta, simularApi } from './ajudantesTeste';
import { ErroDeFoto, MSG_NAO_LEU, reduzirImagem } from './foto';

// Só o redutor de imagem é trocado (o navegador de teste não tem canvas); o resto da tela e do envio é de verdade.
vi.mock('./foto', async (original) => ({ ...(await original<typeof import('./foto')>()), reduzirImagem: vi.fn() }));
const reduzir = vi.mocked(reduzirImagem);
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const semFoto = produto({ foto: null, fotoOrigem: null });
const comFotoAutomatica = produto({ codigoBarras: '7891000200202', nome: 'Feijão Carioca 1kg', foto: '/fotos/7891000200202', fotoOrigem: 'automatica' });
const comFotoDoMercado = produto({ codigoBarras: '7891000300303', nome: 'Macarrão 500g', foto: '/fotos/7891000300303', fotoOrigem: 'mercado' });

beforeEach(() => {
  fetchMock.mockReset();
  reduzir.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao();
});
afterEach(() => vi.unstubAllGlobals());

const linhaDe = (nome: string) => within(screen.getByText(nome).closest('tr')!);
const arquivo = () => new File([new Uint8Array([1, 2, 3])], 'leite.jpg', { type: 'image/jpeg' });

describe('foto na lista de produtos', () => {
  it('mostra a foto (do endereço do servidor) ou "Sem foto", e o botão certo em cada caso', async () => {
    simularApi(() => resposta({ itens: [semFoto, comFotoAutomatica, comFotoDoMercado], total: 3 }));
    abrir('/produtos');
    await screen.findByText(semFoto.nome);

    expect(screen.getByRole('columnheader', { name: 'Foto' })).toBeInTheDocument();
    expect(linhaDe(semFoto.nome).getByText('Sem foto')).toBeInTheDocument();
    expect(linhaDe(semFoto.nome).getByRole('button', { name: 'Enviar foto' })).toBeInTheDocument();
    expect(linhaDe(semFoto.nome).queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();

    const automatica = linhaDe('Feijão Carioca 1kg');
    expect(automatica.getByRole('img', { name: 'Foto de Feijão Carioca 1kg' })).toHaveAttribute('src', 'http://localhost:3000/fotos/7891000200202');
    expect(automatica.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument();
    // A foto achada sozinha não se remove (só se troca); a enviada pelo mercado, sim.
    expect(automatica.queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
    expect(linhaDe('Macarrão 500g').getByRole('button', { name: 'Remover foto' })).toBeInTheDocument();
  });

  it('enviar foto: reduz a imagem, manda ao servidor e a foto aparece na linha, com "Remover foto"', async () => {
    reduzir.mockResolvedValue(FOTO);
    const chamadas = simularApi((c) =>
      c.metodo === 'PUT' ? resposta({ foto: `/fotos/${semFoto.codigoBarras}`, fotoOrigem: 'mercado' }) : resposta({ itens: [semFoto], total: 1 }),
    );
    const user = userEvent.setup();
    abrir('/produtos');
    await screen.findByText(semFoto.nome);

    await user.upload(screen.getByLabelText(`Escolher foto de ${semFoto.nome}`), arquivo());

    const linha = linhaDe(semFoto.nome);
    expect(await linha.findByRole('img', { name: `Foto de ${semFoto.nome}` })).toHaveAttribute('src', expect.stringContaining(`/fotos/${semFoto.codigoBarras}?v=`));
    expect(linha.getByRole('button', { name: 'Remover foto' })).toBeInTheDocument();
    expect(linha.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument();
    const envio = chamadas.find((c) => c.metodo === 'PUT')!;
    expect(envio.caminho).toBe(`/painel/produtos/${semFoto.codigoBarras}/foto`);
    expect(envio.corpo).toEqual({ imagem: FOTO });
    expect(envio.autorizacao).toBe('Bearer tok-123');
  });

  it('imagem que não dá para usar: mostra a mensagem e não envia nada', async () => {
    reduzir.mockRejectedValue(new ErroDeFoto(MSG_NAO_LEU));
    const chamadas = simularApi(() => resposta({ itens: [semFoto], total: 1 }));
    const user = userEvent.setup();
    abrir('/produtos');
    await screen.findByText(semFoto.nome);

    await user.upload(screen.getByLabelText(`Escolher foto de ${semFoto.nome}`), arquivo());

    expect(await linhaDe(semFoto.nome).findByRole('alert')).toHaveTextContent(MSG_NAO_LEU);
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);
    expect(linhaDe(semFoto.nome).getByText('Sem foto')).toBeInTheDocument();
  });

  it('o servidor recusar a foto: mostra a mensagem dele e a linha continua sem foto', async () => {
    reduzir.mockResolvedValue(FOTO);
    simularApi((c) => (c.metodo === 'PUT' ? resposta({ erro: 'Envie uma foto em JPEG, PNG ou WebP.' }, 400) : resposta({ itens: [semFoto], total: 1 })));
    const user = userEvent.setup();
    abrir('/produtos');
    await screen.findByText(semFoto.nome);

    await user.upload(screen.getByLabelText(`Escolher foto de ${semFoto.nome}`), arquivo());

    expect(await linhaDe(semFoto.nome).findByRole('alert')).toHaveTextContent('Envie uma foto em JPEG, PNG ou WebP.');
    expect(linhaDe(semFoto.nome).getByText('Sem foto')).toBeInTheDocument();
  });

  it('remover a foto enviada pelo mercado: apaga no servidor e a linha volta a "Sem foto"', async () => {
    const chamadas = simularApi((c) => (c.metodo === 'DELETE' ? resposta(null, 204) : resposta({ itens: [comFotoDoMercado], total: 1 })));
    const user = userEvent.setup();
    abrir('/produtos');
    await screen.findByText('Macarrão 500g');

    await user.click(linhaDe('Macarrão 500g').getByRole('button', { name: 'Remover foto' }));

    await waitFor(() => expect(linhaDe('Macarrão 500g').getByText('Sem foto')).toBeInTheDocument());
    expect(chamadas.find((c) => c.metodo === 'DELETE')?.caminho).toBe('/painel/produtos/7891000300303/foto');
    expect(linhaDe('Macarrão 500g').queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
  });
});
