import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { abrir, comSessao, fetchMock, resposta, simularApi } from './ajudantesTeste';

const MSG_CODIGO_ENVIADO = 'Se esse e-mail estiver cadastrado, enviamos um código.';
const MSG_SENHA_ALTERADA = 'Senha alterada. Entre com a nova senha.';
const CODIGO = 'a1b2c3d4e5f6';

let erroConsole: MockInstance;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  erroConsole = vi.spyOn(console, 'error');
});

afterEach(() => {
  // Nenhum aviso de act() nem de atualização depois de desmontar.
  expect(erroConsole).not.toHaveBeenCalled();
  erroConsole.mockRestore();
  vi.unstubAllGlobals();
});

/** Faz a etapa 1 e espera a etapa 2 aparecer. */
async function irParaEtapa2(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText('E-mail'), '  mercado@exemplo.com ');
  await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));
  await screen.findByRole('heading', { level: 1, name: 'Nova senha' });
}

describe('link no login', () => {
  it('a tela de entrar tem "Esqueci minha senha", que leva a /esqueci-senha', async () => {
    abrir('/entrar');
    const link = screen.getByRole('link', { name: 'Esqueci minha senha' });
    expect(link).toHaveAttribute('href', '/esqueci-senha');
    await userEvent.setup().click(link);
    expect(screen.getByRole('heading', { level: 1, name: 'Esqueci minha senha' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('etapa 1: pedir o código', () => {
  it('envia só { email } (sem espaços e sem Bearer) e mostra a mensagem fixa', async () => {
    comSessao(); // mesmo com sessão guardada, a chamada é pública
    const chamadas = simularApi(() => resposta(null, 204));
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await irParaEtapa2(usuario);

    expect(chamadas).toEqual([
      { metodo: 'POST', caminho: '/auth/esqueci-senha', corpo: { email: 'mercado@exemplo.com' }, autorizacao: undefined },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent(MSG_CODIGO_ENVIADO);
    expect(screen.getByRole('heading', { level: 1, name: 'Nova senha' })).toHaveFocus();
    expect(screen.getByLabelText('Código recebido por e-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova senha')).toBeInTheDocument();
  });

  it('erro do servidor aparece num alerta e a tela fica na etapa 1', async () => {
    simularApi(() => resposta({ erro: 'E-mail inválido' }, 400));
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('E-mail'), 'mercado@exemplo.com');
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail inválido');
    expect(screen.getByRole('heading', { level: 1, name: 'Esqueci minha senha' })).toBeInTheDocument();
  });

  it('o botão mostra "Enviando…" e fica desligado enquanto espera', async () => {
    let liberar: (r: Response) => void = () => {};
    simularApi(() => new Promise<Response>((r) => (liberar = r)));
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('E-mail'), 'mercado@exemplo.com');
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    liberar(resposta(null, 204));
    await screen.findByRole('heading', { level: 1, name: 'Nova senha' });
  });
});

describe('etapa 2: redefinir', () => {
  it('envia exatamente { token, senha }, com o código sem espaços, e volta ao login com a mensagem', async () => {
    const chamadas = simularApi(() => resposta(null, 204));
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await irParaEtapa2(usuario);

    await usuario.type(screen.getByLabelText('Código recebido por e-mail'), ` ${CODIGO.slice(0, 6)} ${CODIGO.slice(6)} `);
    await usuario.type(screen.getByLabelText('Nova senha'), 'senha-nova-123');
    await usuario.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
    expect(chamadas[1]).toEqual({
      metodo: 'POST',
      caminho: '/auth/redefinir-senha',
      corpo: { token: CODIGO, senha: 'senha-nova-123' },
      autorizacao: undefined,
    });
    expect(screen.getByRole('status')).toHaveTextContent(MSG_SENHA_ALTERADA);
  });

  it('senha com menos de 8 caracteres é barrada sem chamar o servidor', async () => {
    const chamadas = simularApi(() => resposta(null, 204));
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await irParaEtapa2(usuario);

    await usuario.type(screen.getByLabelText('Código recebido por e-mail'), CODIGO);
    await usuario.type(screen.getByLabelText('Nova senha'), 'curta12');
    await usuario.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(screen.getByRole('alert')).toHaveTextContent('A senha precisa de pelo menos 8 caracteres');
    expect(chamadas).toHaveLength(1);
  });

  it('código vazio é barrado sem chamar o servidor', async () => {
    const chamadas = simularApi(() => resposta(null, 204));
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await irParaEtapa2(usuario);

    await usuario.type(screen.getByLabelText('Código recebido por e-mail'), '   ');
    await usuario.type(screen.getByLabelText('Nova senha'), 'senha-nova-123');
    await usuario.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o código');
    expect(chamadas).toHaveLength(1);
  });

  it('erro 400 do servidor aparece num alerta e a tela continua na etapa 2', async () => {
    simularApi((c) =>
      c.caminho === '/auth/redefinir-senha' ? resposta({ erro: 'Código inválido ou expirado' }, 400) : resposta(null, 204),
    );
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await irParaEtapa2(usuario);

    await usuario.type(screen.getByLabelText('Código recebido por e-mail'), CODIGO);
    await usuario.type(screen.getByLabelText('Nova senha'), 'senha-nova-123');
    await usuario.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado');
    expect(screen.getByRole('heading', { level: 1, name: 'Nova senha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redefinir senha' })).toBeEnabled();
  });

  it('um 401 numa chamada pública não apaga a sessão guardada', async () => {
    comSessao();
    simularApi(() => resposta({ erro: 'Não autenticado' }, 401));
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('E-mail'), 'mercado@exemplo.com');
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não autenticado');
    expect(localStorage.getItem('bolso-certo:sessao')).not.toBeNull();
  });

  it('"Usar outro e-mail" volta para a etapa 1', async () => {
    simularApi(() => resposta(null, 204));
    abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await irParaEtapa2(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Usar outro e-mail' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Esqueci minha senha' })).toHaveFocus();
  });
});

describe('rota pública', () => {
  it('quem está logado pode abrir /esqueci-senha e continua logado', () => {
    comSessao('mercado');
    abrir('/esqueci-senha');

    expect(screen.getByRole('heading', { level: 1, name: 'Esqueci minha senha' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(localStorage.getItem('bolso-certo:sessao')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sair da tela com o pedido em andamento não atualiza nada depois (sem avisos)', async () => {
    let liberar: (r: Response) => void = () => {};
    simularApi(() => new Promise<Response>((r) => (liberar = r)));
    const { unmount } = abrir('/esqueci-senha');
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('E-mail'), 'mercado@exemplo.com');
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));

    unmount();
    liberar(resposta(null, 204));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
  });
});
