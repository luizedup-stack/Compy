import { screen } from '@testing-library/react';
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

describe('Cobrança', () => {
  it('mostra o título, a mensagem do servidor, a situação e a frase sobre promoções', async () => {
    const chamadas = simularApi(() => resposta({ situacao: 'gratuita', mensagem: 'Gratuito por enquanto' }));
    abrir('/cobranca');

    expect(await screen.findByText('Gratuito por enquanto')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Cobrança' })).toBeInTheDocument();
    expect(screen.getByText('gratuita')).toBeInTheDocument();
    expect(
      screen.getByText('Promoções ainda não estão disponíveis; quando estiverem, o pagamento será feito aqui.'),
    ).toBeInTheDocument();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].caminho).toBe('/painel/cobranca');
    expect(chamadas[0].autorizacao).toBe('Bearer tok-123');
  });

  it('mostra a situação em atraso com texto legível', async () => {
    simularApi(() => resposta({ situacao: 'em_atraso', mensagem: 'Pagamento em atraso' }));
    abrir('/cobranca');

    expect(await screen.findByText('Pagamento em atraso')).toBeInTheDocument();
    expect(screen.getByText('em atraso')).toBeInTheDocument();
  });

  it('erro do servidor aparece em um alerta', async () => {
    simularApi(() => resposta({ erro: 'Sua conta não está ligada a um mercado ativo' }, 403));
    abrir('/cobranca');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta não está ligada a um mercado ativo');
  });

  it('sessão recusada (401) leva para /entrar', async () => {
    simularApi(() => resposta({ erro: 'Sessão expirada' }, 401));
    abrir('/cobranca');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
