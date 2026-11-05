import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const fetchMock = vi.fn();

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function abrir(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>,
  );
}

function comSessao() {
  localStorage.setItem('bolso-certo:sessao', JSON.stringify({ token: 'tok-123', papel: 'mercado' }));
}

const planilha = () =>
  new File(['conteudo'], 'precos.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.restoreAllMocks();
});

describe('login', () => {
  async function entrar(email: string, senha: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('E-mail'), email);
    await user.type(screen.getByLabelText('Senha'), senha);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  it('senha errada mostra a mensagem do servidor e não guarda sessão', async () => {
    fetchMock.mockResolvedValue(resposta({ erro: 'E-mail ou senha incorretos' }, 401));
    abrir('/entrar');
    await entrar('mercado@exemplo.com', 'errada123');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos');
    expect(localStorage.length).toBe(0);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/login$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'mercado@exemplo.com', senha: 'errada123' });
  });

  it('conta de cliente não entra e não guarda sessão', async () => {
    fetchMock.mockResolvedValue(resposta({ token: 't', papel: 'cliente', emailVerificado: true }));
    abrir('/entrar');
    await entrar('cliente@exemplo.com', 'senha1234');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta área é para mercados. Use o aplicativo Bolso Certo.',
    );
    expect(localStorage.length).toBe(0);
    expect(screen.queryByRole('heading', { name: 'Enviar planilha' })).not.toBeInTheDocument();
  });

  it('conta de mercado guarda a sessão e vai para a tela de produtos', async () => {
    fetchMock
      .mockResolvedValueOnce(resposta({ token: 'tok-mercado', papel: 'mercado', emailVerificado: true }))
      .mockResolvedValue(resposta({ itens: [], total: 0 }));
    abrir('/entrar');
    await entrar('mercado@exemplo.com', 'senha1234');

    expect(await screen.findByRole('heading', { level: 1, name: 'Produtos' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('bolso-certo:sessao')!)).toEqual({
      token: 'tok-mercado',
      papel: 'mercado',
    });
  });

  it('falha de rede mostra a mensagem genérica', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    abrir('/entrar');
    await entrar('mercado@exemplo.com', 'senha1234');

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor');
  });
});

describe('proteção da rota', () => {
  it('sem sessão, /planilha redireciona para /entrar', () => {
    abrir('/planilha');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enviar planilha' })).not.toBeInTheDocument();
  });

  it('a rota padrão leva à tela de produtos quando há sessão', () => {
    comSessao();
    abrir('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Produtos' })).toBeInTheDocument();
  });

  it('Sair limpa a sessão e volta para /entrar', async () => {
    comSessao();
    abrir('/planilha');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});

describe('envio de planilha', () => {
  it('o botão Enviar fica desabilitado sem arquivo', () => {
    comSessao();
    abrir('/planilha');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('mostra o relatório com o total e as linhas com problema', async () => {
    comSessao();
    fetchMock.mockResolvedValue(
      resposta({ mercadoId: 1, importadas: 26, mercadoCriado: false, erros: [{ linha: 7, motivo: 'preço inválido' }] }),
    );
    abrir('/planilha');
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Planilha (.xlsx)'), planilha());
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Mercado atualizado');
    expect(status).toHaveTextContent('26 produtos importados');
    expect(screen.getByRole('heading', { name: 'Linhas com problema' })).toBeInTheDocument();
    expect(screen.getByText('Linha 7: preço inválido')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/planilhas$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('arquivo')).toBeInstanceOf(File);
  });

  it('usa o singular para um produto e avisa que o mercado foi criado', async () => {
    comSessao();
    fetchMock.mockResolvedValue(resposta({ mercadoId: 2, importadas: 1, mercadoCriado: true, erros: [] }));
    abrir('/planilha');
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Planilha (.xlsx)'), planilha());
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Mercado criado');
    expect(status).toHaveTextContent('1 produto importado');
    expect(status).not.toHaveTextContent('1 produtos');
    expect(screen.queryByRole('heading', { name: 'Linhas com problema' })).not.toBeInTheDocument();
  });

  it('resposta 422 mostra a mensagem do servidor em um aviso e nada mais', async () => {
    comSessao();
    fetchMock.mockResolvedValue(resposta({ erro: 'A planilha não tem a aba Produtos' }, 422));
    abrir('/planilha');
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Planilha (.xlsx)'), planilha());
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A planilha não tem a aba Produtos');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(localStorage.getItem('bolso-certo:sessao')).not.toBeNull();
  });

  it('resposta 401 limpa a sessão e leva para /entrar', async () => {
    comSessao();
    fetchMock.mockResolvedValue(resposta({ erro: 'Sessão expirada' }, 401));
    abrir('/planilha');
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Planilha (.xlsx)'), planilha());
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });

  it('desabilita o envio enquanto envia', async () => {
    comSessao();
    let concluir!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((res) => (concluir = res)));
    abrir('/planilha');
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Planilha (.xlsx)'), planilha());
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    concluir(resposta({ mercadoId: 1, importadas: 3, mercadoCriado: false, erros: [] }));
    expect(await screen.findByRole('status')).toHaveTextContent('3 produtos importados');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  });
});

describe('planilha-modelo', () => {
  it('baixa o modelo com o token, dispara o download e só revoga o endereço 1 s depois', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    comSessao();
    fetchMock.mockResolvedValue(
      new Response(new Blob(['xlsx']), {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="modelo-bolso-certo.xlsx"' },
      }),
    );
    const criarUrl = vi.fn(() => 'blob:modelo');
    const revogarUrl = vi.fn();
    Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: revogarUrl });
    const baixados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      baixados.push(`${this.download}|${this.href}`);
    });

    abrir('/planilha');
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole('button', { name: 'Baixar planilha-modelo' }));

    await waitFor(() => expect(baixados).toEqual(['modelo-bolso-certo.xlsx|blob:modelo']));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/planilhas\/modelo$/);
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    // Revogar logo depois do clique pode cancelar o download em alguns navegadores (Firefox, Safari).
    expect(revogarUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revogarUrl).toHaveBeenCalledWith('blob:modelo');
    vi.useRealTimers();
  });

  it('falha ao baixar mostra a mensagem do servidor', async () => {
    comSessao();
    fetchMock.mockResolvedValue(resposta({ erro: 'Sem permissão' }, 403));
    abrir('/planilha');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Baixar planilha-modelo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
  });
});
