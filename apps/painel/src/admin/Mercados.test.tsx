import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MercadoAdmin } from '../api';
import { abrir, comSessao, fetchMock, resposta, simularApi, type Chamada } from '../ajudantesTeste';

const SENHA = 'Ab3dEf9hJk2m';

const mercado = (extra: Partial<MercadoAdmin>): MercadoAdmin => ({
  id: 1,
  nome: 'Mercado Central',
  endereco: 'Rua A, 10',
  status: 'ativo',
  totalProdutos: 12,
  temLogin: false,
  ...extra,
});

const central = mercado({});
const bairro = mercado({ id: 2, nome: 'Super Bairro', endereco: 'Av. B, 200', totalProdutos: 1, temLogin: true });
const antigo = mercado({ id: 3, nome: 'Mercadinho Antigo', endereco: 'Rua C, 3', status: 'removido', totalProdutos: 0 });
const emporio = mercado({ id: 4, nome: 'Empório Sul', endereco: 'Rua D, 4', totalProdutos: 7 });
const todos = [central, bairro, antigo, emporio];

type Resposta = Response | Promise<Response> | undefined;

/** Lista os mercados de exemplo; `responder` trata as demais chamadas (e pode trocar a lista). */
function simular(responder?: (c: Chamada) => Resposta): Chamada[] {
  return simularApi((c) => {
    const especial = responder?.(c);
    if (especial) return especial;
    if (c.metodo === 'GET' && c.caminho === '/admin/mercados') return resposta(todos);
    return resposta({ erro: 'chamada inesperada' }, 500);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao('admin');
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
});

/** A linha (<tr>) do mercado; pegue antes de agir, para não depender do que a linha mostra depois. */
function linhaDe(nome: string): HTMLElement {
  const linha = screen.getByText(nome).closest('tr');
  if (!linha) throw new Error(`linha de ${nome} não encontrada`);
  return linha;
}

function simularClipboard(writeText: ((t: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

async function criarAcessoNaLinha(u: ReturnType<typeof userEvent.setup>, linha: HTMLElement, email = 'x@y.com') {
  await u.click(within(linha).getByRole('button', { name: 'Criar acesso' }));
  await u.type(within(linha).getByLabelText('E-mail do mercado'), email);
  await u.click(within(linha).getByRole('button', { name: 'Criar' }));
}

describe('acesso à tela e navegação', () => {
  it('mercado não vê Administração e, em /admin/mercados, cai em /planilha sem chamar o /admin', () => {
    comSessao('mercado');
    simular();
    abrir('/admin/mercados');

    expect(screen.getByRole('heading', { name: 'Enviar planilha' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem sessão, /admin/mercados redireciona para /entrar sem chamar a API', () => {
    localStorage.clear();
    simular();
    abrir('/admin/mercados');

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admin vê Enviar planilha e Administração, com os endereços certos', async () => {
    simular();
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Enviar planilha', 'Administração']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/planilha', '/admin/mercados']);
    expect(within(nav).getByRole('link', { name: 'Administração' })).toHaveAttribute('aria-current', 'page');
  });

  it('clicar em Administração abre a tela Mercados', async () => {
    simular();
    abrir('/planilha');
    await userEvent.setup().click(screen.getByRole('link', { name: 'Administração' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Mercados' })).toBeInTheDocument();
  });
});

describe('lista de mercados', () => {
  it('mostra a tabela com os dados, a explicação e o link para enviar planilha', async () => {
    const chamadas = simular();
    abrir('/admin/mercados');

    expect(await screen.findByText('Mercado Central')).toBeInTheDocument();
    expect(chamadas[0].caminho).toBe('/admin/mercados');
    expect(chamadas[0].autorizacao).toBe('Bearer tok-123');

    const secao = screen.getByRole('heading', { level: 1, name: 'Mercados' }).closest('section')!;
    expect(
      within(secao).getByText(/Para adicionar um mercado, envie a planilha dele em/),
    ).toBeInTheDocument();
    expect(within(secao).getAllByRole('link', { name: 'Enviar planilha' })[0]).toHaveAttribute('href', '/planilha');

    for (const titulo of ['Mercado', 'Situação', 'Produtos', 'Acesso', 'Ações']) {
      expect(screen.getByRole('columnheader', { name: titulo })).toBeInTheDocument();
    }
    const l1 = within(linhaDe('Mercado Central'));
    expect(l1.getByText('Rua A, 10')).toBeInTheDocument();
    expect(l1.getByText('Ativo')).toBeInTheDocument();
    expect(l1.getByText('12')).toBeInTheDocument();
    expect(l1.getByRole('button', { name: 'Criar acesso' })).toBeInTheDocument();
    expect(l1.getByRole('button', { name: 'Remover' })).toBeInTheDocument();

    const l3 = within(linhaDe('Mercadinho Antigo'));
    expect(l3.getByText('Removido')).toBeInTheDocument();
    expect(l3.getByText('0')).toBeInTheDocument();

    expect(screen.getByRole('table').closest('.tabela-rolagem')).not.toBeNull();
  });

  it('mercado com login mostra "Já tem acesso" e nenhum botão Criar acesso', async () => {
    simular();
    abrir('/admin/mercados');
    await screen.findByText('Super Bairro');

    const l2 = within(linhaDe('Super Bairro'));
    expect(l2.getByText('Já tem acesso')).toBeInTheDocument();
    expect(l2.queryByRole('button', { name: 'Criar acesso' })).not.toBeInTheDocument();
    expect(l2.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });

  it('mercado removido não tem nenhuma ação', async () => {
    simular();
    abrir('/admin/mercados');
    await screen.findByText('Mercadinho Antigo');

    expect(within(linhaDe('Mercadinho Antigo')).queryAllByRole('button')).toHaveLength(0);
  });

  it('botões repetidos apontam para o nome do mercado da linha', async () => {
    simular();
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');

    expect(within(linhaDe('Mercado Central')).getByRole('button', { name: 'Criar acesso' })).toHaveAccessibleDescription(
      'Mercado Central',
    );
    expect(within(linhaDe('Empório Sul')).getByRole('button', { name: 'Remover' })).toHaveAccessibleDescription(
      'Empório Sul',
    );
  });

  it('lista vazia mostra a mensagem e o link para enviar planilha', async () => {
    simularApi(() => resposta([]));
    abrir('/admin/mercados');

    const texto = await screen.findByText('Nenhum mercado ainda. Envie uma planilha.');
    expect(within(texto.closest('div')!).getByRole('link', { name: 'Enviar planilha' })).toHaveAttribute(
      'href',
      '/planilha',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('erro ao carregar mostra a mensagem e Tentar de novo refaz a chamada', async () => {
    let falhar = true;
    const chamadas = simularApi(() => (falhar ? resposta({ erro: 'Erro interno' }, 500) : resposta([central])));
    abrir('/admin/mercados');

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    falhar = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Mercado Central')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(chamadas).toHaveLength(2);
  });

  it('401 ao listar limpa a sessão e volta para o login', async () => {
    simularApi(() => resposta({ erro: 'Sessão expirada' }, 401));
    abrir('/admin/mercados');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('bolso-certo:sessao')).toBeNull();
  });
});

describe('criar acesso', () => {
  it('mostra a senha temporária uma única vez e ela some ao fechar', async () => {
    const chamadas = simular((c) =>
      c.metodo === 'POST' && c.caminho === '/admin/mercados/1/acesso' ? resposta({ senhaTemporaria: SENHA }, 201) : undefined,
    );
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await u.click(within(linha).getByRole('button', { name: 'Criar acesso' }));
    expect(within(linha).getByLabelText('E-mail do mercado')).toHaveFocus();
    await u.type(within(linha).getByLabelText('E-mail do mercado'), 'x@y.com');
    await u.click(within(linha).getByRole('button', { name: 'Criar' }));

    const painel = await within(linha).findByRole('status');
    expect(painel).toHaveTextContent('Anote agora: esta senha não será mostrada de novo.');
    expect(painel).toHaveTextContent('x@y.com');
    const senha = within(painel).getByText(SENHA);
    expect(senha.tagName).toBe('CODE');
    expect(localStorage.getItem('bolso-certo:sessao')).not.toContain(SENHA);
    expect(JSON.stringify({ ...localStorage })).not.toContain(SENHA);

    const post = chamadas.find((c) => c.metodo === 'POST');
    expect(post?.caminho).toBe('/admin/mercados/1/acesso');
    expect(post?.corpo).toEqual({ email: 'x@y.com' });
    expect(post?.autorizacao).toBe('Bearer tok-123');

    await u.click(within(painel).getByRole('button', { name: 'Fechar' }));

    expect(screen.queryByText(SENHA)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SENHA);
    expect(within(linha).queryByRole('status')).not.toBeInTheDocument();
    expect(within(linha).getByText('Já tem acesso')).toBeInTheDocument();
    expect(within(linha).queryByRole('button', { name: 'Criar acesso' })).not.toBeInTheDocument();
  });

  it.each([
    [409, 'Esse e-mail já está cadastrado'],
    [400, 'E-mail inválido'],
  ])('erro %i mostra a mensagem do servidor na linha e o formulário continua aberto', async (status, mensagem) => {
    simular((c) => (c.metodo === 'POST' ? resposta({ erro: mensagem }, status) : undefined));
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const linha = linhaDe('Mercado Central');

    await criarAcessoNaLinha(userEvent.setup(), linha, 'ruim@y.com');

    expect(await within(linha).findByRole('alert')).toHaveTextContent(mensagem);
    expect(within(linha).getByLabelText('E-mail do mercado')).toHaveValue('ruim@y.com');
    expect(within(linha).getByRole('button', { name: 'Criar' })).toBeEnabled();
    expect(within(linha).queryByRole('status')).not.toBeInTheDocument();
    // as outras linhas não são afetadas
    expect(within(linhaDe('Empório Sul')).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mensagem do servidor é mostrada como texto, nunca como HTML', async () => {
    simular((c) => (c.metodo === 'POST' ? resposta({ erro: '<b>negrito</b>' }, 409) : undefined));
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const linha = linhaDe('Mercado Central');

    await criarAcessoNaLinha(userEvent.setup(), linha);

    const alerta = await within(linha).findByRole('alert');
    expect(alerta).toHaveTextContent('<b>negrito</b>');
    expect(alerta.querySelector('b')).toBeNull();
  });

  it('Cancelar fecha o formulário sem chamar a API e devolve o foco ao botão', async () => {
    const chamadas = simular();
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await u.click(within(linha).getByRole('button', { name: 'Criar acesso' }));
    await u.click(within(linha).getByRole('button', { name: 'Cancelar' }));

    expect(within(linha).queryByLabelText('E-mail do mercado')).not.toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Criar acesso' })).toHaveFocus();
    expect(chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(0);
  });

  it('enquanto a chamada está em andamento, os botões da linha ficam desligados', async () => {
    let liberar: (r: Response) => void = () => {};
    simular((c) =>
      c.metodo === 'POST' ? new Promise<Response>((ok) => (liberar = ok)) : undefined,
    );
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await criarAcessoNaLinha(u, linha);

    await waitFor(() => expect(within(linha).getByRole('button', { name: /^Criando/ })).toBeDisabled());
    expect(within(linha).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(within(linha).getByRole('button', { name: 'Remover' })).toBeDisabled();
    expect(within(linhaDe('Empório Sul')).getByRole('button', { name: 'Remover' })).toBeEnabled();

    liberar(resposta({ senhaTemporaria: SENHA }, 201));
    expect(await within(linha).findByText(SENHA)).toBeInTheDocument();
  });

  it('401 ao criar acesso limpa a sessão e volta para o login', async () => {
    simular((c) => (c.metodo === 'POST' ? resposta({ erro: 'Sessão expirada' }, 401) : undefined));
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');

    await criarAcessoNaLinha(userEvent.setup(), linhaDe('Mercado Central'));

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('bolso-certo:sessao')).toBeNull();
  });

  it('sair da tela com a senha à mostra apaga a senha; ao voltar a linha só diz que já tem acesso', async () => {
    let lista = todos;
    simular((c) => {
      if (c.metodo === 'POST') {
        lista = todos.map((m) => (m.id === 1 ? { ...m, temLogin: true } : m));
        return resposta({ senhaTemporaria: SENHA }, 201);
      }
      return c.caminho === '/admin/mercados' ? resposta(lista) : undefined;
    });
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();

    await criarAcessoNaLinha(u, linhaDe('Mercado Central'));
    expect(await screen.findByText(SENHA)).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    await u.click(within(nav).getByRole('link', { name: 'Enviar planilha' }));
    expect(await screen.findByRole('heading', { name: 'Enviar planilha' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SENHA);

    await u.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Administração' }));
    await screen.findByText('Mercado Central');
    expect(document.body.textContent).not.toContain(SENHA);
    expect(within(linhaDe('Mercado Central')).getByText('Já tem acesso')).toBeInTheDocument();
  });
});

describe('copiar senha', () => {
  async function comSenhaNaTela() {
    simular((c) => (c.metodo === 'POST' ? resposta({ senhaTemporaria: SENHA }, 201) : undefined));
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup(); // instala o clipboard de mentira do user-event; o teste põe o seu depois
    const linha = linhaDe('Mercado Central');
    await criarAcessoNaLinha(u, linha);
    await within(linha).findByText(SENHA);
    return { u, linha };
  }

  it('copia a senha para a área de transferência', async () => {
    const { u, linha } = await comSenhaNaTela();
    const writeText = vi.fn().mockResolvedValue(undefined);
    simularClipboard(writeText);

    await u.click(within(linha).getByRole('button', { name: 'Copiar senha' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(SENHA);
    expect(await within(linha).findByText('Senha copiada.')).toBeInTheDocument();
    expect(within(linha).queryByText(/Não foi possível copiar/)).not.toBeInTheDocument();
  });

  it('se a cópia falhar, pede para anotar a senha manualmente', async () => {
    const { u, linha } = await comSenhaNaTela();
    simularClipboard(vi.fn().mockRejectedValue(new Error('negado')));

    await u.click(within(linha).getByRole('button', { name: 'Copiar senha' }));

    expect(await within(linha).findByText('Não foi possível copiar; anote a senha manualmente.')).toBeInTheDocument();
    expect(within(linha).getByText(SENHA)).toBeInTheDocument();
  });

  it('se o navegador não tem área de transferência, mostra o mesmo aviso', async () => {
    const { u, linha } = await comSenhaNaTela();
    simularClipboard(undefined);

    await u.click(within(linha).getByRole('button', { name: 'Copiar senha' }));

    expect(await within(linha).findByText('Não foi possível copiar; anote a senha manualmente.')).toBeInTheDocument();
  });

  it('o resultado da cópia some junto com a senha', async () => {
    const { u, linha } = await comSenhaNaTela();
    simularClipboard(vi.fn().mockResolvedValue(undefined));
    await u.click(within(linha).getByRole('button', { name: 'Copiar senha' }));
    await within(linha).findByText('Senha copiada.');

    await u.click(within(linha).getByRole('button', { name: 'Fechar' }));

    expect(within(linha).queryByText('Senha copiada.')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SENHA);
  });
});

describe('remover mercado', () => {
  it('só chama a API depois de Confirmar remoção; a linha passa a mostrar Removido e perde as ações', async () => {
    const chamadas = simular((c) =>
      c.metodo === 'POST' && c.caminho === '/admin/mercados/1/remover' ? new Response(null, { status: 204 }) : undefined,
    );
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await u.click(within(linha).getByRole('button', { name: 'Remover' }));
    expect(
      within(linha).getByText(
        'Remover este mercado? Os dados são mantidos, mas ele deixa de aparecer no aplicativo.',
      ),
    ).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(0);

    await u.click(within(linha).getByRole('button', { name: 'Confirmar remoção' }));

    await waitFor(() => expect(within(linha).getByText('Removido')).toBeInTheDocument());
    expect(within(linha).queryByText('Ativo')).not.toBeInTheDocument();
    expect(within(linha).queryAllByRole('button')).toHaveLength(0);
    expect(linhaDe('Mercado Central')).toBe(linha); // a linha continua na tabela
    const posts = chamadas.filter((c) => c.metodo === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].caminho).toBe('/admin/mercados/1/remover');
    expect(posts[0].autorizacao).toBe('Bearer tok-123');
    expect(posts[0].corpo).toBeUndefined();
    // as demais linhas ficam como estavam
    expect(within(linhaDe('Empório Sul')).getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mercados' })).toBeInTheDocument();
  });

  it('Cancelar desiste sem chamar a API', async () => {
    const chamadas = simular();
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await u.click(within(linha).getByRole('button', { name: 'Remover' }));
    await u.click(within(linha).getByRole('button', { name: 'Cancelar' }));

    expect(within(linha).queryByRole('button', { name: 'Confirmar remoção' })).not.toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Remover' })).toHaveFocus();
    expect(within(linha).getByText('Ativo')).toBeInTheDocument();
    expect(chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(0);
  });

  it('404 mostra a mensagem na linha e a linha segue ativa', async () => {
    simular((c) => (c.metodo === 'POST' ? resposta({ erro: 'Mercado não encontrado' }, 404) : undefined));
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await u.click(within(linha).getByRole('button', { name: 'Remover' }));
    await u.click(within(linha).getByRole('button', { name: 'Confirmar remoção' }));

    expect(await within(linha).findByRole('alert')).toHaveTextContent('Mercado não encontrado');
    expect(within(linha).getByText('Ativo')).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Confirmar remoção' })).toBeEnabled();
  });

  it('401 ao remover limpa a sessão e volta para o login', async () => {
    simular((c) => (c.metodo === 'POST' ? resposta({ erro: 'Sessão expirada' }, 401) : undefined));
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await u.click(within(linha).getByRole('button', { name: 'Remover' }));
    await u.click(within(linha).getByRole('button', { name: 'Confirmar remoção' }));

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('bolso-certo:sessao')).toBeNull();
  });

  it('com a remoção em andamento os botões da linha ficam desligados', async () => {
    let liberar: (r: Response) => void = () => {};
    simular((c) => (c.metodo === 'POST' ? new Promise<Response>((ok) => (liberar = ok)) : undefined));
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await u.click(within(linha).getByRole('button', { name: 'Remover' }));
    await u.click(within(linha).getByRole('button', { name: 'Confirmar remoção' }));

    await waitFor(() => expect(within(linha).getByRole('button', { name: 'Confirmar remoção' })).toBeDisabled());
    expect(within(linha).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(within(linha).getByRole('button', { name: 'Criar acesso' })).toBeDisabled();

    liberar(new Response(null, { status: 204 }));
    await waitFor(() => expect(within(linha).getByText('Removido')).toBeInTheDocument());
  });
});

describe('linhas independentes', () => {
  it('criar acesso numa linha e confirmar remoção em outra deixa as duas consistentes', async () => {
    simular((c) => {
      if (c.caminho === '/admin/mercados/1/acesso') return resposta({ senhaTemporaria: SENHA }, 201);
      if (c.caminho === '/admin/mercados/4/remover') return new Response(null, { status: 204 });
      return undefined;
    });
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const central1 = linhaDe('Mercado Central');
    const emporio4 = linhaDe('Empório Sul');

    await u.click(within(emporio4).getByRole('button', { name: 'Remover' })); // confirmação aberta em 4
    await criarAcessoNaLinha(u, central1); // acesso criado em 1
    expect(await within(central1).findByText(SENHA)).toBeInTheDocument();
    expect(within(emporio4).getByRole('button', { name: 'Confirmar remoção' })).toBeInTheDocument();

    await u.click(within(emporio4).getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => expect(within(emporio4).getByText('Removido')).toBeInTheDocument());

    // a senha da linha 1 continua à mostra e a linha 1 continua ativa
    expect(within(central1).getByText(SENHA)).toBeInTheDocument();
    expect(within(central1).getByText('Ativo')).toBeInTheDocument();
    expect(within(emporio4).queryByText(SENHA)).not.toBeInTheDocument();

    await u.click(within(central1).getByRole('button', { name: 'Fechar' }));
    expect(document.body.textContent).not.toContain(SENHA);
    expect(within(central1).getByText('Já tem acesso')).toBeInTheDocument();
    expect(within(emporio4).getByText('Removido')).toBeInTheDocument();
    expect(within(emporio4).queryAllByRole('button')).toHaveLength(0);
  });

  it('remover um mercado com o formulário de acesso aberto esconde o formulário', async () => {
    simular((c) => (c.caminho === '/admin/mercados/1/remover' ? new Response(null, { status: 204 }) : undefined));
    abrir('/admin/mercados');
    await screen.findByText('Mercado Central');
    const u = userEvent.setup();
    const linha = linhaDe('Mercado Central');

    await u.click(within(linha).getByRole('button', { name: 'Criar acesso' }));
    await u.click(within(linha).getByRole('button', { name: 'Remover' }));
    await u.click(within(linha).getByRole('button', { name: 'Confirmar remoção' }));

    await waitFor(() => expect(within(linha).getByText('Removido')).toBeInTheDocument());
    expect(within(linha).queryByLabelText('E-mail do mercado')).not.toBeInTheDocument();
    expect(within(linha).queryAllByRole('button')).toHaveLength(0);
  });
});
