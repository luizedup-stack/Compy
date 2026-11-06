import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import { CHAVE_SESSAO } from '../sessao';
import { aba, abrirApp, guardarSessao, lerCofre, simularApi, type RespostaFalsa } from '../teste/ajudas';
import { MERCADOS, adiada, paginaNumerada, produto, semCamposDeTexto } from '../teste/mercados';

const MERCADO = MERCADOS[2]; // Mercado Bom Preço (id 1)
const ROTA_PRODUTOS = 'GET /mercados/1/produtos';

type Rotas = Parameters<typeof simularApi>[0];

/** Abre o app, vai para a aba Mercados e toca no Mercado Bom Preço. A resposta dos produtos fica por conta do teste. */
async function abrirDetalhe(rotas: Rotas, emailVerificado = true) {
  const api = simularApi({ 'GET /mercados': { status: 200, corpo: MERCADOS }, ...rotas });
  guardarSessao('tok-detalhe', emailVerificado);
  const user = userEvent.setup();
  await abrirApp();
  await user.press(aba('Mercados'));
  await screen.findByText(MERCADO.nome);
  await user.press(screen.getByRole('button', { name: /^Mercado Bom Preço,/ }));
  return { api, user };
}

function paginasPedidas(api: ReturnType<typeof simularApi>): string[] {
  return api.chamadas.filter((c) => c.caminho === '/mercados/1/produtos').map((c) => c.consulta);
}

/** Dispara o fim da lista sem esperar nada (para pedidos que o teste mantém em andamento). */
async function dispararFim() {
  await fireEvent(screen.getByTestId('lista-produtos'), 'endReached');
}

/** Dispara o fim da lista como a rolagem faria e espera a página pedida (se houve pedido) terminar de chegar. */
async function chegarAoFim() {
  await dispararFim();
  await waitFor(() => expect(screen.queryByText('Carregando mais produtos…')).not.toBeOnTheScreen());
}

/**
 * Páginas de 3 produtos: o jest não mede a tela e só desenha as primeiras linhas da lista,
 * então o texto das páginas novas precisa caber nelas. O app não depende do tamanho da página.
 */
const pequena = (total: number) => (c: { consulta: string }) => paginaNumerada(total, c.consulta, 3);

describe('MercadoDetalhe', () => {
  it('mostra "Carregando produtos…" e depois a primeira página (pagina=1, com o Bearer)', async () => {
    const espera = adiada<RespostaFalsa>();
    const { api } = await abrirDetalhe({ [ROTA_PRODUTOS]: () => espera.promessa });
    expect(await screen.findByText('Carregando produtos…')).toBeOnTheScreen();

    await act(async () => espera.resolver(paginaNumerada(120, '?pagina=1')));
    expect(await screen.findByText('Produto 001')).toBeOnTheScreen();
    expect(screen.queryByText('Carregando produtos…')).not.toBeOnTheScreen();
    expect(paginasPedidas(api)).toEqual(['?pagina=1']);
    expect(api.chamadas.find((c) => c.caminho === '/mercados/1/produtos')?.autorizacao).toBe('Bearer tok-detalhe');
  });

  it('chegar ao fim da lista carrega a página 2 e acrescenta os produtos aos que já estavam', async () => {
    const { api } = await abrirDetalhe({ [ROTA_PRODUTOS]: pequena(6) });
    await screen.findByText('Produto 001');
    expect(screen.queryByText('Produto 004')).not.toBeOnTheScreen();

    await chegarAoFim();
    expect(await screen.findByText('Produto 004')).toBeOnTheScreen();
    expect(screen.getByText('Produto 006')).toBeOnTheScreen();
    expect(screen.getByText('Produto 001')).toBeOnTheScreen();
    expect(screen.getAllByTestId('produto')).toHaveLength(6);
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2']);
  });

  it('pede a página 2 uma só vez mesmo se o fim da lista for avisado duas vezes', async () => {
    const espera = adiada<RespostaFalsa>();
    const { api } = await abrirDetalhe({
      [ROTA_PRODUTOS]: (c) => (c.consulta === '?pagina=2' ? espera.promessa : paginaNumerada(6, c.consulta, 3)),
    });
    await screen.findByText('Produto 001');

    await dispararFim();
    await dispararFim();
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2']);

    await act(async () => espera.resolver(paginaNumerada(6, '?pagina=2', 3)));
    expect(await screen.findByText('Produto 004')).toBeOnTheScreen();
    expect(screen.getAllByTestId('produto')).toHaveLength(6);
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2']);
  });

  it('com 120 produtos para depois da página 3: nunca pede a página 4', async () => {
    const { api } = await abrirDetalhe({ [ROTA_PRODUTOS]: (c) => paginaNumerada(120, c.consulta) });
    await screen.findByText('Produto 001');
    await chegarAoFim();
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2']);
    await chegarAoFim();
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2', '?pagina=3']);

    await chegarAoFim();
    await chegarAoFim();
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2', '?pagina=3']);
    expect(screen.queryByText('Não foi possível carregar mais.')).not.toBeOnTheScreen();
  });

  it('um mercado com uma página só não pede mais nada ao chegar ao fim', async () => {
    const { api } = await abrirDetalhe({ [ROTA_PRODUTOS]: (c) => paginaNumerada(30, c.consulta) });
    await screen.findByText('Produto 001');
    await chegarAoFim();
    expect(paginasPedidas(api)).toEqual(['?pagina=1']);
  });

  it('uma página vazia no meio do caminho encerra a rolagem em vez de repetir pedidos', async () => {
    const { api } = await abrirDetalhe({
      [ROTA_PRODUTOS]: (c) =>
        c.consulta === '?pagina=2' ? { status: 200, corpo: { itens: [], total: 120 } } : paginaNumerada(120, c.consulta),
    });
    await screen.findByText('Produto 001');
    await chegarAoFim();
    await chegarAoFim();
    await chegarAoFim();
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2']);
  });

  it('erro na página 2 mantém os produtos, avisa na própria lista e "Tentar de novo" pede a página 2 outra vez', async () => {
    let falhar = true;
    const { api, user } = await abrirDetalhe({
      [ROTA_PRODUTOS]: (c) =>
        c.consulta === '?pagina=2' && falhar ? { status: 500, corpo: { erro: 'Falha no servidor' } } : paginaNumerada(6, c.consulta, 3),
    });
    await screen.findByText('Produto 001');

    await chegarAoFim();
    expect(await screen.findByText('Não foi possível carregar mais.')).toBeOnTheScreen();
    expect(screen.getByText('Produto 001')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
    // Com o aviso na tela, chegar ao fim de novo não repete o pedido sozinho.
    await chegarAoFim();
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2']);

    falhar = false;
    await user.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Produto 004')).toBeOnTheScreen();
    expect(screen.queryByText('Não foi possível carregar mais.')).not.toBeOnTheScreen();
    expect(screen.getByText('Produto 001')).toBeOnTheScreen();
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=2', '?pagina=2']);
  });

  it('erro na primeira página mostra a mensagem e "Tentar de novo" refaz a página 1', async () => {
    let falhar = true;
    const { api, user } = await abrirDetalhe({
      [ROTA_PRODUTOS]: (c) => (falhar ? { status: 500, corpo: { erro: 'Falha no servidor' } } : paginaNumerada(30, c.consulta)),
    });
    expect(await screen.findByText('Falha no servidor')).toBeOnTheScreen();
    expect(screen.queryByText('Este mercado ainda não tem produtos.')).not.toBeOnTheScreen();

    falhar = false;
    await user.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Produto 001')).toBeOnTheScreen();
    expect(screen.queryByText('Falha no servidor')).not.toBeOnTheScreen();
    expect(paginasPedidas(api)).toEqual(['?pagina=1', '?pagina=1']);
  });

  it('sem rede na primeira página: mostra a mensagem de falta de servidor', async () => {
    simularApi({ 'GET /mercados': { status: 200, corpo: MERCADOS } });
    guardarSessao('tok-detalhe', true);
    const user = userEvent.setup();
    await abrirApp();
    await user.press(aba('Mercados'));
    await screen.findByText(MERCADO.nome);
    await user.press(screen.getByRole('button', { name: /^Mercado Bom Preço,/ }));
    expect(await screen.findByText('Não foi possível falar com o servidor')).toBeOnTheScreen();
  });

  it('mercado sem produtos: "Este mercado ainda não tem produtos."', async () => {
    await abrirDetalhe({ [ROTA_PRODUTOS]: { status: 200, corpo: { itens: [], total: 0 } } });
    expect(await screen.findByText('Este mercado ainda não tem produtos.')).toBeOnTheScreen();
    expect(screen.queryByTestId('produto')).not.toBeOnTheScreen();
  });

  it('404 (mercado removido) mostra a mensagem e "Voltar" leva de volta à lista de mercados', async () => {
    const { user } = await abrirDetalhe({
      [ROTA_PRODUTOS]: { status: 404, corpo: { erro: 'Mercado não encontrado' } },
    });
    expect(await screen.findByText('Mercado não encontrado')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByText('Mercado não encontrado')).not.toBeOnTheScreen());
    expect(screen.getAllByTestId('mercado')).toHaveLength(4);
  });

  it('401 encerra a sessão: apaga o token e volta para Entrar', async () => {
    await abrirDetalhe({ [ROTA_PRODUTOS]: { status: 401, corpo: { erro: 'Sessão expirada' } } });
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    expect(lerCofre().has(CHAVE_SESSAO)).toBe(false);
  });

  it('cada linha traz nome, preço da embalagem com a quantidade, preço por unidade e idade, em um rótulo só', async () => {
    await abrirDetalhe({
      [ROTA_PRODUTOS]: {
        status: 200,
        corpo: {
          itens: [
            produto({ nome: 'Papel Higiênico Fox Folha Dupla 12 rolos', preco: 18.5, quantidadeTexto: '12 rolos', precoPorUnidade: 1.54, unidade: 'rolo', diasDesdeAtualizacao: 1 }),
            produto({ codigoBarras: '7890070035001', nome: 'Café Torrado 500 g', preco: 22.9, quantidadeTexto: '500 g', precoPorUnidade: 45.8, unidade: 'kg', diasDesdeAtualizacao: 0 }),
          ],
          total: 2,
        },
      },
    });
    expect(await screen.findByText('Papel Higiênico Fox Folha Dupla 12 rolos')).toBeOnTheScreen();
    expect(screen.getByText('R$ 18,50')).toBeOnTheScreen();
    expect(screen.getByText('12 rolos')).toBeOnTheScreen();
    expect(screen.getByText('R$ 1,54 por rolo')).toBeOnTheScreen();
    expect(screen.getByText('atualizado há 1 dia')).toBeOnTheScreen();
    expect(screen.getByText('atualizado hoje')).toBeOnTheScreen();
    expect(screen.getAllByTestId('produto').map((el) => el.props.accessibilityLabel)).toEqual([
      'Papel Higiênico Fox Folha Dupla 12 rolos, R$ 18,50, 12 rolos, R$ 1,54 por rolo, atualizado há 1 dia',
      'Café Torrado 500 g, R$ 22,90, 500 g, R$ 45,80 por kg, atualizado hoje',
    ]);
    expect(screen.queryByText('Preço antigo')).not.toBeOnTheScreen();
  });

  it('preço antigo ganha a etiqueta "Preço antigo" sem sumir da lista; sem quantidade mostra o aviso', async () => {
    await abrirDetalhe({
      [ROTA_PRODUTOS]: {
        status: 200,
        corpo: {
          itens: [
            produto({ nome: 'Detergente Líquido Limpa Mais', preco: 2.99, quantidadeTexto: '500 mL', precoPorUnidade: 5.98, unidade: 'L', diasDesdeAtualizacao: 45, desatualizado: true }),
            produto({ codigoBarras: '7890070038361', nome: 'Papel Higiênico X Folha Simples', preco: 14, quantidadeTexto: null, precoPorUnidade: null, unidade: null }),
          ],
          total: 2,
        },
      },
    });
    expect(await screen.findByText('Detergente Líquido Limpa Mais')).toBeOnTheScreen();
    expect(screen.getAllByText('Preço antigo')).toHaveLength(1);
    expect(screen.getByText('atualizado há 45 dias')).toBeOnTheScreen();
    expect(screen.getByText('R$ 2,99')).toBeOnTheScreen();

    expect(screen.getAllByText('sem quantidade informada')).toHaveLength(1);
    expect(screen.getByText('Papel Higiênico X Folha Simples')).toBeOnTheScreen();
    const rotulos = screen.getAllByTestId('produto').map((el) => el.props.accessibilityLabel);
    expect(rotulos[0]).toBe('Detergente Líquido Limpa Mais, R$ 2,99, 500 mL, R$ 5,98 por L, atualizado há 45 dias, preço antigo');
    expect(rotulos[1]).toBe('Papel Higiênico X Folha Simples, R$ 14,00, sem quantidade informada, atualizado há 1 dia');
  });

  it('não tem nada para editar: nenhum campo de texto nem botão de alterar produtos ou preços', async () => {
    await abrirDetalhe({ [ROTA_PRODUTOS]: (c) => paginaNumerada(30, c.consulta) });
    await screen.findByText('Produto 001');
    expect(semCamposDeTexto(screen.getByTestId('lista-produtos'))).toBe(true);
    expect(screen.queryByRole('button', { name: /editar|alterar|remover|salvar|adicionar|excluir/i })).not.toBeOnTheScreen();
  });

  it('não há mais faixa de confirmação de e-mail, nem com o e-mail não confirmado (o cadastro não exige confirmar)', async () => {
    simularApi({
      'GET /mercados': { status: 200, corpo: MERCADOS },
      [ROTA_PRODUTOS]: (c) => paginaNumerada(30, c.consulta),
    });
    guardarSessao('tok-detalhe', false);
    const user = userEvent.setup();
    await abrirApp();
    await user.press(aba('Mercados'));
    await screen.findByText(MERCADO.nome);
    expect(screen.queryByText(/Confirme seu e-mail/)).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: /^Mercado Bom Preço,/ }));
    await screen.findByText('Produto 001');
    expect(screen.queryByText(/Confirme seu e-mail/, { includeHiddenElements: true })).not.toBeOnTheScreen();
  });
});
