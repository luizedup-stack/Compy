import type { EnderecoMercado, Unidade } from '@mercado/shared';

export type Papel = 'cliente' | 'mercado' | 'admin';

export interface Usuario {
  id: number;
  email: string;
  senhaHash: string;
  papel: Papel;
  emailVerificado: boolean;
}

export interface Mercado {
  id: number;
  nome: string;
  endereco: string;
  nomeNorm: string;
  enderecoNorm: string;
  status: 'ativo' | 'removido';
  contaSituacao: 'gratuita' | 'ativa' | 'em_atraso';
  usuarioId: number | null;
  /** Endereço por partes (preenchido na tela "Meu mercado"). Ausente/null em mercados criados só pela planilha. */
  detalhes?: EnderecoMercado | null;
  /** Telefone com DDD, só dígitos. Ausente/null enquanto o mercado não preencher. */
  telefone?: string | null;
}

export interface OfertaArmazenada {
  mercadoId: number;
  codigoBarras: string;
  nome: string;
  nomeNorm: string;
  preco: number;
  quantidadeTexto: string | null;
  quantidadeValor: number | null;
  quantidadeUnidade: Unidade | null;
  categoria: string | null;
  disponivel: boolean;
  precoAtualizadoEm: Date;
  promocaoPreco: number | null;
  promocaoInicio: Date | null;
  promocaoFim: Date | null;
}

export type TipoToken = 'verificar_email' | 'redefinir_senha';

export interface BuscaRegistrada {
  usuarioId: number | null;
  termo: string;
  resultados: number;
  mercadosDistintos: number;
}

export class ErroEmailJaExiste extends Error {
  constructor(message = 'E-mail já cadastrado') {
    super(message);
    this.name = 'ErroEmailJaExiste';
  }
}

export class ErroMercadoDuplicado extends Error {
  constructor(message = 'Mercado já cadastrado neste endereço') {
    super(message);
    this.name = 'ErroMercadoDuplicado';
  }
}

export interface Repositorio {
  /**
   * Executa `fn` de forma atômica: se ela lançar erro, tudo o que gravou é desfeito.
   * Transações e chamadas avulsas feitas neste repositório são serializadas: uma chamada
   * feita fora de uma transação em andamento espera ela terminar.
   *
   * Dentro de `fn`, use SEMPRE o repositório recebido (`r`), nunca o repositório
   * externo: chamar o externo de dentro da transação espera por ela mesma, para sempre.
   * O repositório recebido é reentrante: `r.transacao(...)` roda a função inline, sem
   * savepoint. Um erro interno que a função externa capture NÃO desfaz as escritas internas.
   *
   * Para a fase do banco de dados:
   * - "Uma leitura de fora espera a transação em andamento" é um comportamento da implementação em
   *   memória (fila única), não uma exigência: no PostgreSQL uma leitura de fora pode rodar em
   *   paralelo e ver o estado anterior à transação (isolamento READ COMMITTED).
   * - Já "ler, alterar e gravar em duas transações simultâneas dá 2" (teste do contrato) É uma
   *   exigência de projeto: a implementação no PostgreSQL precisa cumpri-la com trava de linha
   *   (`SELECT ... FOR UPDATE`) ou um lock equivalente nas leituras que antecedem uma escrita.
   */
  transacao<R>(fn: (r: Repositorio) => Promise<R>): Promise<R>;
  criarUsuario(u: Omit<Usuario, 'id'>): Promise<Usuario>;
  acharUsuarioPorEmail(email: string): Promise<Usuario | null>;
  acharUsuario(id: number): Promise<Usuario | null>;
  atualizarUsuario(id: number, parcial: Partial<Omit<Usuario, 'id'>>): Promise<void>;
  excluirUsuario(id: number): Promise<void>;
  guardarToken(t: { usuarioId: number; tipo: TipoToken; tokenHash: string; expiraEm: Date }): Promise<void>;
  consumirToken(tipo: TipoToken, tokenHash: string, agora: Date): Promise<number | null>;
  criarMercado(m: Omit<Mercado, 'id'>): Promise<Mercado>;
  acharMercado(id: number): Promise<Mercado | null>;
  acharMercadoPorChave(nomeNorm: string, enderecoNorm: string): Promise<Mercado | null>;
  /** O primeiro mercado (menor id) ligado ao usuário, ou null. Um usuário pode ter vários: veja listarMercadosDoUsuario. */
  acharMercadoDoUsuario(usuarioId: number): Promise<Mercado | null>;
  /** Todos os mercados ligados ao usuário (inclusive removidos), do menor id para o maior. */
  listarMercadosDoUsuario(usuarioId: number): Promise<Mercado[]>;
  atualizarMercado(id: number, parcial: Partial<Omit<Mercado, 'id'>>): Promise<void>;
  listarMercados(): Promise<Mercado[]>;
  salvarOferta(o: OfertaArmazenada): Promise<void>;
  acharOferta(mercadoId: number, codigoBarras: string): Promise<OfertaArmazenada | null>;
  removerOferta(mercadoId: number, codigoBarras: string): Promise<boolean>;
  listarOfertasDoMercado(mercadoId: number): Promise<OfertaArmazenada[]>;
  listarOfertasParaBusca(): Promise<{ oferta: OfertaArmazenada; mercado: Mercado }[]>;
  registrarBusca(b: BuscaRegistrada): Promise<void>;
  listarBuscas(): Promise<BuscaRegistrada[]>;
}
