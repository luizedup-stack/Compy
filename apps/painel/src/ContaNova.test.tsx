// Conta de mercado recém-criada, que ainda não cadastrou o mercado: é levada para "Meu mercado" para cadastrar.
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

describe('conta de mercado sem mercado cadastrado', () => {
  it('ao entrar, vai direto para "Meu mercado" com o formulário de cadastro', async () => {
    simularApi(
      (c) => {
        if (c.caminho === '/auth/login') return resposta({ token: 'tok-novo', papel: 'mercado', emailVerificado: false });
        if (c.caminho === '/painel/meus-mercados') return resposta([]);
        return resposta({ erro: 'não esperado' }, 500);
      },
      { meusMercados: 'responder' },
    );
    abrir('/entrar');
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('E-mail'), 'novo@exemplo.com');
    await usuario.type(screen.getByLabelText('Senha'), 'senha1234');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Cadastre o seu mercado' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cadastre o seu mercado para começar.');
  });

  it('se abrir Produtos sem mercado, é levada para "Meu mercado" (em vez de ver um erro)', async () => {
    comSessao();
    simularApi(
      (c) =>
        c.caminho === '/painel/meus-mercados'
          ? resposta([])
          : resposta({ erro: 'Sua conta não está ligada a um mercado ativo' }, 403),
      { meusMercados: 'responder' },
    );
    abrir('/produtos');

    expect(await screen.findByRole('heading', { level: 2, name: 'Cadastre o seu mercado' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cadastre o seu mercado para começar a cadastrar produtos.');
  });
});
