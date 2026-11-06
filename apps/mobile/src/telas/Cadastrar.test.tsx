import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import { URL_API } from '../api';
import { CHAVE_SESSAO } from '../sessao';
import { abrirApp, lerCofre, simularApi } from '../teste/ajudas';

const POLITICA = 'Li e aceito a política de privacidade';

async function preencher(user: ReturnType<typeof userEvent.setup>, email: string, senha: string, repetir = senha) {
  await user.type(screen.getByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), senha);
  await user.type(screen.getByLabelText('Repita a senha'), repetir);
}

async function aceitarPolitica() {
  await fireEvent(screen.getByLabelText(POLITICA), 'valueChange', true);
}

describe('Cadastrar', () => {
  it('mantém "Criar conta" desabilitado até aceitar a política', async () => {
    simularApi({});
    await abrirApp('Cadastrar');
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeDisabled();

    await aceitarPolitica();
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled();
  });

  it('abre a política de privacidade da API pelo expo-linking', async () => {
    simularApi({});
    const user = userEvent.setup();
    await abrirApp('Cadastrar');
    await user.press(screen.getByRole('link', { name: 'Ler a política' }));
    expect(Linking.openURL).toHaveBeenCalledWith(`${URL_API}/privacidade`);
  });

  it('recusa senha de 7 caracteres sem fazer requisição', async () => {
    const api = simularApi({});
    const user = userEvent.setup();
    await abrirApp('Cadastrar');
    await preencher(user, 'ana@exemplo.com', '1234567');
    await aceitarPolitica();
    await user.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('A senha precisa de pelo menos 8 caracteres')).toBeOnTheScreen();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('recusa senhas diferentes sem fazer requisição', async () => {
    const api = simularApi({});
    const user = userEvent.setup();
    await abrirApp('Cadastrar');
    await preencher(user, 'ana@exemplo.com', '12345678', '12345679');
    await aceitarPolitica();
    await user.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('As senhas não são iguais')).toBeOnTheScreen();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('recusa e-mail inválido sem fazer requisição', async () => {
    const api = simularApi({});
    const user = userEvent.setup();
    await abrirApp('Cadastrar');
    await preencher(user, 'ana-sem-arroba', '12345678');
    await aceitarPolitica();
    await user.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('E-mail inválido')).toBeOnTheScreen();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('mostra "Esse e-mail já está cadastrado" quando a API responde 409', async () => {
    const api = simularApi({ 'POST /auth/cadastro': { status: 409, corpo: { erro: 'E-mail já cadastrado' } } });
    const user = userEvent.setup();
    await abrirApp('Cadastrar');
    await preencher(user, 'ana@exemplo.com', '12345678');
    await aceitarPolitica();
    await user.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Esse e-mail já está cadastrado')).toBeOnTheScreen();
    expect(api.chamadas.map((c) => c.caminho)).toEqual(['/auth/cadastro']);
    expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
  });

  it('cadastra, entra automaticamente e chega à busca', async () => {
    const api = simularApi({
      'POST /auth/cadastro': { status: 201, corpo: { id: 1, email: 'ana@exemplo.com', papel: 'cliente' } },
      'POST /auth/login': { status: 200, corpo: { token: 'tok-1', papel: 'cliente', emailVerificado: false } },
    });
    const user = userEvent.setup();
    await abrirApp('Cadastrar');
    await preencher(user, ' ana@exemplo.com ', '12345678');
    await aceitarPolitica();
    await user.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByLabelText('Buscar produto')).toBeOnTheScreen();
    expect(api.chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['POST /auth/cadastro', 'POST /auth/login']);
    expect(api.chamadas[0].corpo).toEqual({ email: 'ana@exemplo.com', senha: '12345678' });
    expect(api.chamadas[1].corpo).toEqual({ email: 'ana@exemplo.com', senha: '12345678' });
    expect(JSON.parse(lerCofre().get(CHAVE_SESSAO) as string)).toEqual({ token: 'tok-1', emailVerificado: false });
  });
});
