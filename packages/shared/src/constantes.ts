export const ABA_MERCADO = 'Mercado';
export const ABA_PRODUTOS = 'Produtos';

export const COLUNAS_PRODUTOS = [
  'Código de barras',
  'Produto',
  'Preço',
  'Quantidade',
  'Categoria',
  'Disponível',
] as const;

export const LIMITE_LINHAS = 5000;
export const LIMITE_BYTES = 5 * 1024 * 1024;
export const DIAS_PRECO_VELHO = 7;

export type Unidade = 'kg' | 'L' | 'un' | 'rolo';

export interface Oferta {
  mercadoId: number;
  mercadoNome: string;
  endereco: string;
  nomeNoMercado: string;
  preco: number;
  quantidadeTexto: string | null;
  precoPorUnidade: number | null;
  unidade: Unidade | null;
  atualizadoEm: string;
  diasDesdeAtualizacao: number;
  desatualizado: boolean;
}

export interface GrupoProduto {
  codigoBarras: string;
  nome: string;
  ofertas: Oferta[];
}

/** Produto de um mercado como o cliente o vê (resposta de /mercados/:id/produtos). */
export interface ProdutoMercado {
  codigoBarras: string;
  nome: string;
  preco: number;
  quantidadeTexto: string | null;
  precoPorUnidade: number | null;
  unidade: Unidade | null;
  /** Data (ISO 8601) em que o preço foi atualizado pela última vez. */
  atualizadoEm: string;
  diasDesdeAtualizacao: number;
  desatualizado: boolean;
}

export interface RelatorioImportacao {
  mercadoId: number;
  mercadoCriado: boolean;
  importadas: number;
  erros: { linha: number; motivo: string }[];
}

/** Produto como o painel do mercado o vê (resposta de /painel/produtos). */
export interface ProdutoPainel {
  codigoBarras: string;
  nome: string;
  preco: number;
  quantidadeTexto: string | null;
  categoria: string | null;
  disponivel: boolean;
  /** Data (ISO 8601) em que o preço foi atualizado pela última vez. */
  atualizadoEm: string;
  desatualizado: boolean;
}
