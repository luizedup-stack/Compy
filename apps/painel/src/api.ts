import type { ProdutoPainel, RelatorioImportacao } from '@mercado/shared';

const URL_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const CHAVE_SESSAO = 'bolso-certo:sessao';
const MSG_SERVIDOR = 'Não foi possível falar com o servidor';

export type Papel = 'cliente' | 'mercado' | 'admin';
export interface Sessao {
  token: string;
  papel: Papel;
}

export class ErroApi extends Error {
  readonly status: number;

  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
  }
}

export function guardarSessao(sessao: Sessao): void {
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ token: sessao.token, papel: sessao.papel }));
}

export function lerSessao(): Sessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const dados: unknown = JSON.parse(bruto);
    if (typeof dados !== 'object' || dados === null) return null;
    const { token, papel } = dados as Partial<Sessao>;
    if (typeof token !== 'string' || !token) return null;
    if (papel !== 'cliente' && papel !== 'mercado' && papel !== 'admin') return null;
    return { token, papel };
  } catch {
    return null;
  }
}

export function limparSessao(): void {
  localStorage.removeItem(CHAVE_SESSAO);
}

/** Faz a chamada e converte qualquer resposta fora de 2xx em ErroApi. */
async function pedir(caminho: string, init: RequestInit = {}, autenticado = true): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (autenticado) {
    const sessao = lerSessao();
    if (sessao) headers.Authorization = `Bearer ${sessao.token}`;
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${URL_BASE}${caminho}`, { ...init, headers });
  } catch {
    throw new ErroApi(MSG_SERVIDOR, 0);
  }

  if (resposta.ok) return resposta;

  let mensagem = MSG_SERVIDOR;
  try {
    const corpo: unknown = await resposta.json();
    const erro = (corpo as { erro?: unknown } | null)?.erro;
    if (typeof erro === 'string' && erro) mensagem = erro;
  } catch {
    // Corpo que não é JSON: fica a mensagem genérica.
  }
  // Sessão recusada numa chamada autenticada: o token não vale mais.
  if (resposta.status === 401 && autenticado) limparSessao();
  throw new ErroApi(mensagem, resposta.status);
}

export async function login(
  email: string,
  senha: string,
): Promise<{ token: string; papel: Papel; emailVerificado: boolean }> {
  const resposta = await pedir(
    '/auth/login',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) },
    false,
  );
  return (await resposta.json()) as { token: string; papel: Papel; emailVerificado: boolean };
}

export async function enviarPlanilha(arquivo: File): Promise<RelatorioImportacao> {
  const corpo = new FormData();
  corpo.append('arquivo', arquivo);
  const resposta = await pedir('/planilhas', { method: 'POST', body: corpo });
  return (await resposta.json()) as RelatorioImportacao;
}

export async function baixarModelo(): Promise<void> {
  const resposta = await pedir('/planilhas/modelo');
  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'modelo-bolso-certo.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Sessão recusada pelo servidor (a sessão já foi limpa): a tela deve voltar para o login. */
export function sessaoRecusada(e: unknown): boolean {
  return e instanceof ErroApi && e.status === 401;
}

/** Texto do erro para mostrar ao usuário. */
export function mensagemDoErro(e: unknown): string {
  return e instanceof ErroApi ? e.message : MSG_SERVIDOR;
}

export interface MercadoPainel {
  id: number;
  nome: string;
  endereco: string;
  totalProdutos: number;
  produtosDesatualizados: number;
}

export interface PaginaProdutos {
  itens: ProdutoPainel[];
  total: number;
}

/** Campos que o painel pode alterar num produto; `quantidade` é texto livre (o servidor interpreta). */
export interface CamposProduto {
  nome?: string;
  preco?: number | string;
  quantidade?: string | null;
  categoria?: string | null;
  disponivel?: boolean;
}

export type SituacaoConta = 'gratuita' | 'ativa' | 'em_atraso';

export interface Cobranca {
  situacao: SituacaoConta;
  mensagem: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function obterMercado(): Promise<MercadoPainel> {
  const resposta = await pedir('/painel/mercado');
  return (await resposta.json()) as MercadoPainel;
}

export async function atualizarMercado(campos: { nome?: string; endereco?: string }): Promise<MercadoPainel> {
  const resposta = await pedir('/painel/mercado', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(campos),
  });
  return (await resposta.json()) as MercadoPainel;
}

export async function listarProdutos(pagina: number): Promise<PaginaProdutos> {
  const resposta = await pedir(`/painel/produtos?pagina=${pagina}`);
  return (await resposta.json()) as PaginaProdutos;
}

export async function editarProduto(codigo: string, campos: CamposProduto): Promise<ProdutoPainel> {
  const resposta = await pedir(`/painel/produtos/${encodeURIComponent(codigo)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(campos),
  });
  return (await resposta.json()) as ProdutoPainel;
}

export async function removerProduto(codigo: string): Promise<void> {
  await pedir(`/painel/produtos/${encodeURIComponent(codigo)}`, { method: 'DELETE' });
}

export async function obterCobranca(): Promise<Cobranca> {
  const resposta = await pedir('/painel/cobranca');
  return (await resposta.json()) as Cobranca;
}
