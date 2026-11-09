/**
 * Cliente HTTP da API do Compy.
 * Em um celular de verdade, EXPO_PUBLIC_API_URL precisa ser o endereço do computador na rede (ex.: http://192.168.0.10:3000).
 */
import {
  buscarNoCatalogo,
  listarProdutosNoCatalogo,
  mercadosDoCatalogo,
  produtosDoMercadoNoCatalogo,
  type Catalogo,
  type GrupoProduto,
  type ProdutoMercado,
} from '@mercado/shared';

import { guardarCatalogoLocal, lerCatalogoLocal } from './catalogo';
import { comecouEsperarServidor, marcarComConexao, marcarSemConexao, terminouEsperarServidor } from './conexao';

// O Expo troca `process.env.EXPO_PUBLIC_*` pelo valor na hora de empacotar, por isso a leitura é direta.
export const URL_API: string = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Endereço escolhido dentro do app (tela Entrar > Configurar servidor); vale no lugar do de fábrica.
let urlEscolhida: string | null = null;

/** Endereço da API em uso: o escolhido no app, ou o de fábrica (URL_API). */
export function urlApi(): string {
  return urlEscolhida ?? URL_API;
}

export function definirUrlApi(url: string | null): void {
  urlEscolhida = url === null ? null : url.replace(/\/+$/, '');
}

export const MSG_SEM_SERVIDOR = 'Não foi possível falar com o servidor';

/**
 * Endereços de rede local (192.168.x.x, 10.x.x.x, 172.16-31.x.x): só funcionam dentro da mesma rede Wi-Fi do computador.
 * Quem está longe (ou usa a internet do celular) nunca alcança um deles.
 */
const REDE_LOCAL = /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:|\/|$)/;

/** A mensagem de "sem servidor"; se o app aponta para um endereço de rede local, explica por que pode não funcionar. */
export function mensagemSemServidor(): string {
  if (!REDE_LOCAL.test(urlApi())) return MSG_SEM_SERVIDOR;
  return `${MSG_SEM_SERVIDOR}. Este app está apontando para um servidor da rede local (${urlApi()}), que só funciona perto do computador, na mesma rede Wi-Fi. Fora dela é preciso usar o endereço do servidor na internet (toque em Configurar servidor na tela de entrada).`;
}
export const MSG_ERRO_GENERICO = 'Algo deu errado. Tente novamente.';
export const MSG_ACORDANDO = 'O servidor está acordando. Isso pode levar até 1 minuto; tente de novo em instantes.';

/** Respostas de um servidor que ainda está ligando (o gratuito dorme sem uso): vale esperar e tentar de novo. */
const STATUS_SERVIDOR_ACORDANDO = new Set([502, 503, 504]);
/** Esperas, em ms, entre as tentativas enquanto o servidor acorda (no total, perto de 1 minuto). Os testes trocam por esperas curtas. */
let esperasAcordando = [4000, 6000, 8000, 10000, 12000, 15000];
export function definirEsperasAcordando(esperas: number[]): void {
  esperasAcordando = esperas;
}
const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** O servidor não está atendendo agora (sem rede, ou ainda ligando): vale mostrar a cópia dos dados guardada no celular. */
const servidorIndisponivel = (e: ErroApi): boolean => e.status === 0 || STATUS_SERVIDOR_ACORDANDO.has(e.status);
export const MSG_AREA_CLIENTES = 'Esta área é para clientes. Mercados usam o painel na web.';
export const MSG_EMAIL_REPETIDO = 'Esse e-mail já está cadastrado';

export class ErroApi extends Error {
  readonly status: number;

  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
  }
}

export interface RespostaLogin {
  token: string;
  papel: string;
  emailVerificado: boolean;
}

/** Mercado ativo como a lista do cliente o mostra (resposta de GET /mercados). */
export interface Mercado {
  id: number;
  nome: string;
  endereco: string;
  totalProdutos: number;
}

/** Uma página de produtos de um mercado: `total` é a quantidade em todas as páginas. */
export interface PaginaProdutos {
  itens: ProdutoMercado[];
  total: number;
}

let tokenAtual: string | null = null;
let aoExpirar: (() => void) | null = null;

/** A sessão (sessao.tsx) informa aqui o token em uso; as chamadas autenticadas o leem daqui. */
export function definirToken(token: string | null): void {
  tokenAtual = token;
}

/** Registra o que fazer quando uma chamada autenticada recebe 401 (token vencido ou conta apagada). */
export function definirAoExpirar(funcao: (() => void) | null): void {
  aoExpirar = funcao;
}

interface Opcoes {
  metodo?: string;
  corpo?: unknown;
}

async function executar<T>(caminho: string, opcoes: Opcoes, autenticado: boolean): Promise<T> {
  const metodo = opcoes.metodo ?? (opcoes.corpo !== undefined ? 'POST' : 'GET');
  const cabecalhos: Record<string, string> = { Accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  if (autenticado && tokenAtual) cabecalhos.Authorization = `Bearer ${tokenAtual}`;

  let esperando = false; // esta consulta está na fila de "servidor acordando"
  try {
    for (let tentativa = 0; ; tentativa++) {
      let resposta: Response;
      try {
        resposta = await fetch(`${urlApi()}${caminho}`, {
          method: metodo,
          headers: cabecalhos,
          body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
        });
      } catch {
        throw new ErroApi(mensagemSemServidor(), 0);
      }

      // Servidor ligando: só consultas (GET) esperam e repetem sozinhas; um envio (login, cadastro) mostra o aviso e a pessoa repete.
      if (STATUS_SERVIDOR_ACORDANDO.has(resposta.status) && metodo === 'GET' && tentativa < esperasAcordando.length) {
        if (!esperando) {
          esperando = true;
          comecouEsperarServidor();
        }
        await esperar(esperasAcordando[tentativa]!);
        continue;
      }

      if (resposta.status === 204) return undefined as T;

      let json: unknown;
      try {
        json = await resposta.json();
      } catch {
        json = undefined;
      }

      if (!resposta.ok) {
        if (resposta.status === 401 && autenticado) aoExpirar?.();
        const erro = (json as { erro?: unknown } | undefined)?.erro;
        const padrao = STATUS_SERVIDOR_ACORDANDO.has(resposta.status) ? MSG_ACORDANDO : MSG_ERRO_GENERICO;
        throw new ErroApi(typeof erro === 'string' && erro ? erro : padrao, resposta.status);
      }
      return json as T;
    }
  } finally {
    if (esperando) terminouEsperarServidor();
  }
}

/** Chamada com o token da sessão. Reutilizada pelas telas de busca, mercados e conta. */
export function pedirAutenticado<T = void>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  return executar<T>(caminho, opcoes, true);
}

export async function cadastrar(email: string, senha: string): Promise<void> {
  try {
    await executar<void>('/auth/cadastro', { corpo: { email, senha } }, false);
  } catch (e) {
    if (e instanceof ErroApi && e.status === 409) throw new ErroApi(MSG_EMAIL_REPETIDO, 409);
    throw e;
  }
}

export function entrar(email: string, senha: string): Promise<RespostaLogin> {
  return executar<RespostaLogin>('/auth/login', { corpo: { email, senha } }, false);
}

/** Entra e só admite clientes: mercados e administradores usam o painel na web. */
export async function entrarComoCliente(email: string, senha: string): Promise<RespostaLogin> {
  const resposta = await entrar(email, senha);
  if (resposta.papel !== 'cliente') throw new ErroApi(MSG_AREA_CLIENTES, 403);
  return resposta;
}

export function esqueciSenha(email: string): Promise<void> {
  return executar<void>('/auth/esqueci-senha', { corpo: { email } }, false);
}

export function redefinirSenha(token: string, senha: string): Promise<void> {
  return executar<void>('/auth/redefinir-senha', { corpo: { token, senha } }, false);
}

export function excluirConta(): Promise<void> {
  return pedirAutenticado<void>('/conta', { metodo: 'DELETE' });
}

// ---- Perfil (tela Conta) ---------------------------------------------------------------------------------

/** O perfil da pessoa: nome de usuário e foto são opcionais. A foto é um texto "data:image/jpeg;base64,...". */
export interface Perfil {
  id: number;
  email: string;
  nome: string | null;
  foto: string | null;
}

export function obterPerfil(): Promise<Perfil> {
  return pedirAutenticado<Perfil>('/conta');
}

/** Altera só os campos enviados. `nome: null` apaga o nome; `foto: null` remove a foto. */
export function atualizarPerfil(campos: { nome?: string | null; foto?: string | null; email?: string }): Promise<Perfil> {
  return pedirAutenticado<Perfil>('/conta', { metodo: 'PATCH', corpo: campos });
}

/** Troca a senha (exige a senha atual). */
export function trocarSenha(senhaAtual: string, senhaNova: string): Promise<void> {
  return pedirAutenticado<void>('/conta/senha', { metodo: 'POST', corpo: { senhaAtual, senhaNova } });
}

// ---- Funciona sem internet -------------------------------------------------------------------------------
// Com o servidor respondendo, as consultas vêm dele (sempre atualizadas) e o app aproveita para renovar a cópia
// de todos os produtos guardada no celular. Sem resposta (sem internet, ou servidor desligado), as mesmas
// consultas são feitas nessa cópia, com a mesma conta que o servidor usa (packages/shared).

/** Quanto tempo uma tentativa de renovar a cópia vale antes de tentar de novo. */
const PRAZO_RENOVAR_MS = 30 * 60 * 1000;
let renovacaoAutomatica = true;
let renovando: Promise<void> | null = null;
let ultimaTentativa = 0;

/** Liga/desliga a renovação automática da cópia em segundo plano (os testes a desligam). */
export function definirRenovacaoAutomatica(ligada: boolean): void {
  renovacaoAutomatica = ligada;
  if (!ligada) ultimaTentativa = 0;
}

/**
 * Baixa a cópia de todos os produtos e a guarda no celular. Sem `forcar`, não repete dentro de 30 minutos (trava de custo: veja docs/TRAVAS-DE-CUSTO.md).
 * Nunca lança erro: falhas só significam que a cópia antiga continua valendo.
 */
export function renovarCopiaDosProdutos(forcar = false): Promise<void> {
  if (!renovacaoAutomatica) return Promise.resolve();
  if (renovando) return renovando;
  const agora = Date.now();
  if (!forcar && agora - ultimaTentativa < PRAZO_RENOVAR_MS) return Promise.resolve();
  ultimaTentativa = agora;
  renovando = (async () => {
    try {
      const catalogo = await executar<Catalogo>('/catalogo', {}, true);
      await guardarCatalogoLocal(catalogo);
    } catch {
      ultimaTentativa = 0; // não deu certo: a próxima consulta tenta de novo
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

/**
 * Quanto o app espera o servidor antes de mostrar a cópia guardada no celular (só se houver cópia). O servidor gratuito dorme sem uso e
 * a primeira resposta do dia demora quase 1 minuto: com a cópia, a pessoa vê os produtos na hora e o servidor acorda por baixo dos panos.
 */
let prazoRespostaMs = 6000;
export function definirPrazoResposta(ms: number): void {
  prazoRespostaMs = ms;
}

/** Faz a consulta no servidor; se ele não responder (status 0) ou demorar demais, refaz na cópia do celular, se houver. */
async function comCopiaLocal<T>(noServidor: () => Promise<T>, naCopia: (catalogo: Catalogo) => T): Promise<T> {
  try {
    const local = await lerCatalogoLocal();
    const servidor = noServidor();
    let resultado: T;
    if (local) {
      const demorou = Symbol('demorou');
      let relogio: ReturnType<typeof setTimeout> | undefined;
      const prazo = new Promise<typeof demorou>((resolve) => {
        relogio = setTimeout(() => resolve(demorou), prazoRespostaMs);
      });
      const primeiro = await Promise.race([servidor, prazo]).finally(() => clearTimeout(relogio));
      if (primeiro === demorou) {
        // Segue esperando o servidor em segundo plano (é a consulta que o acorda) e, quando ele responder, renova a cópia.
        // Quando o servidor responder, o aviso some (os dados da tela são os da cópia até a próxima consulta).
        servidor.then(
          () => {
            marcarComConexao();
            return renovarCopiaDosProdutos();
          },
          () => undefined,
        );
        marcarSemConexao(local.baixadoEm, true);
        return naCopia(local.catalogo);
      }
      resultado = primeiro as T;
    } else {
      resultado = await servidor;
    }
    marcarComConexao();
    void renovarCopiaDosProdutos();
    return resultado;
  } catch (e) {
    if (!(e instanceof ErroApi) || !servidorIndisponivel(e)) throw e;
    const copia = await lerCatalogoLocal();
    if (!copia) throw e;
    marcarSemConexao(copia.baixadoEm);
    return naCopia(copia.catalogo);
  }
}

/**
 * Lista de produtos da tela inicial (sem busca): já comparados entre os mercados, os vendidos em mais de um mercado
 * primeiro. `pagina` começa em 1; `total` é a quantidade de produtos em todas as páginas.
 */
export function listarProdutos(ordem: 'unidade' | 'embalagem', pagina: number): Promise<{ grupos: GrupoProduto[]; total: number }> {
  return comCopiaLocal(
    () => pedirAutenticado<{ grupos: GrupoProduto[]; total: number }>(`/produtos?ordem=${ordem}&pagina=${pagina}`),
    (catalogo) => listarProdutosNoCatalogo(catalogo, { ordem, pagina }),
  );
}

/** Busca de produtos (só clientes): grupos e ofertas ordenados pela `ordem` escolhida. */
export function buscar(q: string, ordem: 'unidade' | 'embalagem'): Promise<GrupoProduto[]> {
  return comCopiaLocal(
    () => pedirAutenticado<GrupoProduto[]>(`/busca?q=${encodeURIComponent(q)}&ordem=${ordem}`),
    (catalogo) => buscarNoCatalogo(catalogo, { q, ordem }),
  );
}

/** Mercados ativos, em ordem alfabética (só clientes). */
export function listarMercados(): Promise<Mercado[]> {
  return comCopiaLocal(
    () => pedirAutenticado<Mercado[]>('/mercados'),
    (catalogo) => mercadosDoCatalogo(catalogo),
  );
}

/** Uma página (50 produtos) do mercado; `pagina` começa em 1. 404 se o mercado não existe mais. */
export function produtosDoMercado(id: number, pagina: number): Promise<PaginaProdutos> {
  return comCopiaLocal(
    () => pedirAutenticado<PaginaProdutos>(`/mercados/${encodeURIComponent(String(id))}/produtos?pagina=${pagina}`),
    (catalogo) => {
      const resultado = produtosDoMercadoNoCatalogo(catalogo, id, pagina);
      if (!resultado) throw new ErroApi('Mercado não encontrado', 404);
      return resultado;
    },
  );
}

/** Texto para mostrar ao usuário a partir de qualquer erro capturado numa tela. */
export function mensagemDoErro(e: unknown): string {
  return e instanceof ErroApi ? e.message : MSG_ERRO_GENERICO;
}
