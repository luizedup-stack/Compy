export const ABA_MERCADO = 'Mercado';
export const ABA_PRODUTOS = 'Produtos';
/** Aba opcional da planilha: cada linha é uma promoção (COBRADA). */
export const ABA_DESCONTOS = 'Descontos';

export const COLUNAS_PRODUTOS = [
  'Código de barras',
  'Produto',
  'Preço',
  'Quantidade',
  'Categoria',
  'Disponível',
] as const;

/** Colunas da aba Descontos (as com * são obrigatórias): o produto, o preço promocional e o período. */
export const COLUNAS_DESCONTOS = ['Código de barras', 'Preço promocional', 'Válido de', 'Válido até'] as const;

/** Valor padrão de cada promoção, em centavos (R$ 5,00). A dona muda na administração. */
export const VALOR_PADRAO_PROMOCAO_CENTAVOS = 500;

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
  /** Quando há promoção valendo: `preco` já é o preço promocional e este é o preço normal (riscado na tela). */
  precoOriginal?: number;
  /** Até quando a promoção vale (texto ISO), ou null se não tem fim. */
  promocaoAte?: string | null;
}

export interface GrupoProduto {
  codigoBarras: string;
  nome: string;
  ofertas: Oferta[];
  /**
   * Caminho da foto do produto na API (ex.: "/fotos/7891000100103"; o app junta com o endereço do servidor), ou `null`
   * se ainda não há foto. Ausente quando a fonte dos dados não informa fotos.
   */
  foto?: string | null;
  /** true quando a foto é só ILUSTRATIVA (a do tipo de produto, não a do produto exato). */
  fotoIlustrativa?: boolean;
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
  /** Quando há promoção valendo: `preco` já é o preço promocional e este é o preço normal. */
  precoOriginal?: number;
  /** Até quando a promoção vale (texto ISO), ou null se não tem fim. */
  promocaoAte?: string | null;
  /** Caminho da foto na API (veja GrupoProduto.foto). */
  foto?: string | null;
  /** true quando a foto é só ILUSTRATIVA (a do tipo de produto, não a do produto exato). */
  fotoIlustrativa?: boolean;
}

export interface RelatorioImportacao {
  mercadoId: number;
  mercadoCriado: boolean;
  importadas: number;
  erros: { linha: number; motivo: string }[];
  /** Quantas promoções (linhas da aba Descontos) foram aplicadas na hora (só quando quem envia é o administrador). */
  promocoes?: number;
  /**
   * true quando a planilha tem promoções e foi RETIDA até o pagamento: nada foi salvo ainda (`importadas` fica 0) e `pedido` diz
   * quanto pagar. Quando a dona confirma o pagamento, a planilha é aplicada.
   */
  retida?: boolean;
  pedido?: { id: number; quantidade: number; valorUnitarioCentavos: number; totalCentavos: number };
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
  /** Caminho da foto na API (veja GrupoProduto.foto), ou null se o produto ainda não tem foto. */
  foto?: string | null;
  /** De onde veio a foto: achada sozinha num banco aberto de produtos ou enviada por um mercado. */
  fotoOrigem?: 'automatica' | 'mercado' | 'ilustrativa' | null;
  /** A foto é só deste mercado (o produto já tinha outra foto, que continua valendo para os demais mercados). */
  fotoSoDoMercado?: boolean;
}

/**
 * Caminho, na API, da foto de um produto. Normalmente a foto é do código de barras (igual para todos os mercados). Se o mercado
 * enviou uma foto só dele (o produto já tinha outra), informe `doMercado`: o caminho leva o mercado e a data da foto (`versao`),
 * para o link mudar quando o mercado troca a foto.
 */
export const caminhoDaFoto = (codigoBarras: string, doMercado?: { mercadoId: number; versao: number }): string =>
  doMercado ? `/fotos/${codigoBarras}?mercado=${doMercado.mercadoId}&v=${doMercado.versao}` : `/fotos/${codigoBarras}`;
