import type { EnderecoMercado, ProdutoPainel, RelatorioImportacao } from '@mercado/shared';

const URL_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const CHAVE_SESSAO = 'bolso-certo:sessao';
const CHAVE_MERCADO_ESCOLHIDO = 'bolso-certo:mercado-escolhido';
// Cópia da lista "meus mercados" (o cabeçalho a lê para mostrar o seletor sem fazer uma chamada própria a cada tela).
const CHAVE_MEUS_MERCADOS = 'bolso-certo:meus-mercados';
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
  localStorage.removeItem(CHAVE_MERCADO_ESCOLHIDO);
  localStorage.removeItem(CHAVE_MEUS_MERCADOS);
}

/** Mercado que está sendo visto/editado: o do administrador (escolhido em Produtos) ou o do usuário de mercado (seletor do topo). */
export function lerMercadoEscolhido(): number | null {
  const n = Number(localStorage.getItem(CHAVE_MERCADO_ESCOLHIDO));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function guardarMercadoEscolhido(id: number | null): void {
  if (id === null) localStorage.removeItem(CHAVE_MERCADO_ESCOLHIDO);
  else localStorage.setItem(CHAVE_MERCADO_ESCOLHIDO, String(id));
}

/**
 * As chamadas de um mercado levam o mercado escolhido (`?mercadoId=`): o administrador escolhe qualquer um; o usuário
 * de mercado escolhe entre os dele (quando tem mais de um). Valem as chamadas /painel/* (menos a lista dos meus
 * mercados, que não depende da escolha) e o envio de planilha (/planilhas). O servidor confere de quem é o mercado.
 */
function comMercadoEscolhido(caminho: string): string {
  const papel = lerSessao()?.papel;
  if (papel !== 'admin' && papel !== 'mercado') return caminho;
  const dependeDoMercado =
    (caminho.startsWith('/painel/') && !caminho.startsWith('/painel/meus-mercados')) || caminho === '/planilhas';
  if (!dependeDoMercado) return caminho;
  const id = lerMercadoEscolhido();
  if (id === null) return caminho;
  return `${caminho}${caminho.includes('?') ? '&' : '?'}mercadoId=${id}`;
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
    resposta = await fetch(`${URL_BASE}${comMercadoEscolhido(caminho)}`, { ...init, headers });
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

/** Pede o código de redefinição. Chamada pública: sem Bearer e sem derrubar a sessão num 401. */
export async function esqueciSenha(email: string): Promise<void> {
  await pedir(
    '/auth/esqueci-senha',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) },
    false,
  );
}

/** Troca a senha com o código recebido por e-mail. Chamada pública, como esqueciSenha. */
export async function redefinirSenha(token: string, senha: string): Promise<void> {
  await pedir(
    '/auth/redefinir-senha',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, senha }) },
    false,
  );
}

/** O próprio mercado cria a conta (e o mercado). Chamada pública: sem Bearer. */
export async function cadastrarMercado(dados: { email: string; senha: string }): Promise<void> {
  await pedir(
    '/auth/cadastro-mercado',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) },
    false,
  );
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
  // Revogar na hora pode cancelar o download em alguns navegadores (Firefox, Safari): espera 1 s.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Sessão recusada pelo servidor (a sessão já foi limpa): a tela deve voltar para o login. */
export function sessaoRecusada(e: unknown): boolean {
  return e instanceof ErroApi && e.status === 401;
}

/** Texto do erro para mostrar ao usuário. */
export function mensagemDoErro(e: unknown): string {
  return e instanceof ErroApi ? e.message : MSG_SERVIDOR;
}

/** Mensagem do servidor para uma conta de mercado que ainda não cadastrou nenhum mercado. */
export const MSG_SEM_MERCADO = 'Sua conta não está ligada a um mercado ativo';

export interface MercadoPainel {
  id: number;
  nome: string;
  /** O endereço em uma linha (como o cliente vê). */
  endereco: string;
  /** Só dígitos; null enquanto não preenchido. */
  telefone: string | null;
  /** Endereço por partes; null em mercados que vieram só de planilha. */
  detalhes: EnderecoMercado | null;
  /** Já tem o endereço completo e o telefone. */
  perfilCompleto: boolean;
  totalProdutos: number;
  produtosDesatualizados: number;
}

/** Os campos do formulário do mercado (tudo texto, como digitado). */
export interface DadosDoMercado {
  nome: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
}

/** Um mercado da lista "meus mercados". */
export interface ResumoDoMercado {
  id: number;
  nome: string;
  endereco: string;
  totalProdutos: number;
  perfilCompleto: boolean;
}

/** Avisa só o cabeçalho que a lista guardada de mercados foi atualizada (por exemplo, o nome mudou); as telas não recarregam. */
export const EVENTO_LISTA_ATUALIZADA = 'bolso-certo:lista-atualizada';
export function avisarListaAtualizada(): void {
  window.dispatchEvent(new Event(EVENTO_LISTA_ATUALIZADA));
}

/** Avisa o resto do painel (cabeçalho, telas) que a lista de mercados ou o mercado escolhido mudou: as telas recarregam. */
export const EVENTO_MERCADOS_MUDARAM = 'bolso-certo:mercados-mudaram';
export function avisarMudancaDeMercados(): void {
  window.dispatchEvent(new Event(EVENTO_MERCADOS_MUDARAM));
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

/** Salva os dados do mercado em uso (só os campos enviados mudam; o servidor confere tudo). */
export async function atualizarMercado(campos: Partial<DadosDoMercado>): Promise<MercadoPainel> {
  const resposta = await pedir('/painel/mercado', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(campos),
  });
  return (await resposta.json()) as MercadoPainel;
}

/** A última lista de mercados da conta que o painel recebeu do servidor (vazia se ainda não recebeu). */
export function lerMeusMercadosGuardados(): ResumoDoMercado[] {
  try {
    const lido: unknown = JSON.parse(localStorage.getItem(CHAVE_MEUS_MERCADOS) ?? '[]');
    return Array.isArray(lido) ? (lido as ResumoDoMercado[]) : [];
  } catch {
    return [];
  }
}

/** Os mercados ativos da conta logada (usuário de mercado). Guarda a lista para o seletor do cabeçalho. */
export async function listarMeusMercados(): Promise<ResumoDoMercado[]> {
  const resposta = await pedir('/painel/meus-mercados');
  const lido: unknown = await resposta.json();
  const lista = Array.isArray(lido) ? (lido as ResumoDoMercado[]) : [];
  localStorage.setItem(CHAVE_MEUS_MERCADOS, JSON.stringify(lista));
  return lista;
}

/** Cadastra um mercado novo (ou o primeiro) na conta, com o endereço completo e o telefone. */
export async function criarMercado(dados: DadosDoMercado): Promise<ResumoDoMercado> {
  const resposta = await pedir('/painel/meus-mercados', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(dados),
  });
  return (await resposta.json()) as ResumoDoMercado;
}

export async function listarProdutos(pagina: number, busca = ''): Promise<PaginaProdutos> {
  const filtro = busca.trim() === '' ? '' : `&q=${encodeURIComponent(busca.trim())}`;
  const resposta = await pedir(`/painel/produtos?pagina=${pagina}${filtro}`);
  return (await resposta.json()) as PaginaProdutos;
}

/** Campos para cadastrar um produto novo à mão; código de barras, nome e preço são obrigatórios. */
export interface CamposNovoProduto extends CamposProduto {
  codigoBarras: string;
  nome: string;
  preco: number | string;
}

export async function criarProduto(campos: CamposNovoProduto): Promise<ProdutoPainel> {
  const resposta = await pedir('/painel/produtos', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(campos),
  });
  return (await resposta.json()) as ProdutoPainel;
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

export interface MercadoAdmin {
  id: number;
  nome: string;
  endereco: string;
  status: 'ativo' | 'removido';
  totalProdutos: number;
  temLogin: boolean;
}

export async function listarMercadosAdmin(): Promise<MercadoAdmin[]> {
  const resposta = await pedir('/admin/mercados');
  return (await resposta.json()) as MercadoAdmin[];
}

/** Cria o login do mercado; a senha temporária só vem nesta resposta e não existe em nenhum outro lugar. */
export async function criarAcesso(id: number, email: string): Promise<{ senhaTemporaria: string }> {
  const resposta = await pedir(`/admin/mercados/${id}/acesso`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
  });
  return (await resposta.json()) as { senhaTemporaria: string };
}

/** O servidor responde 204, sem corpo: não há o que ler. */
export async function removerMercado(id: number): Promise<void> {
  await pedir(`/admin/mercados/${id}/remover`, { method: 'POST' });
}
