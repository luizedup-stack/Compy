// Testes do cadastro da conta do mercado (só e-mail e senha, sem confirmação de e-mail).
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
  it('a tela de entrar tem o link "Cadastrar meu comércio"', () => {
    abrir('/entrar');
    expect(screen.getByRole('link', { name: 'Cadastrar meu comércio' })).toHaveAttribute('href', '/cadastrar');
  });

  it('não pede nome nem endereço do mercado (isso fica em "Meu comércio")', () => {
    abrir('/cadastrar');
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do comércio')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Endereço')).not.toBeInTheDocument();
  });

  it('envia só e-mail e senha (sem espaços e sem Bearer) e volta para entrar com o aviso de conta criada', async () => {
    comSessao(); // mesmo com sessão guardada, a chamada é pública
    const chamadas = simularApi(() => resposta({ id: 1, email: 'dono@exemplo.com', papel: 'mercado' }, 201));
    abrir('/cadastrar');
    const usuario = userEvent.setup();
    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Conta criada. Entre com o seu e-mail e a senha.');
    expect(chamadas).toEqual([
      { metodo: 'POST', caminho: '/auth/cadastro-mercado', corpo: { email: 'dono@exemplo.com', senha: 'senha-boa-123' }, autorizacao: undefined },
    ]);
  });

  it('não existe mais a etapa de confirmar o e-mail', () => {
    abrir('/confirmar-email'); // rota que não existe mais: cai na tela inicial (que pede para entrar)
    expect(screen.queryByRole('heading', { level: 1, name: 'Confirmar e-mail' })).not.toBeInTheDocument();
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
