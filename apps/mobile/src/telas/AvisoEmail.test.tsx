import { screen, userEvent } from '@testing-library/react-native';

import { CHAVE_SESSAO } from '../sessao';
import { abrirApp, guardarSessao, lerCofre, simularApi } from '../teste/ajudas';

const AVISO = 'Confirme seu e-mail para garantir o acesso à sua conta.';
const TOKEN = 'a'.repeat(64);

describe('AvisoEmail', () => {
  it('aparece na busca só enquanto o e-mail não está verificado', async () => {
    simularApi({});
    guardarSessao('tok-1', false);
    await abrirApp();
    expect(screen.getByLabelText('Buscar produto')).toBeOnTheScreen();
    expect(screen.getByText(AVISO)).toBeOnTheScreen();
  });

  it('não aparece quando o e-mail já foi verificado', async () => {
    simularApi({});
    guardarSessao('tok-1', true);
    await abrirApp();
    expect(screen.getByLabelText('Buscar produto')).toBeOnTheScreen();
    expect(screen.queryByText(AVISO)).not.toBeOnTheScreen();
  });

  it('"Reenviar e-mail" chama a API com o token e confirma ao usuário', async () => {
    const api = simularApi({ 'POST /auth/reenviar-verificacao': { status: 204 } });
    guardarSessao('tok-reenvio', false);
    const user = userEvent.setup();
    await abrirApp();
    await user.press(screen.getByRole('button', { name: 'Reenviar e-mail' }));

    expect(await screen.findByText('E-mail reenviado.')).toBeOnTheScreen();
    expect(api.chamadas).toHaveLength(1);
    expect(api.chamadas[0]).toMatchObject({
      metodo: 'POST',
      caminho: '/auth/reenviar-verificacao',
      autorizacao: 'Bearer tok-reenvio',
    });
    // O aviso não bloqueia: a busca continua na tela.
    expect(screen.getByLabelText('Buscar produto')).toBeOnTheScreen();
  });

  it('mostra o erro do servidor se o reenvio falhar', async () => {
    simularApi({ 'POST /auth/reenviar-verificacao': { status: 500, corpo: { erro: 'Falha ao enviar' } } });
    guardarSessao('tok-reenvio', false);
    const user = userEvent.setup();
    await abrirApp();
    await user.press(screen.getByRole('button', { name: 'Reenviar e-mail' }));
    expect(await screen.findByText('Falha ao enviar')).toBeOnTheScreen();
    expect(screen.queryByText('E-mail reenviado.')).not.toBeOnTheScreen();
  });
});

describe('VerificarEmail', () => {
  async function abrirVerificacao() {
    guardarSessao('tok-ver', false);
    const user = userEvent.setup();
    await abrirApp();
    await user.press(screen.getByRole('button', { name: 'Já tenho o código' }));
    await screen.findByLabelText('Código recebido por e-mail');
    return user;
  }

  it('confirma o código (sem espaços) e some o aviso da busca', async () => {
    const api = simularApi({ 'POST /auth/verificar-email': { status: 204 } });
    const user = await abrirVerificacao();

    await user.paste(screen.getByLabelText('Código recebido por e-mail'), `  ${TOKEN.slice(0, 32)}\n${TOKEN.slice(32)} \n`);
    await user.press(screen.getByRole('button', { name: 'Confirmar e-mail' }));

    expect(await screen.findByText('E-mail confirmado.')).toBeOnTheScreen();
    expect(api.chamadas[0]).toMatchObject({
      caminho: '/auth/verificar-email',
      corpo: { token: TOKEN },
    });
    expect(JSON.parse(lerCofre().get(CHAVE_SESSAO) as string)).toEqual({ token: 'tok-ver', emailVerificado: true });

    await user.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(await screen.findByLabelText('Buscar produto')).toBeOnTheScreen();
    expect(screen.queryByText(AVISO)).not.toBeOnTheScreen();
  });

  it('mostra o erro do servidor para um código inválido e mantém o aviso', async () => {
    simularApi({ 'POST /auth/verificar-email': { status: 400, corpo: { erro: 'Código inválido ou expirado' } } });
    const user = await abrirVerificacao();

    await user.type(screen.getByLabelText('Código recebido por e-mail'), 'codigo-errado');
    await user.press(screen.getByRole('button', { name: 'Confirmar e-mail' }));

    expect(await screen.findByText('Código inválido ou expirado')).toBeOnTheScreen();
    expect(screen.queryByText('E-mail confirmado.')).not.toBeOnTheScreen();
    expect(JSON.parse(lerCofre().get(CHAVE_SESSAO) as string).emailVerificado).toBe(false);
  });

  it('não envia quando o código está vazio', async () => {
    const api = simularApi({});
    const user = await abrirVerificacao();
    await user.press(screen.getByRole('button', { name: 'Confirmar e-mail' }));
    expect(await screen.findByText('Informe o código')).toBeOnTheScreen();
    expect(api.fetch).not.toHaveBeenCalled();
  });
});
