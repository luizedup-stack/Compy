import { render } from '@testing-library/react';
import type { ProdutoPainel } from '@mercado/shared';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App from './App';

export const fetchMock = vi.fn();

export function resposta(corpo: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function abrir(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>,
  );
}

export function comSessao(papel: 'mercado' | 'admin' = 'mercado') {
  localStorage.setItem('bolso-certo:sessao', JSON.stringify({ token: 'tok-123', papel }));
}

export interface Chamada {
  metodo: string;
  caminho: string;
  corpo: unknown;
  autorizacao: string | undefined;
}

/**
 * Faz o `fetch` simulado responder pela função; devolve a lista (viva) das chamadas feitas. Nada vai à rede.
 *
 * O cabeçalho do painel pede a lista de mercados da conta (GET /painel/meus-mercados) para o seletor "Mercado:".
 * Essa chamada de infraestrutura é respondida aqui mesmo (por padrão com a lista de `meusMercados`, vazia) e NÃO entra
 * em `chamadas`, para os testes das telas não precisarem conhecê-la. Quem testa essa rota passa `meusMercados: 'responder'`
 * e a função `responder` recebe a chamada normalmente.
 */
export function simularApi(
  responder: (c: Chamada) => Response | Promise<Response>,
  opcoes: { meusMercados?: unknown[] | 'responder' } = {},
): Chamada[] {
  const chamadas: Chamada[] = [];
  const meusMercados = opcoes.meusMercados ?? [];
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const u = new URL(String(url));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const chamada: Chamada = {
      metodo: init?.method ?? 'GET',
      caminho: `${u.pathname}${u.search}`,
      corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      autorizacao: headers.Authorization,
    };
    if (meusMercados !== 'responder' && chamada.metodo === 'GET' && u.pathname === '/painel/meus-mercados') {
      return resposta(meusMercados);
    }
    chamadas.push(chamada);
    return responder(chamada);
  });
  return chamadas;
}

export const produto = (extra: Partial<ProdutoPainel> = {}): ProdutoPainel => ({
  codigoBarras: '7891000100103',
  nome: 'Arroz Tipo 1 5kg',
  preco: 14.9,
  quantidadeTexto: '5 kg',
  categoria: 'Mercearia',
  disponivel: true,
  atualizadoEm: '2026-11-02T15:00:00.000Z',
  desatualizado: false,
  ...extra,
});
