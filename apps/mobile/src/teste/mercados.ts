import type { ProdutoMercado } from '@mercado/shared';

import type { Mercado } from '../api';
import type { RespostaFalsa } from './ajudas';

/** Os 4 mercados de dados-de-teste/ (endereços inventados), em ordem alfabética como a API devolve. */
export const MERCADOS: Mercado[] = [
  { id: 4, nome: 'Atacarejo Econômico', endereco: 'Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP', totalProdutos: 27 },
  { id: 3, nome: 'Empório Sonia', endereco: 'Rua das Hortênsias, 33 – Vila Sônia, São Paulo – SP', totalProdutos: 1 },
  { id: 1, nome: 'Mercado Bom Preço', endereco: 'Rua dos Ipês, 120 – Vila Sônia, São Paulo – SP', totalProdutos: 120 },
  { id: 2, nome: 'Supermercado Estrela da Vila', endereco: 'Av. das Acácias, 850 – Vila Sônia, São Paulo – SP', totalProdutos: 26 },
];

export function produto(parcial: Partial<ProdutoMercado> = {}): ProdutoMercado {
  return {
    codigoBarras: '7890070035629',
    nome: 'Papel Higiênico Fox Folha Dupla 12 rolos',
    preco: 18.5,
    quantidadeTexto: '12 rolos',
    precoPorUnidade: 1.54,
    unidade: 'rolo',
    atualizadoEm: '2026-11-03T12:00:00.000Z',
    diasDesdeAtualizacao: 1,
    desatualizado: false,
    ...parcial,
  };
}

export const TAMANHO_PAGINA = 50;

/** Item número `n` (a partir de 1) de um mercado com muitos produtos; código e nome únicos. */
export function produtoNumero(n: number): ProdutoMercado {
  return produto({
    codigoBarras: String(7890000000000 + n),
    nome: `Produto ${String(n).padStart(3, '0')}`,
    preco: 10 + n / 100,
    quantidadeTexto: '1 un',
    precoPorUnidade: 10 + n / 100,
    unidade: 'un',
  });
}

/**
 * Resposta de GET /mercados/:id/produtos?pagina=N para um mercado com `total` produtos numerados.
 * O tamanho da página é o da API (50); os testes que olham o texto dos produtos usam páginas pequenas,
 * porque o jest não mede a tela e só desenha as primeiras linhas da lista.
 */
export function paginaNumerada(total: number, consulta: string, tamanho = TAMANHO_PAGINA): RespostaFalsa {
  const pagina = Number(new URLSearchParams(consulta).get('pagina'));
  const inicio = (pagina - 1) * tamanho;
  const itens = [];
  for (let n = inicio + 1; n <= Math.min(total, inicio + tamanho); n += 1) itens.push(produtoNumero(n));
  return { status: 200, corpo: { itens, total } };
}

/** Promessa que o teste resolve quando quiser, para controlar o momento em que uma resposta chega. */
export function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

/** Verdadeiro se não há nenhum campo de texto dentro do elemento (telas somente de leitura). */
export function semCamposDeTexto(elemento: { queryAll: (predicado: (n: { type: unknown }) => boolean) => unknown[] }): boolean {
  return elemento.queryAll((n) => n.type === 'TextInput').length === 0;
}

type NoDeTeste = { type: unknown; props: Record<string, unknown> };

/** Títulos do cabeçalho de todas as telas da pilha, da mais antiga para a mais nova (o título do cabeçalho nativo não é um texto da tela). */
export function titulosDoCabecalho(raiz: { queryAll: (predicado: (n: NoDeTeste) => boolean) => NoDeTeste[] }): string[] {
  return raiz.queryAll((n) => n.type === 'RNSScreenStackHeaderConfig').map((n) => String(n.props.title));
}
