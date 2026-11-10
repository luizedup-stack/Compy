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
/**
 * Respostas padrão para o que as telas pedem sozinhas ao abrir (a lista de produtos da tela inicial e o perfil da conta).
 * Valem só quando o teste NÃO define a rota; ficam fora de `chamadas` e de `fetch`, para os testes das outras telas não
 * precisarem conhecê-las. Para testar essas rotas, é só definir `'GET /produtos'` / `'GET /conta'` nas rotas do teste.
 * Com `{ semPadroes: true }` nada é respondido sozinho (toda rota não definida falha como falta de rede): é o que os
 * testes de "sem internet" usam.
 */
const RESPOSTAS_PADRAO: Record<string, RespostaFalsa> = {
  'GET /produtos': { status: 200, corpo: { grupos: [], total: 0 } },
  'GET /conta': { status: 200, corpo: { id: 1, email: 'teste@exemplo.com', nome: null, foto: null } },
};

export function simularApi(rotas: Record<string, Manipulador>, opcoes: { semPadroes?: boolean } = {}) {
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
  // Intercepta as rotas padrão que o teste não definiu; todo o resto passa pelo `falso` (que registra as chamadas).
  const comPadroes = async (url: string, init?: RequestInit) => {
    const chave = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const padrao = RESPOSTAS_PADRAO[chave];
    if (padrao && !(chave in rotas) && !opcoes.semPadroes) {
      return { ok: true, status: padrao.status, json: async () => padrao.corpo };
    }
    return falso(url, init);
  };
  globalThis.fetch = comPadroes as unknown as typeof fetch;
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

/** Botão de uma aba da barra inferior ("Buscar", "Mercados" ou "Conta"); o React Navigation o rotula como "Mercados, tab, 2 of 3". */
export function aba(nome: 'Buscar' | 'Estabelecimentos' | 'Conta') {
  return screen.getByLabelText(new RegExp(`^${nome}(,|$)`));
}
