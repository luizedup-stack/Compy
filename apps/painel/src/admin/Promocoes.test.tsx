import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, resposta, simularApi } from '../ajudantesTeste';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao('admin');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PEDIDO = (id: number, extra: object = {}) => ({
  id, mercadoId: 1, mercadoNome: 'Comércio A', criadoEm: '2026-11-10T12:00:00.000Z', situacao: 'aguardando', quantidade: 2,
  valorUnitarioCentavos: 500, totalCentavos: 1000, avisouPagamentoEm: null, pagoEm: null, ...extra,
});

const DADOS = {
  config: { valorCentavos: 500, pixChave: 'dona@exemplo.com' },
  resumo: { pagas: 1, aguardando: 1, canceladas: 0, promocoesPagas: 3, promocoesAguardando: 2, recebidoCentavos: 1500, aReceberCentavos: 1000 },
  porComercio: [{ mercadoId: 1, nome: 'Comércio A', pagas: 1, aguardando: 1, recebidoCentavos: 1500, devidoCentavos: 1000 }],
  pedidos: [PEDIDO(8, { avisouPagamentoEm: '2026-11-10T14:00:00.000Z' }), PEDIDO(7, { situacao: 'pago', quantidade: 3, totalCentavos: 1500, pagoEm: '2026-11-10T13:00:00.000Z' })],
};

describe('Promoções (administração)', () => {
  it('mostra os totais, quem pagou e quem deve, e os pedidos', async () => {
    const chamadas = simularApi(() => resposta(DADOS));
    abrir('/admin/promocoes');

    expect(await screen.findByRole('heading', { level: 1, name: 'Promoções' })).toBeInTheDocument();
    expect(await screen.findByText('promoções pagas')).toBeInTheDocument();
    expect(screen.getByText('R$ 15,00', { selector: '.resumo-numero' })).toBeInTheDocument(); // recebido
    expect(screen.getByText('R$ 10,00', { selector: '.resumo-numero' })).toBeInTheDocument(); // a receber

    const porComercio = within(screen.getByRole('table', { name: 'Pagamentos por comércio' }));
    expect(porComercio.getByText('Comércio A')).toBeInTheDocument();
    expect(porComercio.getByText('R$ 10,00')).toBeInTheDocument(); // falta pagar

    const pedidos = within(screen.getByRole('table', { name: 'Pedidos de promoção' }));
    expect(pedidos.getByText('Nº 8')).toBeInTheDocument();
    expect(pedidos.getByText(/Avisou que pagou em/)).toBeInTheDocument();
    expect(chamadas[0].caminho).toBe('/admin/promocoes');
    expect(chamadas[0].autorizacao).toBe('Bearer tok-123');
  });

  it('o valor por promoção e a chave Pix aparecem preenchidos e podem ser salvos', async () => {
    const chamadas = simularApi((c) => (c.metodo === 'PUT' ? resposta({ valorCentavos: 750, pixChave: '11999998888' }) : resposta(DADOS)));
    abrir('/admin/promocoes');
    const valor = await screen.findByLabelText('Valor de cada promoção (R$)');
    expect(valor).toHaveValue('5');
    expect(screen.getByLabelText('Chave Pix que os comércios veem para pagar')).toHaveValue('dona@exemplo.com');

    const u = userEvent.setup();
    await u.clear(valor);
    await u.type(valor, '7,50');
    const chave = screen.getByLabelText('Chave Pix que os comércios veem para pagar');
    await u.clear(chave);
    await u.type(chave, '11999998888');
    await u.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Configurações salvas/)).toBeInTheDocument();
    const put = chamadas.find((c) => c.metodo === 'PUT')!;
    expect(put.caminho).toBe('/admin/promocoes/config');
    expect(put.corpo).toEqual({ valorCentavos: 750, pixChave: '11999998888' });
  });

  it('valor que não é número mostra o aviso e não chama o servidor', async () => {
    const chamadas = simularApi(() => resposta(DADOS));
    abrir('/admin/promocoes');
    const valor = await screen.findByLabelText('Valor de cada promoção (R$)');
    const u = userEvent.setup();
    await u.clear(valor);
    await u.type(valor, 'cinco');
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o valor em reais');
    expect(chamadas.filter((c) => c.metodo === 'PUT')).toHaveLength(0);
  });

  it('"Marcar como pago" libera o pedido (chama o servidor e recarrega)', async () => {
    const chamadas = simularApi((c) => (c.metodo === 'POST' ? resposta({ pedido: PEDIDO(8, { situacao: 'pago' }), importadas: 2, promocoes: 2, ignoradas: 0 }) : resposta(DADOS)));
    abrir('/admin/promocoes');
    const botao = await screen.findByRole('button', { name: 'Marcar o pedido 8 como pago' });
    await userEvent.setup().click(botao);
    expect(await screen.findByText('Pedido 8 liberado: a planilha foi aplicada.')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST')!.caminho).toBe('/admin/promocoes/8/pagar');
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'GET').length).toBeGreaterThanOrEqual(2));
  });

  it('cancelar um pedido', async () => {
    const chamadas = simularApi((c) => (c.metodo === 'POST' ? resposta(PEDIDO(8, { situacao: 'cancelado' })) : resposta(DADOS)));
    abrir('/admin/promocoes');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cancelar o pedido 8' }));
    expect(await screen.findByText('Pedido 8 cancelado.')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST')!.caminho).toBe('/admin/promocoes/8/cancelar');
  });

  it('só o administrador entra: comércio é levado para Produtos', async () => {
    comSessao('mercado');
    simularApi(() => resposta({ itens: [], total: 0 }));
    abrir('/admin/promocoes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Produtos' })).toBeInTheDocument();
  });

  it('erro do servidor aparece em um alerta', async () => {
    simularApi(() => resposta({ erro: 'Erro interno do servidor' }, 500));
    abrir('/admin/promocoes');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno do servidor');
  });
});
