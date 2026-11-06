// Testes do botão "Novo produto" (cadastro de um produto à mão na tela Produtos).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, produto, resposta, simularApi } from './ajudantesTeste';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Abre o formulário e preenche os campos obrigatórios (mais os opcionais que vierem em `extra`). */
async function preencher(
  usuario: ReturnType<typeof userEvent.setup>,
  extra: { quantidade?: string; categoria?: string } = {},
) {
  await usuario.click(screen.getByRole('button', { name: 'Novo produto' }));
  const form = screen.getByRole('form', { name: 'Novo produto' });
  await usuario.type(within(form).getByLabelText('Código de barras'), ' 7891000100103 ');
  await usuario.type(within(form).getByLabelText('Produto'), ' Leite Integral 1 L ');
  await usuario.type(within(form).getByLabelText('Preço'), '5,50');
  if (extra.quantidade) await usuario.type(within(form).getByLabelText(/^Quantidade/), extra.quantidade);
  if (extra.categoria) await usuario.type(within(form).getByLabelText(/^Categoria/), extra.categoria);
  return form;
}

describe('Novo produto', () => {
  it('o botão aparece com a lista vazia e com a lista cheia', async () => {
    simularApi(() => resposta({ itens: [], total: 0 }));
    abrir('/produtos');
    expect(await screen.findByRole('button', { name: 'Novo produto' })).toBeInTheDocument();
  });

  it('cadastra o produto (enviando só o que foi digitado, sem espaços) e recarrega a lista com aviso', async () => {
    const leite = produto({ codigoBarras: '7891000100103', nome: 'Leite Integral 1 L', preco: 5.5, quantidadeTexto: '1 L', categoria: null });
    let criado = false;
    const chamadas = simularApi((c) => {
      if (c.metodo === 'POST') {
        criado = true;
        return resposta(leite, 201);
      }
      return resposta(criado ? { itens: [leite], total: 1 } : { itens: [], total: 0 });
    });
    abrir('/produtos');
    await screen.findByRole('button', { name: 'Novo produto' });
    const usuario = userEvent.setup();
    const form = await preencher(usuario, { quantidade: '1 L' });
    await usuario.click(within(form).getByRole('button', { name: 'Cadastrar produto' }));

    // A lista foi recarregada e mostra o produto novo, com o aviso.
    expect(await screen.findByText('Leite Integral 1 L')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Produto cadastrado: Leite Integral 1 L');
    expect(screen.queryByRole('form', { name: 'Novo produto' })).not.toBeInTheDocument();

    const envio = chamadas.find((c) => c.metodo === 'POST')!;
    expect(envio.caminho).toBe('/painel/produtos');
    expect(envio.autorizacao).toBe('Bearer tok-123');
    expect(envio.corpo).toEqual({
      codigoBarras: '7891000100103',
      nome: 'Leite Integral 1 L',
      preco: '5,50',
      quantidade: '1 L',
      categoria: null,
      disponivel: true,
    });
  });

  it('mostra o erro do servidor (ex.: código repetido) e mantém o formulário com o que foi digitado', async () => {
    simularApi((c) =>
      c.metodo === 'POST'
        ? resposta({ erro: 'Já existe um produto com esse código de barras neste mercado' }, 409)
        : resposta({ itens: [], total: 0 }),
    );
    abrir('/produtos');
    await screen.findByRole('button', { name: 'Novo produto' });
    const usuario = userEvent.setup();
    const form = await preencher(usuario);
    await usuario.click(within(form).getByRole('button', { name: 'Cadastrar produto' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('Já existe um produto com esse código de barras neste mercado');
    expect(within(form).getByLabelText('Produto')).toHaveValue(' Leite Integral 1 L ');
  });

  it('Cancelar fecha o formulário sem chamar o servidor e devolve o foco ao botão', async () => {
    const chamadas = simularApi(() => resposta({ itens: [], total: 0 }));
    abrir('/produtos');
    await screen.findByRole('button', { name: 'Novo produto' });
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('button', { name: 'Novo produto' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('form', { name: 'Novo produto' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo produto' })).toHaveFocus();
    expect(chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(0);
  });

  it('sessão recusada (401) leva para entrar', async () => {
    simularApi((c) => (c.metodo === 'POST' ? resposta({ erro: 'Sessão inválida' }, 401) : resposta({ itens: [], total: 0 })));
    abrir('/produtos');
    await screen.findByRole('button', { name: 'Novo produto' });
    const usuario = userEvent.setup();
    const form = await preencher(usuario);
    await usuario.click(within(form).getByRole('button', { name: 'Cadastrar produto' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('o administrador cadastra no mercado escolhido (a chamada leva ?mercadoId=)', async () => {
    comSessao('admin');
    localStorage.setItem('bolso-certo:mercado-escolhido', '7');
    const chamadas = simularApi((c) => {
      if (c.caminho.startsWith('/admin/mercados')) {
        return resposta([{ id: 7, nome: 'Mercado Sete', endereco: 'Rua 7', status: 'ativo', totalProdutos: 0, temLogin: true }]);
      }
      if (c.metodo === 'POST') return resposta(produto({ codigoBarras: '7891000100103', nome: 'Leite' }), 201);
      return resposta({ itens: [], total: 0 });
    });
    abrir('/produtos');
    await screen.findByRole('button', { name: 'Novo produto' });
    const usuario = userEvent.setup();
    const form = await preencher(usuario);
    await usuario.click(within(form).getByRole('button', { name: 'Cadastrar produto' }));
    await screen.findByRole('button', { name: 'Novo produto' });
    expect(chamadas.find((c) => c.metodo === 'POST')!.caminho).toBe('/painel/produtos?mercadoId=7');
  });
});
