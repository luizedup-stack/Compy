import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import { URL_API, pedirAutenticado } from '../api';
import { CHAVE_SESSAO } from '../sessao';
import { aba, abrirApp, guardarSessao, lerCofre, simularApi, type RespostaFalsa } from '../teste/ajudas';
import { adiada, semCamposDeTexto } from '../teste/mercados';

const EXCLUIR = { name: 'Excluir minha conta' };
const CONFIRMAR = { name: 'Sim, excluir minha conta' };
const CANCELAR = { name: 'Cancelar' };
const AVISO_EMAIL = 'Confirme seu e-mail para garantir o acesso à sua conta.';

type Rotas = Parameters<typeof simularApi>[0];

async function abrirConta(rotas: Rotas = {}, emailVerificado = true) {
  const api = simularApi(rotas);
  guardarSessao('tok-conta', emailVerificado);
  const user = userEvent.setup();
  await abrirApp();
  await user.press(aba('Conta'));
  return { api, user };
}

function chamadasDelete(api: ReturnType<typeof simularApi>) {
  return api.chamadas.filter((c) => c.metodo === 'DELETE');
}

describe('Conta', () => {
  it('mostra o título "Minha conta", o botão "Sair", o link da política e a seção de exclusão fechada', async () => {
    const { api } = await abrirConta();
    expect(screen.getByRole('header', { name: 'Minha conta' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toBeOnTheScreen();
    expect(screen.getByRole('header', EXCLUIR)).toBeOnTheScreen();
    expect(
      screen.getByText('Isso apaga sua conta e seus dados. Suas buscas passam a ser anônimas. Não dá para desfazer.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', EXCLUIR)).toBeOnTheScreen();
    expect(screen.queryByRole('button', CONFIRMAR)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', CANCELAR)).not.toBeOnTheScreen();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  describe('Sair', () => {
    it('apaga a sessão guardada e volta para Entrar, sem chamar a API', async () => {
      const { api, user } = await abrirConta();
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(true);
      await user.press(screen.getByRole('button', { name: 'Sair' }));

      expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
      expect(screen.queryByText('Conta excluída.')).not.toBeOnTheScreen();
      expect(api.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Política de privacidade', () => {
    it('abre a política da API pelo expo-linking', async () => {
      const { user } = await abrirConta();
      await user.press(screen.getByRole('link', { name: 'Política de privacidade' }));
      expect(Linking.openURL).toHaveBeenCalledTimes(1);
      expect(Linking.openURL).toHaveBeenCalledWith(`${URL_API}/privacidade`);
    });

    it('avisa quando o aparelho não consegue abrir o link', async () => {
      (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('sem navegador'));
      const { user } = await abrirConta();
      await user.press(screen.getByRole('link', { name: 'Política de privacidade' }));
      expect(await screen.findByText('Não foi possível abrir a política de privacidade.')).toBeOnTheScreen();
    });
  });

  describe('Excluir minha conta', () => {
    it('o primeiro botão só abre a confirmação: nenhuma chamada DELETE', async () => {
      const { api, user } = await abrirConta({ 'DELETE /conta': { status: 204 } });
      await user.press(screen.getByRole('button', EXCLUIR));

      expect(screen.getByRole('button', CONFIRMAR)).toBeOnTheScreen();
      expect(screen.getByRole('button', CANCELAR)).toBeOnTheScreen();
      expect(screen.queryByRole('button', EXCLUIR)).not.toBeOnTheScreen();
      expect(api.fetch).not.toHaveBeenCalled();
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(true);
    });

    it('"Cancelar" fecha a confirmação sem chamar a API e deixa abrir de novo', async () => {
      const { api, user } = await abrirConta({ 'DELETE /conta': { status: 204 } });
      await user.press(screen.getByRole('button', EXCLUIR));
      await user.press(screen.getByRole('button', CANCELAR));

      expect(screen.queryByRole('button', CONFIRMAR)).not.toBeOnTheScreen();
      expect(screen.getByRole('button', EXCLUIR)).toBeOnTheScreen();
      expect(api.fetch).not.toHaveBeenCalled();
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(true);

      await user.press(screen.getByRole('button', EXCLUIR));
      expect(screen.getByRole('button', CONFIRMAR)).toBeOnTheScreen();
    });

    it('"Sim, excluir minha conta" chama DELETE /conta com o Bearer, apaga o token e mostra Entrar com o aviso', async () => {
      const { api, user } = await abrirConta({ 'DELETE /conta': { status: 204 } });
      await user.press(screen.getByRole('button', EXCLUIR));
      await user.press(screen.getByRole('button', CONFIRMAR));

      expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
      expect(api.chamadas).toHaveLength(1);
      expect(api.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: '/conta', autorizacao: 'Bearer tok-conta' });
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
      expect(screen.getByText('Conta excluída.')).toBeOnTheScreen();
      expect(screen.queryByText('Minha conta')).not.toBeOnTheScreen();
    });

    it('durante o pedido os dois botões ficam desativados e dois toques rápidos mandam um DELETE só', async () => {
      const espera = adiada<RespostaFalsa>();
      const { api, user } = await abrirConta({ 'DELETE /conta': () => espera.promessa });
      await user.press(screen.getByRole('button', EXCLUIR));

      // Dois toques no mesmo instante, antes de a tela redesenhar o estado "desativado".
      const confirmar = screen.getByRole('button', CONFIRMAR);
      await act(async () => {
        void fireEvent.press(confirmar);
        void fireEvent.press(confirmar);
      });
      expect(chamadasDelete(api)).toHaveLength(1);

      expect(screen.getByRole('button', CONFIRMAR)).toBeDisabled();
      expect(screen.getByRole('button', CANCELAR)).toBeDisabled();
      // Mais um toque com o botão já desativado também não faz nada.
      await user.press(screen.getByRole('button', CONFIRMAR));
      await user.press(screen.getByRole('button', CANCELAR));
      expect(chamadasDelete(api)).toHaveLength(1);
      expect(screen.getByRole('button', CONFIRMAR)).toBeOnTheScreen();

      await act(async () => espera.resolver({ status: 204 }));
      expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
      expect(chamadasDelete(api)).toHaveLength(1);
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
    });

    it('se o servidor recusar: mostra a mensagem, mantém a confirmação aberta, a sessão intacta, e dá para tentar de novo', async () => {
      const rotas: Rotas = { 'DELETE /conta': { status: 500, corpo: { erro: 'Não foi possível excluir a conta' } } };
      const { api, user } = await abrirConta(rotas);
      await user.press(screen.getByRole('button', EXCLUIR));
      await user.press(screen.getByRole('button', CONFIRMAR));

      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent('Não foi possível excluir a conta');
      expect(screen.getByRole('button', CONFIRMAR)).toBeEnabled();
      expect(screen.getByRole('button', CANCELAR)).toBeEnabled();
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(true);
      expect(screen.getByRole('button', { name: 'Sair' })).toBeOnTheScreen();

      rotas['DELETE /conta'] = { status: 204 };
      await user.press(screen.getByRole('button', CONFIRMAR));
      expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
      expect(chamadasDelete(api)).toHaveLength(2);
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
    });

    it('sem rede: mostra a mensagem de falta de servidor e mantém a confirmação aberta', async () => {
      const { user } = await abrirConta({});
      await user.press(screen.getByRole('button', EXCLUIR));
      await user.press(screen.getByRole('button', CONFIRMAR));

      expect(await screen.findByText('Não foi possível falar com o servidor')).toBeOnTheScreen();
      expect(screen.getByRole('button', CONFIRMAR)).toBeEnabled();
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(true);
    });

    it('"Cancelar" depois de um erro fecha a confirmação e some com a mensagem', async () => {
      const { user } = await abrirConta({ 'DELETE /conta': { status: 500, corpo: { erro: 'Falha ao excluir' } } });
      await user.press(screen.getByRole('button', EXCLUIR));
      await user.press(screen.getByRole('button', CONFIRMAR));
      await screen.findByText('Falha ao excluir');

      await user.press(screen.getByRole('button', CANCELAR));
      expect(screen.queryByText('Falha ao excluir')).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', CONFIRMAR)).not.toBeOnTheScreen();
    });

    it('401 (token já inválido) encerra a sessão e volta para Entrar', async () => {
      const { user } = await abrirConta({ 'DELETE /conta': { status: 401, corpo: { erro: 'Sessão expirada' } } });
      await user.press(screen.getByRole('button', EXCLUIR));
      await user.press(screen.getByRole('button', CONFIRMAR));

      expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
      expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
    });

    it('uma resposta que chega depois de a tela sair não gera aviso do React', async () => {
      const espera = adiada<RespostaFalsa>();
      const erros = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { user } = await abrirConta({
        'DELETE /conta': () => espera.promessa,
        'GET /outra': { status: 401, corpo: { erro: 'Sessão expirada' } },
      });
      await user.press(screen.getByRole('button', EXCLUIR));
      await user.press(screen.getByRole('button', CONFIRMAR));
      // Enquanto o pedido corre, a sessão acaba por outro caminho (ex.: outra chamada recebeu 401).
      await act(async () => {
        await pedirAutenticado('/outra').catch(() => undefined);
      });
      expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();

      await act(async () => espera.resolver({ status: 500, corpo: { erro: 'Falha tardia' } }));
      expect(screen.queryByText('Falha tardia')).not.toBeOnTheScreen();
      expect(erros).not.toHaveBeenCalled();
      erros.mockRestore();
    });
  });

  it('não há faixa de confirmação de e-mail em nenhuma aba, mesmo com o e-mail não confirmado', async () => {
    const { user } = await abrirConta({ 'GET /mercados': { status: 200, corpo: [] } }, false);
    expect(screen.queryByText(AVISO_EMAIL)).not.toBeOnTheScreen(); // aba Conta
    await user.press(aba('Mercados'));
    expect(screen.queryByText(AVISO_EMAIL)).not.toBeOnTheScreen(); // aba Mercados
    await user.press(aba('Buscar'));
    expect(screen.queryByText(AVISO_EMAIL)).not.toBeOnTheScreen(); // aba Buscar
  });

  it('sem faixa quando o e-mail já foi confirmado', async () => {
    await abrirConta({}, true);
    expect(screen.queryByText(AVISO_EMAIL)).not.toBeOnTheScreen();
  });

  it('tem o perfil editável (foto, nome de usuário, e-mail e senha) além de Sair e Excluir minha conta', async () => {
    await abrirConta();
    expect(await screen.findByLabelText('Nome de usuário')).toBeOnTheScreen();
    expect(screen.getByLabelText('E-mail')).toHaveProp('value', 'teste@exemplo.com');
    const botoes = screen.getAllByRole('button').map((el) => el.props.accessibilityLabel);
    for (const nome of ['Trocar foto', 'Salvar alterações', 'Trocar senha', 'Sair', 'Excluir minha conta']) {
      expect(botoes).toContain(nome);
    }
  });
});
