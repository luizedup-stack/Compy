import { screen, userEvent } from '@testing-library/react-native';

import { CHAVE_SESSAO } from '../sessao';
import { aba, abrirApp, lerCofre, simularApi } from '../teste/ajudas';

// O app funciona SEM login: buscar e ver mercados é público; entrar ou criar conta é opcional, a partir da aba Conta.

const LEITE = {
  codigoBarras: '7891000100103',
  nome: 'Leite Integral Piracanjuba 1L',
  ofertas: [
    {
      mercadoId: 1,
      mercadoNome: 'Mercado Bom Preço',
      endereco: 'Rua A, 10 - Vila Sônia, São Paulo - SP',
      nomeNoMercado: 'Leite Piracanjuba',
      preco: 5.99,
      quantidadeTexto: '1 L',
      precoPorUnidade: 5.99,
      unidade: 'L',
      atualizadoEm: '2026-11-06T10:00:00.000Z',
      diasDesdeAtualizacao: 1,
      desatualizado: false,
    },
  ],
};

async function buscarLeite(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Buscar produto'), 'leite');
  expect(await screen.findByText(LEITE.nome, {}, { timeout: 4000 })).toBeOnTheScreen();
}

describe('app sem login', () => {
  it('abre direto na busca, sem pedir login, e a busca vai sem token', async () => {
    const api = simularApi({ 'GET /busca': { status: 200, corpo: [LEITE] } });
    const user = userEvent.setup();
    await abrirApp();

    expect(screen.getByLabelText('Buscar produto')).toBeOnTheScreen();
    await buscarLeite(user);
    const chamada = api.chamadas.find((c) => c.caminho === '/busca');
    expect(chamada?.autorizacao).toBeNull();
    expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
  });

  it('as abas Mercados e Conta abrem sem login', async () => {
    simularApi({ 'GET /mercados': { status: 200, corpo: [{ id: 1, nome: 'Mercado Bom Preço', endereco: 'Rua A, 10', totalProdutos: 26 }] } });
    const user = userEvent.setup();
    await abrirApp();

    await user.press(aba('Mercados'));
    expect(await screen.findByText('Mercado Bom Preço')).toBeOnTheScreen();

    await user.press(aba('Conta'));
    expect(await screen.findByTestId('tela-conta-sem-login')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeOnTheScreen();
  });

  it('entrar é opcional: pela aba Conta a pessoa entra, vê a conta e, ao sair, continua usando o app', async () => {
    const api = simularApi({
      'GET /busca': { status: 200, corpo: [LEITE] },
      'POST /auth/login': { status: 200, corpo: { token: 'tok-ana', papel: 'cliente', emailVerificado: true } },
    });
    const user = userEvent.setup();
    await abrirApp();

    await user.press(aba('Conta'));
    await user.press(await screen.findByRole('button', { name: 'Entrar' }));
    await user.type(await screen.findByLabelText('E-mail'), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Senha'), '12345678');
    await user.press(screen.getByRole('button', { name: 'Entrar' }));

    // Caiu na aba Conta, já com a conta aberta.
    expect(await screen.findByTestId('tela-conta')).toBeOnTheScreen();
    expect(JSON.parse(lerCofre().get(CHAVE_SESSAO) as string)).toMatchObject({ token: 'tok-ana' });

    // A busca agora leva o token (a busca fica ligada à conta).
    await user.press(aba('Buscar'));
    await buscarLeite(user);
    expect(api.chamadas.find((c) => c.caminho === '/busca')?.autorizacao).toBe('Bearer tok-ana');

    // Sair: a aba Conta volta a oferecer Entrar, e a busca continua funcionando.
    await user.press(aba('Conta'));
    await user.press(await screen.findByRole('button', { name: 'Sair' }));
    expect(await screen.findByTestId('tela-conta-sem-login')).toBeOnTheScreen();
    expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
    await user.press(aba('Buscar'));
    expect(screen.getByLabelText('Buscar produto')).toBeOnTheScreen();
  });
});
