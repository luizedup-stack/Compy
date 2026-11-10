import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, resposta, simularApi } from './ajudantesTeste';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PEDIDO = {
  id: 7, mercadoId: 1, criadoEm: '2026-11-10T12:00:00.000Z', situacao: 'aguardando', quantidade: 3,
  valorUnitarioCentavos: 500, totalCentavos: 1500, avisouPagamentoEm: null, pagoEm: null,
};

/** Responde /painel/cobranca e /painel/promocoes (o que a tela pede ao abrir). */
function api(situacao: string, mensagem: string, pedidos: object[] = [], config: { valorCentavos: number; pixChave: string | null } = { valorCentavos: 500, pixChave: 'dona@exemplo.com' }) {
  return simularApi((c) => {
    if (c.caminho.startsWith('/painel/cobranca')) return resposta({ situacao, mensagem });
    if (c.caminho.startsWith('/painel/promocoes') && c.metodo === 'GET') return resposta({ config, pedidos });
    return resposta({ erro: 'não esperado' }, 500);
  });
}

describe('Cobrança', () => {
  it('mostra o título, a mensagem do servidor, a situação e o valor da promoção com a chave Pix', async () => {
    const chamadas = api('gratuita', 'Gratuito por enquanto');
    abrir('/cobranca');

    expect(await screen.findByText('Gratuito por enquanto')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Cobrança' })).toBeInTheDocument();
    expect(screen.getByText('gratuita')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Promoções' })).toBeInTheDocument();
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument();
    expect(screen.getByText('dona@exemplo.com')).toBeInTheDocument();
    expect(screen.getByText('Você ainda não tem pedidos de promoção.')).toBeInTheDocument();
    expect(chamadas.map((c) => c.caminho).sort()).toEqual(['/painel/cobranca', '/painel/promocoes']);
    expect(chamadas[0].autorizacao).toBe('Bearer tok-123');
  });

  it('sem chave Pix informada, avisa para falar com a administração', async () => {
    api('gratuita', 'ok', [], { valorCentavos: 500, pixChave: null });
    abrir('/cobranca');
    expect(await screen.findByText(/A chave Pix para pagar ainda não foi informada/)).toBeInTheDocument();
  });

  it('mostra a situação em atraso com texto legível', async () => {
    api('em_atraso', 'Pagamento em atraso');
    abrir('/cobranca');

    expect(await screen.findByText('Pagamento em atraso')).toBeInTheDocument();
    expect(screen.getByText('em atraso')).toBeInTheDocument();
  });

  it('lista o pedido aguardando pagamento; "Já paguei" avisa e desliga o botão', async () => {
    api('gratuita', 'ok', [PEDIDO]);
    abrir('/cobranca');
    const linha = (await screen.findByText('Nº 7')).closest('tr')!;
    expect(within(linha).getByText('3 × R$ 5,00')).toBeInTheDocument();
    expect(within(linha).getByText('R$ 15,00')).toBeInTheDocument();
    expect(within(linha).getByText('Aguardando pagamento')).toBeInTheDocument();

    fetchMock.mockImplementationOnce(async () => resposta({ ...PEDIDO, avisouPagamentoEm: '2026-11-10T13:00:00.000Z' }));
    await userEvent.setup().click(within(linha).getByRole('button', { name: 'Já paguei o pedido 7' }));
    await waitFor(() => expect(within(linha).getByRole('button', { name: 'Já paguei o pedido 7' })).toBeDisabled());
    expect(within(linha).getByText(/Você avisou em/)).toBeInTheDocument();
  });

  it('cancelar o pedido muda a situação e some com os botões', async () => {
    api('gratuita', 'ok', [PEDIDO]);
    abrir('/cobranca');
    const linha = (await screen.findByText('Nº 7')).closest('tr')!;
    fetchMock.mockImplementationOnce(async () => resposta({ ...PEDIDO, situacao: 'cancelado' }));
    await userEvent.setup().click(within(linha).getByRole('button', { name: 'Cancelar o pedido 7' }));
    await waitFor(() => expect(within(linha).getByText('Cancelado')).toBeInTheDocument());
    expect(within(linha).queryByRole('button')).not.toBeInTheDocument();
  });

  it('erro do servidor aparece em um alerta', async () => {
    simularApi(() => resposta({ erro: 'Sua conta não está ligada a um comércio ativo' }, 403));
    abrir('/cobranca');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta não está ligada a um comércio ativo');
  });

  it('sessão recusada (401) leva para /entrar', async () => {
    simularApi(() => resposta({ erro: 'Sessão expirada' }, 401));
    abrir('/cobranca');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
