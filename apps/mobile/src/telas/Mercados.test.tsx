import { act, screen, userEvent } from '@testing-library/react-native';

import { CHAVE_SESSAO } from '../sessao';
import { aba, abrirApp, guardarSessao, lerCofre, simularApi, type RespostaFalsa } from '../teste/ajudas';
import { MERCADOS, adiada, produto, semCamposDeTexto, titulosDoCabecalho } from '../teste/mercados';

async function abrirMercados(emailVerificado = true) {
  guardarSessao('tok-mercados', emailVerificado);
  const user = userEvent.setup();
  await abrirApp();
  await user.press(aba('Mercados'));
  return user;
}

describe('Mercados', () => {
  it('o app abre em "Buscar" e oferece as abas Buscar, Mercados e Conta', async () => {
    simularApi({});
    guardarSessao('tok-abas', true);
    await abrirApp();
    expect(screen.getByLabelText('Buscar produto')).toBeOnTheScreen();
    expect(aba('Buscar')).toBeOnTheScreen();
    expect(aba('Mercados')).toBeOnTheScreen();
    expect(aba('Conta')).toBeOnTheScreen();
  });

  it('lista os 4 mercados com endereço e total de produtos (singular e plural), chamando GET /mercados com o Bearer', async () => {
    const api = simularApi({ 'GET /mercados': { status: 200, corpo: MERCADOS } });
    await abrirMercados();

    expect(await screen.findByText('Atacarejo Econômico')).toBeOnTheScreen();
    expect(api.chamadas).toHaveLength(1);
    expect(api.chamadas[0]).toMatchObject({ metodo: 'GET', caminho: '/mercados', autorizacao: 'Bearer tok-mercados' });

    expect(screen.getAllByTestId('mercado').map((el) => el.props.accessibilityLabel)).toEqual([
      'Atacarejo Econômico, Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP, 27 produtos',
      'Empório Sonia, Rua das Hortênsias, 33 – Vila Sônia, São Paulo – SP, 1 produto',
      'Mercado Bom Preço, Rua dos Ipês, 120 – Vila Sônia, São Paulo – SP, 120 produtos',
      'Supermercado Estrela da Vila, Av. das Acácias, 850 – Vila Sônia, São Paulo – SP, 26 produtos',
    ]);
    expect(screen.getByText('27 produtos')).toBeOnTheScreen();
    expect(screen.getByText('1 produto')).toBeOnTheScreen();
    expect(screen.getByText('Rua dos Ipês, 120 – Vila Sônia, São Paulo – SP')).toBeOnTheScreen();
    expect(screen.queryByText('Carregando mercados…')).not.toBeOnTheScreen();
  });

  it('mostra "Carregando mercados…" enquanto a resposta não chega', async () => {
    const espera = adiada<RespostaFalsa>();
    simularApi({ 'GET /mercados': () => espera.promessa });
    await abrirMercados();
    expect(screen.getByText('Carregando mercados…')).toBeOnTheScreen();

    await act(async () => espera.resolver({ status: 200, corpo: MERCADOS }));
    expect(await screen.findByText('Empório Sonia')).toBeOnTheScreen();
    expect(screen.queryByText('Carregando mercados…')).not.toBeOnTheScreen();
  });

  it('tocar num mercado abre o detalhe com a primeira página de produtos', async () => {
    const api = simularApi({
      'GET /mercados': { status: 200, corpo: MERCADOS },
      'GET /mercados/1/produtos': {
        status: 200,
        corpo: {
          itens: [produto({ nome: 'Leite Integral Vaca Feliz 1 L', preco: 5.49, quantidadeTexto: '1 L', precoPorUnidade: 5.49, unidade: 'L' })],
          total: 1,
        },
      },
    });
    const user = await abrirMercados();
    await screen.findByText('Mercado Bom Preço');
    await user.press(screen.getByRole('button', { name: /^Mercado Bom Preço,/ }));

    expect(await screen.findByText('Leite Integral Vaca Feliz 1 L')).toBeOnTheScreen();
    const pedido = api.chamadas.find((c) => c.caminho === '/mercados/1/produtos');
    expect(pedido).toMatchObject({ metodo: 'GET', consulta: '?pagina=1', autorizacao: 'Bearer tok-mercados' });
    // O nome do mercado vira o título da tela do detalhe, no topo da pilha.
    expect(titulosDoCabecalho(screen.container).at(-1)).toBe('Mercado Bom Preço');
  });

  it('sem mercados: mostra "Nenhum mercado disponível ainda."', async () => {
    simularApi({ 'GET /mercados': { status: 200, corpo: [] } });
    await abrirMercados();
    expect(await screen.findByText('Nenhum mercado disponível ainda.')).toBeOnTheScreen();
    expect(screen.queryAllByTestId('mercado')).toHaveLength(0);
  });

  it('erro: mostra a mensagem do servidor e "Tentar de novo" refaz a chamada', async () => {
    const rotas: Parameters<typeof simularApi>[0] = {
      'GET /mercados': { status: 500, corpo: { erro: 'Falha ao listar' } },
    };
    const api = simularApi(rotas);
    const user = await abrirMercados();
    expect(await screen.findByText('Falha ao listar')).toBeOnTheScreen();
    expect(screen.queryByText('Nenhum mercado disponível ainda.')).not.toBeOnTheScreen();

    rotas['GET /mercados'] = { status: 200, corpo: MERCADOS };
    await user.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Empório Sonia')).toBeOnTheScreen();
    expect(screen.queryByText('Falha ao listar')).not.toBeOnTheScreen();
    expect(api.chamadas.filter((c) => c.caminho === '/mercados')).toHaveLength(2);
  });

  it('sem rede: mostra a mensagem de falta de servidor', async () => {
    simularApi({});
    await abrirMercados();
    expect(await screen.findByText('Não foi possível falar com o servidor')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });

  it('401 encerra a sessão: apaga o token e volta para Entrar', async () => {
    simularApi({ 'GET /mercados': { status: 401, corpo: { erro: 'Sessão expirada' } } });
    await abrirMercados();
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
  });

  it('puxar para atualizar busca a lista de novo e mostra a versão mais nova', async () => {
    const rotas: Parameters<typeof simularApi>[0] = { 'GET /mercados': { status: 200, corpo: MERCADOS } };
    const api = simularApi(rotas);
    await abrirMercados();
    await screen.findByText('Empório Sonia');

    rotas['GET /mercados'] = { status: 200, corpo: [{ ...MERCADOS[1], totalProdutos: 30 }] };
    const lista = screen.getByTestId('lista-mercados');
    await act(async () => lista.props.refreshControl.props.onRefresh());

    expect(await screen.findByText('30 produtos')).toBeOnTheScreen();
    expect(screen.queryByText('Atacarejo Econômico')).not.toBeOnTheScreen();
    expect(api.chamadas.filter((c) => c.caminho === '/mercados')).toHaveLength(2);
  });

  it('uma resposta que chega depois de a tela sair não gera aviso nem mexe no estado', async () => {
    const espera = adiada<RespostaFalsa>();
    simularApi({ 'GET /mercados': () => espera.promessa });
    const erros = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await abrirMercados();
    // Sai da conta (e da tela de mercados) antes de a resposta chegar.
    await user.press(aba('Conta'));
    await user.press(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();

    await act(async () => espera.resolver({ status: 200, corpo: MERCADOS }));
    expect(erros).not.toHaveBeenCalled();
    erros.mockRestore();
  });

  it('não tem nada para editar: nenhum campo de texto nem botão de alterar mercados', async () => {
    simularApi({ 'GET /mercados': { status: 200, corpo: MERCADOS } });
    await abrirMercados();
    await screen.findByText('Empório Sonia');
    expect(semCamposDeTexto(screen.getByTestId('lista-mercados'))).toBe(true);
    expect(screen.queryByRole('button', { name: /editar|alterar|remover|salvar|adicionar/i })).not.toBeOnTheScreen();
  });
});
