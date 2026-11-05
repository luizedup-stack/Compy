import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, resposta, simularApi } from './ajudantesTeste';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  simularApi(() => resposta({ itens: [], total: 0 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('navegação por papel', () => {
  it('mercado vê os quatro itens, com os endereços certos', () => {
    comSessao('mercado');
    abrir('/planilha');

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Produtos', 'Enviar planilha', 'Meu mercado', 'Cobrança']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/produtos', '/planilha', '/meu-mercado', '/cobranca']);
    expect(within(nav).getByRole('link', { name: 'Enviar planilha' })).toHaveAttribute('aria-current', 'page');
  });

  it('admin vê Produtos, Enviar planilha e Administração', () => {
    comSessao('admin');
    abrir('/planilha');

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Produtos', 'Enviar planilha', 'Administração']);
  });

  it('sem sessão não há navegação', () => {
    abrir('/entrar');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('clicar em Produtos abre a tela de produtos', async () => {
    comSessao('mercado');
    abrir('/planilha');
    await userEvent.setup().click(screen.getByRole('link', { name: 'Produtos' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Produtos' })).toBeInTheDocument();
  });
});

describe('rotas só do mercado', () => {
  it.each(['/meu-mercado', '/cobranca'])('admin em %s cai em /produtos', (rota) => {
    comSessao('admin');
    abrir(rota);

    expect(screen.getByRole('heading', { level: 1, name: 'Produtos' })).toBeInTheDocument();
  });

  it.each(['/produtos', '/meu-mercado', '/cobranca'])('sem sessão, %s redireciona para /entrar', (rota) => {
    abrir(rota);

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
