import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir } from './ajudantesTeste';
import { aplicarTema, escolherTema, lerTemaEscolhido, temaEmUso } from './tema';

beforeEach(() => {
  localStorage.removeItem('bolso-certo:tema');
  document.documentElement.removeAttribute('data-tema');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sistemaEscuro(escuro: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: escuro && q.includes('dark'), media: q, addEventListener() {}, removeEventListener() {} }));
}

describe('tema claro/escuro', () => {
  it('sem escolha, segue o sistema; com escolha, a escolha vale e fica guardada', () => {
    sistemaEscuro(true);
    expect(lerTemaEscolhido()).toBeNull();
    expect(temaEmUso()).toBe('escuro');
    aplicarTema();
    expect(document.documentElement.hasAttribute('data-tema')).toBe(false); // o sistema decide pelo CSS

    escolherTema('claro');
    expect(temaEmUso()).toBe('claro');
    expect(document.documentElement.getAttribute('data-tema')).toBe('claro');
    expect(localStorage.getItem('bolso-certo:tema')).toBe('claro');
  });

  it('o botão do cabeçalho alterna, aplica na página e lembra a escolha', async () => {
    sistemaEscuro(false);
    abrir('/entrar');
    const u = userEvent.setup();
    const botao = await screen.findByRole('button', { name: /Modo escuro/ });
    expect(botao).toHaveAttribute('aria-pressed', 'false');

    await u.click(botao);
    expect(document.documentElement.getAttribute('data-tema')).toBe('escuro');
    expect(screen.getByRole('button', { name: /Modo claro/ })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('bolso-certo:tema')).toBe('escuro');

    await u.click(screen.getByRole('button', { name: /Modo claro/ }));
    expect(document.documentElement.getAttribute('data-tema')).toBe('claro');
  });

  it('armazenamento indisponível não quebra', () => {
    sistemaEscuro(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(lerTemaEscolhido()).toBeNull();
    expect(temaEmUso()).toBe('claro');
    vi.restoreAllMocks();
  });
});
