import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Pressable, Text } from 'react-native';

import { pedirAutenticado } from './api';
import { CHAVE_SESSAO, SessaoProvider, useSessao } from './sessao';
import { guardarSessao, lerCofre, simularApi } from './teste/ajudas';

function Sonda() {
  const s = useSessao();
  const estado = s.carregando
    ? 'carregando'
    : s.sessao
      ? `logado:${s.sessao.token}:${s.sessao.emailVerificado}`
      : 'deslogado';
  return (
    <>
      <Text testID="estado">{estado}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="sair" onPress={() => void s.sair()} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="iniciar"
        onPress={() => void s.iniciar('tok-novo', false)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="verificado"
        onPress={() => void s.marcarEmailVerificado()}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="chamar"
        onPress={() => void pedirAutenticado('/conta/qualquer').catch(() => undefined)}
      />
    </>
  );
}

async function abrir() {
  await render(
    <SessaoProvider>
      <Sonda />
    </SessaoProvider>,
  );
}

async function esperar(texto: string) {
  await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent(texto));
}

describe('SessaoContext', () => {
  it('restaura a sessão guardada ao abrir', async () => {
    guardarSessao('tok-guardado', true);
    await abrir();
    await esperar('logado:tok-guardado:true');
  });

  it('sem nada guardado, fica deslogado', async () => {
    await abrir();
    await esperar('deslogado');
  });

  it.each([['{isto não é json'], ['"texto"'], ['{"token":123,"emailVerificado":true}'], ['{"token":"x"}']])(
    'trata o conteúdo corrompido %s como sem sessão, sem quebrar',
    async (lixo) => {
      lerCofre().set(CHAVE_SESSAO, lixo);
      await abrir();
      await esperar('deslogado');
    },
  );

  it('sem conseguir ler o cofre, fica deslogado', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('cofre indisponível'));
    await abrir();
    await esperar('deslogado');
  });

  it('iniciar guarda { token, emailVerificado } sob uma única chave', async () => {
    const user = userEvent.setup();
    await abrir();
    await esperar('deslogado');
    await user.press(screen.getByLabelText('iniciar'));
    await esperar('logado:tok-novo:false');
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lerCofre().get(CHAVE_SESSAO) as string)).toEqual({ token: 'tok-novo', emailVerificado: false });
  });

  it('marcarEmailVerificado atualiza o estado e o cofre', async () => {
    guardarSessao('tok-a', false);
    const user = userEvent.setup();
    await abrir();
    await esperar('logado:tok-a:false');
    await user.press(screen.getByLabelText('verificado'));
    await esperar('logado:tok-a:true');
    expect(JSON.parse(lerCofre().get(CHAVE_SESSAO) as string)).toEqual({ token: 'tok-a', emailVerificado: true });
  });

  it('sair apaga a chave do cofre e limpa o estado', async () => {
    guardarSessao('tok-b', true);
    const user = userEvent.setup();
    await abrir();
    await esperar('logado:tok-b:true');
    await user.press(screen.getByLabelText('sair'));
    await esperar('deslogado');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(CHAVE_SESSAO);
    expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
  });

  it('um 401 numa chamada autenticada encerra a sessão', async () => {
    guardarSessao('tok-velho', true);
    const api = simularApi({ 'GET /conta/qualquer': { status: 401, corpo: { erro: 'Não autenticado' } } });
    const user = userEvent.setup();
    await abrir();
    await esperar('logado:tok-velho:true');
    await user.press(screen.getByLabelText('chamar'));
    await esperar('deslogado');
    expect(api.chamadas[0].autorizacao).toBe('Bearer tok-velho');
    expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
  });
});
