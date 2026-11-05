import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, produto, resposta, simularApi } from './ajudantesTeste';

const arroz = produto();
const feijao = produto({
  codigoBarras: '7891000200202',
  nome: 'Feijão Carioca 1kg',
  preco: 8.5,
  quantidadeTexto: null,
  categoria: null,
  disponivel: false,
  atualizadoEm: '2026-10-20T15:00:00.000Z',
  desatualizado: true,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A linha (<tr>) do produto; pegue antes de editar, porque depois o nome vira um campo. */
function linhaDe(nome: string): HTMLElement {
  const linha = screen.getByText(nome).closest('tr');
  if (!linha) throw new Error(`linha de ${nome} não encontrada`);
  return linha;
}

describe('lista de produtos', () => {
  it('mostra a tabela com preço formatado, data, código de barras e o selo Preço antigo', async () => {
    const chamadas = simularApi(() => resposta({ itens: [arroz, feijao], total: 2 }));
    abrir('/produtos');

    expect(await screen.findByText('Arroz Tipo 1 5kg')).toBeInTheDocument();
    expect(chamadas[0].caminho).toBe('/painel/produtos?pagina=1');
    expect(chamadas[0].autorizacao).toBe('Bearer tok-123');

    for (const titulo of ['Código de barras', 'Produto', 'Preço', 'Quantidade', 'Categoria', 'Disponível', 'Atualizado']) {
      expect(screen.getByRole('columnheader', { name: titulo })).toBeInTheDocument();
    }
    const l1 = within(linhaDe('Arroz Tipo 1 5kg'));
    expect(l1.getByText('7891000100103')).toBeInTheDocument();
    expect(l1.getByText('R$ 14,90')).toBeInTheDocument();
    expect(l1.getByText('5 kg')).toBeInTheDocument();
    expect(l1.getByText('Mercearia')).toBeInTheDocument();
    expect(l1.getByText('Sim')).toBeInTheDocument();
    expect(l1.getByText('02/11/2026')).toBeInTheDocument();
    expect(l1.queryByText('Preço antigo')).not.toBeInTheDocument();

    const l2 = within(linhaDe('Feijão Carioca 1kg'));
    expect(l2.getByText('R$ 8,50')).toBeInTheDocument();
    expect(l2.getByText('Não')).toBeInTheDocument();
    expect(l2.getByText('20/10/2026')).toBeInTheDocument();
    expect(l2.getByText('Preço antigo')).toBeInTheDocument();
    expect(screen.getByText('2 produtos')).toBeInTheDocument();
  });

  it('lista vazia mostra a mensagem e o link para enviar planilha', async () => {
    simularApi(() => resposta({ itens: [], total: 0 }));
    abrir('/produtos');

    expect(await screen.findByText('Nenhum produto ainda. Envie uma planilha.')).toBeInTheDocument();
    const vazio = screen.getByText('Nenhum produto ainda. Envie uma planilha.').closest('section')!;
    expect(within(vazio).getByRole('link', { name: 'Enviar planilha' })).toHaveAttribute('href', '/planilha');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('erro ao carregar mostra o alerta com a mensagem do servidor', async () => {
    simularApi(() => resposta({ erro: 'Sua conta não está ligada a um mercado ativo' }, 403));
    abrir('/produtos');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta não está ligada a um mercado ativo');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('Tentar de novo refaz a chamada depois de um erro', async () => {
    let falhar = true;
    const chamadas = simularApi(() =>
      falhar ? resposta({ erro: 'Erro interno' }, 500) : resposta({ itens: [arroz], total: 1 }),
    );
    abrir('/produtos');
    await screen.findByRole('alert');
    falhar = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Arroz Tipo 1 5kg')).toBeInTheDocument();
    expect(chamadas).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sessão recusada (401) limpa a sessão e leva para /entrar', async () => {
    simularApi(() => resposta({ erro: 'Sessão expirada' }, 401));
    abrir('/produtos');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });

  it('mostra a mensagem de carregamento enquanto espera', async () => {
    let concluir!: (r: Response) => void;
    simularApi(() => new Promise<Response>((res) => (concluir = res)));
    abrir('/produtos');

    expect(screen.getByText('Carregando produtos…')).toBeInTheDocument();
    concluir(resposta({ itens: [arroz], total: 1 }));
    expect(await screen.findByText('Arroz Tipo 1 5kg')).toBeInTheDocument();
    expect(screen.queryByText('Carregando produtos…')).not.toBeInTheDocument();
  });
});

describe('paginação', () => {
  it('Próxima pede a página 2 e mostra Página 2 de 3 para total 120', async () => {
    const chamadas = simularApi((c) =>
      c.caminho.endsWith('pagina=2')
        ? resposta({ itens: [feijao], total: 120 })
        : resposta({ itens: [arroz], total: 120 }),
    );
    abrir('/produtos');

    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Próxima' }));

    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    expect(await screen.findByText('Feijão Carioca 1kg')).toBeInTheDocument();
    expect(screen.queryByText('Arroz Tipo 1 5kg')).not.toBeInTheDocument();
    expect(chamadas.map((c) => c.caminho)).toEqual(['/painel/produtos?pagina=1', '/painel/produtos?pagina=2']);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeEnabled();
  });

  it('na última página a Próxima fica desabilitada e Anterior volta uma página', async () => {
    const chamadas = simularApi((c) =>
      c.caminho.endsWith('pagina=1') ? resposta({ itens: [arroz], total: 120 }) : resposta({ itens: [feijao], total: 120 }),
    );
    abrir('/produtos');
    const user = userEvent.setup();
    await screen.findByText('Página 1 de 3');
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Página 2 de 3');
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Página 3 de 3');
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByText('Página 2 de 3');
    expect(chamadas.at(-1)?.caminho).toBe('/painel/produtos?pagina=2');
  });
});

describe('edição na linha', () => {
  async function abrirEdicao() {
    const user = userEvent.setup();
    let patch: () => Response = () => resposta(arroz);
    const chamadas = simularApi((c) => (c.metodo === 'GET' ? resposta({ itens: [arroz, feijao], total: 2 }) : patch()));
    abrir('/produtos');
    await screen.findByText('Arroz Tipo 1 5kg');
    const tr = linhaDe('Arroz Tipo 1 5kg');
    const linha = within(tr);
    await user.click(linha.getByRole('button', { name: 'Editar' }));
    return {
      user,
      chamadas,
      linha,
      tr,
      respondePatch: (fn: () => Response) => {
        patch = fn;
      },
      mudancas: () => chamadas.filter((c) => c.metodo !== 'GET'),
    };
  }

  it('Editar transforma a linha em campos; o código de barras fica desabilitado', async () => {
    const { linha } = await abrirEdicao();

    expect(linha.getByLabelText('Código de barras')).toBeDisabled();
    expect(linha.getByLabelText('Código de barras')).toHaveValue('7891000100103');
    expect(linha.getByLabelText('Produto')).toHaveValue('Arroz Tipo 1 5kg');
    expect(linha.getByLabelText('Preço')).toHaveValue('14,90');
    expect(linha.getByLabelText('Quantidade')).toHaveValue('5 kg');
    expect(linha.getByLabelText('Categoria')).toHaveValue('Mercearia');
    expect(linha.getByLabelText('Disponível')).toBeChecked();
    expect(linha.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(linha.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(linha.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('salvar só o preço envia exatamente { preco: 15.9 } e mostra o novo preço', async () => {
    const { user, linha, tr, respondePatch, mudancas } = await abrirEdicao();
    respondePatch(() => resposta({ ...arroz, preco: 15.9, atualizadoEm: '2026-11-04T15:00:00.000Z' }));

    const campo = linha.getByLabelText('Preço');
    await user.clear(campo);
    await user.type(campo, '15,90');
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    expect(await within(tr).findByText('R$ 15,90')).toBeInTheDocument();
    expect(mudancas()).toHaveLength(1);
    const [patch] = mudancas();
    expect(patch.metodo).toBe('PATCH');
    expect(patch.caminho).toBe('/painel/produtos/7891000100103');
    expect(patch.corpo).toEqual({ preco: 15.9 });
    expect(patch.autorizacao).toBe('Bearer tok-123');
    expect(within(tr).queryByLabelText('Preço')).not.toBeInTheDocument();
    expect(within(tr).getByText('04/11/2026')).toBeInTheDocument();
    expect(within(tr).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Produto atualizado');
  });

  it('aceita o preço com ponto (15.90) e envia o número 15.9', async () => {
    const { user, linha, tr, mudancas } = await abrirEdicao();
    const campo = linha.getByLabelText('Preço');
    await user.clear(campo);
    await user.type(campo, '15.90');
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    await within(tr).findByRole('button', { name: 'Editar' });
    expect(mudancas()[0].corpo).toEqual({ preco: 15.9 });
  });

  it('alterar nome e categoria envia só esses dois campos', async () => {
    const { user, linha, tr, mudancas } = await abrirEdicao();
    const nome = linha.getByLabelText('Produto');
    await user.clear(nome);
    await user.type(nome, 'Arroz Integral 5kg');
    const categoria = linha.getByLabelText('Categoria');
    await user.clear(categoria);
    await user.type(categoria, 'Grãos');
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    await within(tr).findByRole('button', { name: 'Editar' });
    expect(mudancas()[0].corpo).toEqual({ nome: 'Arroz Integral 5kg', categoria: 'Grãos' });
  });

  it('limpar quantidade e desmarcar Disponível envia quantidade null e disponivel false', async () => {
    const { user, linha, tr, mudancas } = await abrirEdicao();
    await user.clear(linha.getByLabelText('Quantidade'));
    await user.click(linha.getByLabelText('Disponível'));
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    await within(tr).findByRole('button', { name: 'Editar' });
    expect(mudancas()[0].corpo).toEqual({ quantidade: null, disponivel: false });
  });

  it('preço que não dá para ler segue como texto para o servidor responder', async () => {
    const { user, linha, respondePatch, mudancas } = await abrirEdicao();
    respondePatch(() => resposta({ erro: 'Preço inválido' }, 400));
    const campo = linha.getByLabelText('Preço');
    await user.clear(campo);
    await user.type(campo, 'abc');
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    expect(await linha.findByRole('alert')).toHaveTextContent('Preço inválido');
    expect(mudancas()[0].corpo).toEqual({ preco: 'abc' });
  });

  it('erro 400 mostra a mensagem do servidor na linha e a linha continua editável', async () => {
    const { user, linha, tr, respondePatch } = await abrirEdicao();
    respondePatch(() => resposta({ erro: 'Preço inválido' }, 400));
    const campo = linha.getByLabelText('Preço');
    await user.clear(campo);
    await user.type(campo, '0');
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    expect(await linha.findByRole('alert')).toHaveTextContent('Preço inválido');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(tr).toContainElement(screen.getByRole('alert'));
    expect(linha.getByLabelText('Preço')).toHaveValue('0');
    expect(linha.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('erro 409 também mostra a mensagem na linha', async () => {
    const { user, linha, respondePatch } = await abrirEdicao();
    respondePatch(() => resposta({ erro: 'Conflito ao salvar' }, 409));
    await user.click(linha.getByLabelText('Disponível'));
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    expect(await linha.findByRole('alert')).toHaveTextContent('Conflito ao salvar');
  });

  it('erro 404 ao salvar mostra a mensagem na linha', async () => {
    const { user, linha, respondePatch } = await abrirEdicao();
    respondePatch(() => resposta({ erro: 'Produto não encontrado' }, 404));
    await user.click(linha.getByLabelText('Disponível'));
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    expect(await linha.findByRole('alert')).toHaveTextContent('Produto não encontrado');
    expect(linha.getByLabelText('Preço')).toBeInTheDocument();
  });

  it('Cancelar descarta as mudanças sem chamar o servidor', async () => {
    const { user, linha, tr, mudancas } = await abrirEdicao();
    const campo = linha.getByLabelText('Preço');
    await user.clear(campo);
    await user.type(campo, '99');
    await user.click(linha.getByRole('button', { name: 'Cancelar' }));

    expect(within(tr).getByText('R$ 14,90')).toBeInTheDocument();
    expect(within(tr).queryByLabelText('Preço')).not.toBeInTheDocument();
    expect(mudancas()).toHaveLength(0);
  });

  it('Salvar sem mudar nada fecha a edição sem chamar o servidor', async () => {
    const { user, linha, tr, mudancas } = await abrirEdicao();
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    expect(within(tr).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(mudancas()).toHaveLength(0);
  });

  it('sessão recusada (401) ao salvar leva para /entrar', async () => {
    const { user, linha, respondePatch } = await abrirEdicao();
    respondePatch(() => resposta({ erro: 'Sessão expirada' }, 401));
    await user.click(linha.getByLabelText('Disponível'));
    await user.click(linha.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});

describe('remover', () => {
  async function abrirLista() {
    const user = userEvent.setup();
    let apagar: () => Response = () => resposta(null, 204);
    const chamadas = simularApi((c) =>
      c.metodo === 'DELETE' ? apagar() : resposta({ itens: [arroz, feijao], total: 2 }),
    );
    abrir('/produtos');
    await screen.findByText('Arroz Tipo 1 5kg');
    return {
      user,
      linha: within(linhaDe('Arroz Tipo 1 5kg')),
      respondeDelete: (fn: () => Response) => {
        apagar = fn;
      },
      apagados: () => chamadas.filter((c) => c.metodo === 'DELETE'),
    };
  }

  it('só chama DELETE depois de Confirmar remoção; a linha some e a contagem cai', async () => {
    const { user, linha, apagados } = await abrirLista();
    await user.click(linha.getByRole('button', { name: 'Remover' }));

    expect(linha.getByText('Remover este produto?')).toBeInTheDocument();
    expect(apagados()).toHaveLength(0);

    await user.click(linha.getByRole('button', { name: 'Confirmar remoção' }));

    await waitFor(() => expect(screen.queryByText('Arroz Tipo 1 5kg')).not.toBeInTheDocument());
    expect(apagados()).toHaveLength(1);
    expect(apagados()[0].caminho).toBe('/painel/produtos/7891000100103');
    expect(apagados()[0].autorizacao).toBe('Bearer tok-123');
    expect(screen.getByText('1 produto')).toBeInTheDocument();
    expect(screen.getByText('Feijão Carioca 1kg')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Produto removido');
  });

  it('Cancelar na confirmação aborta sem chamar DELETE', async () => {
    const { user, linha, apagados } = await abrirLista();
    await user.click(linha.getByRole('button', { name: 'Remover' }));
    await user.click(linha.getByRole('button', { name: 'Cancelar' }));

    expect(linha.queryByText('Remover este produto?')).not.toBeInTheDocument();
    expect(linha.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
    expect(screen.getByText('Arroz Tipo 1 5kg')).toBeInTheDocument();
    expect(apagados()).toHaveLength(0);
  });

  it('404 ao remover mostra a mensagem na linha e a linha continua', async () => {
    const { user, linha, respondeDelete } = await abrirLista();
    respondeDelete(() => resposta({ erro: 'Produto não encontrado' }, 404));
    await user.click(linha.getByRole('button', { name: 'Remover' }));
    await user.click(linha.getByRole('button', { name: 'Confirmar remoção' }));

    expect(await linha.findByRole('alert')).toHaveTextContent('Produto não encontrado');
    expect(screen.getByText('Arroz Tipo 1 5kg')).toBeInTheDocument();
    expect(screen.getByText('2 produtos')).toBeInTheDocument();
  });

  it('remover o último produto mostra o estado vazio', async () => {
    const user = userEvent.setup();
    simularApi((c) => (c.metodo === 'DELETE' ? resposta(null, 204) : resposta({ itens: [arroz], total: 1 })));
    abrir('/produtos');
    await screen.findByText('Arroz Tipo 1 5kg');
    const linha = within(linhaDe('Arroz Tipo 1 5kg'));
    await user.click(linha.getByRole('button', { name: 'Remover' }));
    await user.click(linha.getByRole('button', { name: 'Confirmar remoção' }));

    expect(await screen.findByText('Nenhum produto ainda. Envie uma planilha.')).toBeInTheDocument();
  });
});
