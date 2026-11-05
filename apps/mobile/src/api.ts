/**
 * Cliente HTTP da API do Bolso Certo.
 * Em um celular de verdade, EXPO_PUBLIC_API_URL precisa ser o endereço do computador na rede (ex.: http://192.168.0.10:3000).
 */
import type { GrupoProduto, ProdutoMercado } from '@mercado/shared';

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
export const MSG_ERRO_GENERICO = 'Algo deu errado. Tente novamente.';
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
  const cabecalhos: Record<string, string> = { Accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  if (autenticado && tokenAtual) cabecalhos.Authorization = `Bearer ${tokenAtual}`;

  let resposta: Response;
  try {
    resposta = await fetch(`${urlApi()}${caminho}`, {
      method: opcoes.metodo ?? (opcoes.corpo !== undefined ? 'POST' : 'GET'),
      headers: cabecalhos,
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch {
    throw new ErroApi(MSG_SEM_SERVIDOR, 0);
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
    throw new ErroApi(typeof erro === 'string' && erro ? erro : MSG_ERRO_GENERICO, resposta.status);
  }
  return json as T;
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

export function verificarEmail(token: string): Promise<void> {
  return executar<void>('/auth/verificar-email', { corpo: { token } }, false);
}

export function reenviarVerificacao(): Promise<void> {
  return pedirAutenticado<void>('/auth/reenviar-verificacao', { metodo: 'POST' });
}

export function excluirConta(): Promise<void> {
  return pedirAutenticado<void>('/conta', { metodo: 'DELETE' });
}

/** Busca de produtos (só clientes). A API já devolve grupos e ofertas ordenados pela `ordem` escolhida. */
export function buscar(q: string, ordem: 'unidade' | 'embalagem'): Promise<GrupoProduto[]> {
  return pedirAutenticado<GrupoProduto[]>(`/busca?q=${encodeURIComponent(q)}&ordem=${ordem}`);
}

/** Mercados ativos, em ordem alfabética (só clientes). */
export function listarMercados(): Promise<Mercado[]> {
  return pedirAutenticado<Mercado[]>('/mercados');
}

/** Uma página (50 produtos) do mercado; `pagina` começa em 1. 404 se o mercado não existe mais. */
export function produtosDoMercado(id: number, pagina: number): Promise<PaginaProdutos> {
  return pedirAutenticado<PaginaProdutos>(`/mercados/${encodeURIComponent(String(id))}/produtos?pagina=${pagina}`);
}

/** Texto para mostrar ao usuário a partir de qualquer erro capturado numa tela. */
export function mensagemDoErro(e: unknown): string {
  return e instanceof ErroApi ? e.message : MSG_ERRO_GENERICO;
}
