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
  await usuario.type(screen.getByLabelText('Nome do mercado'), '  Mercado Bom Preço ');
  await usuario.type(screen.getByLabelText('Endereço'), 'Rua dos Ipês, 120 - Vila Sônia');
  await usuario.type(screen.getByLabelText('E-mail'), ' dono@exemplo.com ');
  await usuario.type(screen.getByLabelText('Senha (mínimo de 8 caracteres)'), extra.senha ?? 'senha-boa-123');
  await usuario.type(screen.getByLabelText('Repita a senha'), extra.repetir ?? 'senha-boa-123');
}

describe('cadastro do mercado', () => {
  it('a tela de entrar tem o link "Cadastrar meu mercado"', () => {
    abrir('/entrar');
    expect(screen.getByRole('link', { name: 'Cadastrar meu mercado' })).toHaveAttribute('href', '/cadastrar');
  });

  it('envia os dados sem espaços e sem Bearer e segue para a confirmação do e-mail', async () => {
    comSessao(); // mesmo com sessão guardada, a chamada é pública
    const chamadas = simularApi(() => resposta({ id: 1, email: 'dono@exemplo.com', papel: 'mercado', mercadoId: 1 }, 201));
    abrir('/cadastrar');
    const usuario = userEvent.setup();
    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mercado' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Confirmar e-mail' })).toBeInTheDocument();
    expect(chamadas).toEqual([
      {
        metodo: 'POST',
        caminho: '/auth/cadastro-mercado',
        corpo: { nome: 'Mercado Bom Preço', endereco: 'Rua dos Ipês, 120 - Vila Sônia', email: 'dono@exemplo.com', senha: 'senha-boa-123' },
        autorizacao: undefined,
      },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Enviamos um código para dono@exemplo.com');
  });

  it('senha curta e senhas diferentes são recusadas sem chamar o servidor', async () => {
    abrir('/cadastrar');
    const usuario = userEvent.setup();
    await preencher(usuario, { senha: 'curta', repetir: 'curta' });
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mercado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A senha precisa de pelo menos 8 caracteres');

    await usuario.clear(screen.getByLabelText('Senha (mínimo de 8 caracteres)'));
    await usuario.type(screen.getByLabelText('Senha (mínimo de 8 caracteres)'), 'senha-boa-123');
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mercado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não são iguais');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mostra o erro do servidor (e-mail já cadastrado) e fica na tela', async () => {
    simularApi(() => resposta({ erro: 'E-mail já cadastrado' }, 409));
    abrir('/cadastrar');
    const usuario = userEvent.setup();
    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mercado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail já cadastrado');
    expect(screen.getByRole('heading', { level: 1, name: 'Cadastrar meu mercado' })).toBeInTheDocument();
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
