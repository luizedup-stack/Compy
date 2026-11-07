import { screen, userEvent } from '@testing-library/react-native';

import { CHAVE_SESSAO } from '../sessao';
import { abrirApp, lerCofre, simularApi } from '../teste/ajudas';

async function preencher(user: ReturnType<typeof userEvent.setup>, email: string, senha: string) {
  await user.type(screen.getByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), senha);
}

describe('Entrar', () => {
  it('a tela de entrada oferece Criar conta e Esqueci minha senha', async () => {
    simularApi({});
    await abrirApp('Entrar');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toBeOnTheScreen();
  });

  it('mostra o texto do servidor quando as credenciais estão erradas', async () => {
    simularApi({ 'POST /auth/login': { status: 401, corpo: { erro: 'E-mail ou senha incorretos' } } });
    const user = userEvent.setup();
    await abrirApp('Entrar');
    await preencher(user, 'ana@exemplo.com', 'senha-errada');
    await user.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha incorretos')).toBeOnTheScreen();
    expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
  });

  it('rejeita papel diferente de cliente e não guarda nada', async () => {
    simularApi({ 'POST /auth/login': { status: 200, corpo: { token: 'tok-m', papel: 'mercado', emailVerificado: true } } });
    const user = userEvent.setup();
    await abrirApp('Entrar');
    await preencher(user, 'loja@exemplo.com', '12345678');
    await user.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Esta área é para clientes. Mercados usam o painel na web.')).toBeOnTheScreen();
    expect(lerCofre().size).toBe(0);
    expect(screen.queryByLabelText('Buscar produto')).not.toBeOnTheScreen();
  });

  it('guarda a sessão no cofre e abre a aba Conta já com a conta quando o login dá certo', async () => {
    const api = simularApi({
      'POST /auth/login': { status: 200, corpo: { token: 'tok-ok', papel: 'cliente', emailVerificado: true } },
    });
    const user = userEvent.setup();
    await abrirApp('Entrar');
    await preencher(user, 'ana@exemplo.com', '12345678');
    await user.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByTestId('tela-conta')).toBeOnTheScreen();
    expect(api.chamadas[0].corpo).toEqual({ email: 'ana@exemplo.com', senha: '12345678' });
    expect(JSON.parse(lerCofre().get(CHAVE_SESSAO) as string)).toEqual({ token: 'tok-ok', emailVerificado: true });
  });

  it('abre a tela de senha esquecida pelo link', async () => {
    simularApi({});
    const user = userEvent.setup();
    await abrirApp('Entrar');
    await user.press(screen.getByRole('link', { name: 'Esqueci minha senha' }));
    expect(await screen.findByRole('button', { name: 'Enviar código' })).toBeOnTheScreen();
  });
});
