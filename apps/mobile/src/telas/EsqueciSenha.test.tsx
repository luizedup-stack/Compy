import { screen, userEvent } from '@testing-library/react-native';

import { abrirApp, lerCofre, simularApi } from '../teste/ajudas';

const TOKEN = 'b'.repeat(64);

describe('EsqueciSenha', () => {
  async function abrirTela() {
    const user = userEvent.setup();
    await abrirApp();
    await user.press(screen.getByRole('link', { name: 'Esqueci minha senha' }));
    await screen.findByRole('button', { name: 'Enviar código' });
    return user;
  }

  it('recusa e-mail inválido sem fazer requisição', async () => {
    const api = simularApi({});
    const user = await abrirTela();
    await user.type(screen.getByLabelText('E-mail'), 'sem-arroba');
    await user.press(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByText('E-mail inválido')).toBeOnTheScreen();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('pede o código e depois redefine a senha, voltando para Entrar com o aviso', async () => {
    const api = simularApi({
      'POST /auth/esqueci-senha': { status: 204 },
      'POST /auth/redefinir-senha': { status: 204 },
    });
    const user = await abrirTela();

    await user.type(screen.getByLabelText('E-mail'), ' ana@exemplo.com ');
    await user.press(screen.getByRole('button', { name: 'Enviar código' }));

    expect(await screen.findByText('Se esse e-mail estiver cadastrado, enviamos um código.')).toBeOnTheScreen();
    expect(api.chamadas[0]).toMatchObject({ caminho: '/auth/esqueci-senha', corpo: { email: 'ana@exemplo.com' } });

    await user.paste(screen.getByLabelText('Código recebido por e-mail'), ` ${TOKEN}\n`);
    await user.type(screen.getByLabelText('Nova senha'), 'nova-senha-1');
    await user.press(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(await screen.findByText('Senha alterada. Entre com a nova senha.')).toBeOnTheScreen();
    expect(api.chamadas[1]).toMatchObject({
      caminho: '/auth/redefinir-senha',
      corpo: { token: TOKEN, senha: 'nova-senha-1' },
      autorizacao: null,
    });
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    expect(lerCofre().size).toBe(0);
  });

  it('recusa nova senha com menos de 8 caracteres sem fazer requisição', async () => {
    const api = simularApi({ 'POST /auth/esqueci-senha': { status: 204 } });
    const user = await abrirTela();
    await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
    await user.press(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByLabelText('Nova senha');

    await user.type(screen.getByLabelText('Código recebido por e-mail'), TOKEN);
    await user.type(screen.getByLabelText('Nova senha'), '1234567');
    await user.press(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(await screen.findByText('A senha precisa de pelo menos 8 caracteres')).toBeOnTheScreen();
    expect(api.chamadas).toHaveLength(1);
  });

  it('mostra o erro do servidor quando o código é inválido', async () => {
    simularApi({
      'POST /auth/esqueci-senha': { status: 204 },
      'POST /auth/redefinir-senha': { status: 400, corpo: { erro: 'Código inválido ou expirado' } },
    });
    const user = await abrirTela();
    await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
    await user.press(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByLabelText('Nova senha');

    await user.type(screen.getByLabelText('Código recebido por e-mail'), 'errado');
    await user.type(screen.getByLabelText('Nova senha'), 'nova-senha-1');
    await user.press(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(await screen.findByText('Código inválido ou expirado')).toBeOnTheScreen();
    expect(screen.queryByText('Senha alterada. Entre com a nova senha.')).not.toBeOnTheScreen();
  });
});
