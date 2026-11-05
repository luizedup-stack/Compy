import { render, screen, waitFor } from '@testing-library/react-native';

import { Navegacao, type RotaInicial } from '../navegacao';
import { CHAVE_SESSAO, SessaoProvider } from '../sessao';

export interface RespostaFalsa {
  status: number;
  corpo?: unknown;
}

export interface ChamadaFalsa {
  metodo: string;
  caminho: string;
  /** Texto depois do "?" da URL, já com a codificação original (ex.: "?q=papel%20higienico&ordem=unidade"); vazio se não há. */
  consulta: string;
  corpo: unknown;
  autorizacao: string | null;
}

type Manipulador = RespostaFalsa | ((chamada: ChamadaFalsa) => RespostaFalsa | Promise<RespostaFalsa>);

/**
 * Troca o `fetch` global por um falso. As rotas são "MÉTODO /caminho". Rota desconhecida
 * simula falha de rede, então nenhum teste fala com a internet. Um manipulador pode devolver uma Promise
 * (para controlar quando a resposta chega) e o objeto `rotas` pode ser alterado depois, entre uma chamada e outra.
 */
export function simularApi(rotas: Record<string, Manipulador>) {
  const chamadas: ChamadaFalsa[] = [];
  const falso = jest.fn(async (url: string, init?: RequestInit) => {
    const { pathname: caminho, search: consulta } = new URL(url);
    const metodo = init?.method ?? 'GET';
    const cabecalhos = (init?.headers ?? {}) as Record<string, string>;
    const chamada: ChamadaFalsa = {
      metodo,
      caminho,
      consulta,
      corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      autorizacao: cabecalhos.Authorization ?? null,
    };
    chamadas.push(chamada);
    const manipulador = rotas[`${metodo} ${caminho}`];
    if (!manipulador) throw new TypeError('Network request failed');
    const resposta = await (typeof manipulador === 'function' ? manipulador(chamada) : manipulador);
    return {
      ok: resposta.status >= 200 && resposta.status < 300,
      status: resposta.status,
      json: async () => resposta.corpo,
    };
  });
  globalThis.fetch = falso as unknown as typeof fetch;
  return { fetch: falso, chamadas };
}

export function guardarSessao(token: string, emailVerificado: boolean) {
  const cofre = jest.requireMock('expo-secure-store') as { __mapa: Map<string, string> };
  cofre.__mapa.set(CHAVE_SESSAO, JSON.stringify({ token, emailVerificado }));
}

export function lerCofre(): Map<string, string> {
  return (jest.requireMock('expo-secure-store') as { __mapa: Map<string, string> }).__mapa;
}

/** Renderiza o app inteiro (sessão + navegação) e espera a restauração da sessão terminar. */
export async function abrirApp(rotaInicial?: RotaInicial) {
  await render(
    <SessaoProvider>
      <Navegacao rotaInicial={rotaInicial} />
    </SessaoProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId('splash')).not.toBeOnTheScreen());
}
