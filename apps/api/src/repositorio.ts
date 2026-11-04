import type { Unidade } from '@mercado/shared';

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
  acharMercadoDoUsuario(usuarioId: number): Promise<Mercado | null>;
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
