// Testes do cadastro da conta do mercado (só e-mail e senha), da confirmação do e-mail e do reenvio do código.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, resposta, simularApi } from './ajudantesTeste';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function preencher(usuario: ReturnType<typeof userEvent.setup>, extra: { senha?: string; repetir?: string } = {}) {
  await usuario.type(screen.getByLabelText('E-mail'), ' dono@exemplo.com ');
  await usuario.type(screen.getByLabelText('Senha (mínimo de 8 caracteres)'), extra.senha ?? 'senha-boa-123');
  await usuario.type(screen.getByLabelText('Repita a senha'), extra.repetir ?? 'senha-boa-123');
}

describe('criar conta (só e-mail e senha)', () => {
  it('a tela de entrar tem o link "Cadastrar meu mercado"', () => {
    abrir('/entrar');
    expect(screen.getByRole('link', { name: 'Cadastrar meu mercado' })).toHaveAttribute('href', '/cadastrar');
  });

  it('não pede nome nem endereço do mercado (isso fica em "Meu mercado")', () => {
    abrir('/cadastrar');
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do mercado')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Endereço')).not.toBeInTheDocument();
  });

  it('envia só e-mail e senha (sem espaços e sem Bearer) e segue para a confirmação do e-mail', async () => {
    comSessao(); // mesmo com sessão guardada, a chamada é pública
    const chamadas = simularApi(() => resposta({ id: 1, email: 'dono@exemplo.com', papel: 'mercado', emailEnviado: true }, 201));
    abrir('/cadastrar');
    const usuario = userEvent.setup();
    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Confirmar e-mail' })).toBeInTheDocument();
    expect(chamadas).toEqual([
      { metodo: 'POST', caminho: '/auth/cadastro-mercado', corpo: { email: 'dono@exemplo.com', senha: 'senha-boa-123' }, autorizacao: undefined },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Enviamos um código para dono@exemplo.com');
  });

  it('se o servidor avisa que o e-mail não saiu, a tela seguinte explica onde achar o código', async () => {
    simularApi(() => resposta({ id: 1, email: 'dono@exemplo.com', papel: 'mercado', emailEnviado: false }, 201));
    abrir('/cadastrar');
    const usuario = userEvent.setup();
    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('status')).toHaveTextContent('não foi possível enviar o e-mail');
    expect(screen.getByRole('status')).toHaveTextContent('Códigos de e-mail');
  });

  it('senha curta e senhas diferentes são recusadas sem chamar o servidor', async () => {
    abrir('/cadastrar');
    const usuario = userEvent.setup();
    await preencher(usuario, { senha: 'curta', repetir: 'curta' });
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A senha precisa de pelo menos 8 caracteres');

    await usuario.clear(screen.getByLabelText('Senha (mínimo de 8 caracteres)'));
    await usuario.type(screen.getByLabelText('Senha (mínimo de 8 caracteres)'), 'senha-boa-123');
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não são iguais');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mostra o erro do servidor (e-mail já cadastrado) e fica na tela', async () => {
    simularApi(() => resposta({ erro: 'E-mail já cadastrado' }, 409));
    abrir('/cadastrar');
    const usuario = userEvent.setup();
    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail já cadastrado');
    expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeInTheDocument();
  });
});

describe('confirmar e-mail', () => {
  it('envia o código sem espaços e volta para entrar com o aviso', async () => {
    const chamadas = simularApi(() => resposta(null, 204));
    abrir('/confirmar-email');
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Código recebido por e-mail'), ' abc 123\n def ');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e-mail' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('E-mail confirmado. Entre com a sua conta.');
    expect(chamadas).toEqual([
      { metodo: 'POST', caminho: '/auth/verificar-email', corpo: { token: 'abc123def' }, autorizacao: undefined },
    ]);
  });

  it('código vazio é recusado; código errado mostra o erro do servidor', async () => {
    simularApi(() => resposta({ erro: 'Código inválido ou expirado' }, 400));
    abrir('/confirmar-email');
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e-mail' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o código');
    expect(fetchMock).not.toHaveBeenCalled();

    await usuario.type(screen.getByLabelText('Código recebido por e-mail'), 'errado');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e-mail' }));
    expect(await screen.findByText('Código inválido ou expirado')).toBeInTheDocument();
  });
});

describe('reenviar o código (o e-mail não chegou)', () => {
  it('"Reenviar código" pede outro código para o e-mail informado e avisa', async () => {
    const chamadas = simularApi(() => resposta(null, 204));
    abrir('/confirmar-email');
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Seu e-mail'), 'dono@exemplo.com');
    await usuario.click(screen.getByRole('button', { name: 'Reenviar código' }));

    expect(await screen.findByText(/enviamos um novo código/)).toBeInTheDocument();
    expect(chamadas).toEqual([
      { metodo: 'POST', caminho: '/auth/reenviar-codigo', corpo: { email: 'dono@exemplo.com' }, autorizacao: undefined },
    ]);
  });

  it('sem e-mail preenchido, pede o e-mail e não chama o servidor', async () => {
    abrir('/confirmar-email');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reenviar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o seu e-mail');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
