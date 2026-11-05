import { DIAS_PRECO_VELHO, type GrupoProduto, type Oferta, type ProdutoMercado, type Unidade } from './constantes';
import { precoPorUnidade } from './quantidade';
import { similaridadeDeTrigramas, trigramas } from './similaridade';
import { normalizarTexto } from './texto';

/**
 * A busca e a lista de produtos por mercado, como funções puras sobre um "catálogo" (a cópia dos mercados e
 * ofertas). A API usa estas funções com o que está no banco; o app do celular, com a cópia que guardou, para
 * funcionar do mesmo jeito sem internet.
 */

export type OrdemBusca = 'unidade' | 'embalagem';

/** Máximo de grupos (códigos de barras) devolvidos por busca (R32): os primeiros da ordem. */
export const LIMITE_GRUPOS_BUSCA = 50;
/** Produtos por página na lista de um mercado. */
export const PRODUTOS_POR_PAGINA = 50;

const MIN_CARACTERES = 2;
const MAX_CARACTERES = 100;
/** Texto bruto maior que isto é recusado antes mesmo de normalizar. */
const MAX_BRUTO = 1000;
const MAX_PALAVRAS = 8;
const MIN_LETRAS_APROXIMADA = 4;
const LIMITE_SIMILARIDADE = 0.35;
/** Ordem fixa das unidades: grupos de kg antes de L, un e rolo. */
const ORDEM_UNIDADES: readonly Unidade[] = ['kg', 'L', 'un', 'rolo'];
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Uma oferta disponível de um mercado ativo, em formato que cabe em JSON (datas em texto ISO 8601). */
export interface OfertaCatalogo {
  mercadoId: number;
  codigoBarras: string;
  nome: string;
  nomeNorm: string;
  preco: number;
  quantidadeTexto: string | null;
  quantidadeValor: number | null;
  quantidadeUnidade: Unidade | null;
  precoAtualizadoEm: string;
}

export interface MercadoCatalogo {
  id: number;
  nome: string;
  endereco: string;
}

/** Cópia dos mercados ativos e das ofertas disponíveis deles (resposta de GET /catalogo). */
export interface Catalogo {
  geradoEm: string;
  mercados: MercadoCatalogo[];
  ofertas: OfertaCatalogo[];
}

export interface MercadoComTotal extends MercadoCatalogo {
  totalProdutos: number;
}

/** Dias inteiros (arredondado para baixo) entre `data` e `agora`. */
export function diasDesde(data: Date, agora: Date = new Date()): number {
  return Math.floor((agora.getTime() - data.getTime()) / MS_POR_DIA);
}

/** Preço desatualizado: mais de `DIAS_PRECO_VELHO` dias inteiros (7 dias exatos ainda vale; 8 não). */
export function precoDesatualizado(data: Date, agora: Date = new Date()): boolean {
  return diasDesde(data, agora) > DIAS_PRECO_VELHO;
}

/** Preço por unidade de uma oferta (a partir da quantidade entendida; `null` se não houver). */
export function precoPorUnidadeDaOferta(o: {
  preco: number;
  quantidadeTexto: string | null;
  quantidadeValor: number | null;
  quantidadeUnidade: Unidade | null;
}): { precoPorUnidade: number | null; unidade: Unidade | null } {
  if (o.quantidadeTexto === null || o.quantidadeValor === null || o.quantidadeUnidade === null) {
    return { precoPorUnidade: null, unidade: null };
  }
  const ppu = precoPorUnidade(o.preco, { texto: o.quantidadeTexto, valor: o.quantidadeValor, unidade: o.quantidadeUnidade });
  return ppu === null ? { precoPorUnidade: null, unidade: null } : { precoPorUnidade: ppu, unidade: o.quantidadeUnidade };
}

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Nomes comparados sem depender de caixa ou acento; só então o texto cru decide. */
const compararNomes = (a: string, b: string) => comparar(normalizarTexto(a), normalizarTexto(b)) || comparar(a, b);

/** Uma oferta do grupo com a chave de ordenação por unidade (preço bruto por unidade). */
interface Entrada {
  oferta: Oferta;
  /** `preco / quantidadeValor` em milionésimos (inteiro): sem o arredondamento de 2 casas mostrado ao usuário e sem ruído de ponto flutuante. `null` sem unidade. */
  chaveUnidade: number | null;
}

const ESCALA_CHAVE = 1e6;

function chaveUnidadeDaOferta(o: OfertaCatalogo, mostrado: number | null): number | null {
  if (mostrado === null || o.quantidadeValor === null) return null;
  return Math.round((o.preco / o.quantidadeValor) * ESCALA_CHAVE);
}

/** Por preço por unidade: com unidade primeiro (kg, L, un, rolo; a mais barata antes), depois as sem, por preço. */
function compararPorUnidade(a: Entrada, b: Entrada): number {
  const oa = a.oferta;
  const ob = b.oferta;
  if (a.chaveUnidade !== null && oa.unidade !== null) {
    if (b.chaveUnidade === null || ob.unidade === null) return -1;
    const porUnidade = ORDEM_UNIDADES.indexOf(oa.unidade) - ORDEM_UNIDADES.indexOf(ob.unidade);
    return porUnidade !== 0 ? porUnidade : a.chaveUnidade - b.chaveUnidade;
  }
  if (b.chaveUnidade !== null && ob.unidade !== null) return 1;
  return oa.preco - ob.preco;
}

const compararPorEmbalagem = (a: Entrada, b: Entrada) => a.oferta.preco - b.oferta.preco;

function ofertaCasa(palavras: { texto: string; trigramas: Set<string> | null }[], nomeNorm: string): boolean {
  let palavrasDoNome: string[] | null = null;
  return palavras.every((p) => {
    if (nomeNorm.includes(p.texto)) return true;
    if (p.trigramas === null) return false;
    palavrasDoNome ??= nomeNorm.split(' ');
    return palavrasDoNome.some((w) => similaridadeDeTrigramas(p.trigramas!, trigramas(w)) >= LIMITE_SIMILARIDADE);
  });
}

/** Palavras da busca já normalizadas, ou `null` se a consulta é curta demais, longa demais ou tem palavras demais. */
function palavrasDaBusca(q: string): string[] | null {
  if (q.length > MAX_BRUTO) return null;
  const normalizada = normalizarTexto(q);
  const palavras = normalizada === '' ? [] : normalizada.split(' ');
  if (normalizada.length < MIN_CARACTERES || normalizada.length > MAX_CARACTERES || palavras.length > MAX_PALAVRAS) return null;
  return palavras;
}

/** A consulta é aceita pela busca (senão a busca devolve `[]`). */
export function consultaValida(q: string): boolean {
  return palavrasDaBusca(q) !== null;
}

/**
 * Busca produtos pelo nome (um código casa se alguma oferta dele casa), agrupa o mesmo código de barras entre os
 * mercados e ordena pelo preço (por unidade ou da embalagem). Consulta inválida devolve `[]`.
 * Devolve no máximo LIMITE_GRUPOS_BUSCA grupos. Varre todas as ofertas em memória: aceitável no piloto.
 */
export function buscarNoCatalogo(
  catalogo: Catalogo,
  { q, ordem, agora = new Date() }: { q: string; ordem: OrdemBusca; agora?: Date },
): GrupoProduto[] {
  const palavras = palavrasDaBusca(q);
  if (palavras === null) return [];

  const mercados = new Map(catalogo.mercados.map((m) => [m.id, m]));
  const consulta = palavras.map((texto) => ({
    texto,
    trigramas: texto.length >= MIN_LETRAS_APROXIMADA ? trigramas(texto) : null,
  }));
  // R24: casa por código de barras. O código entra na busca se ALGUMA oferta disponível dele casa;
  // então todas as ofertas disponíveis de mercados ativos desse código entram no grupo, mesmo as
  // que escrevem o nome de outro jeito (ex.: "Papel Hig. Neve").
  const porCodigo = new Map<string, { nome: string; nomeMercadoId: number; ofertas: Entrada[] }>();
  const codigosQueCasam = new Set<string>();
  for (const o of catalogo.ofertas) {
    if (codigosQueCasam.has(o.codigoBarras)) continue;
    if (ofertaCasa(consulta, o.nomeNorm)) codigosQueCasam.add(o.codigoBarras);
  }
  for (const o of catalogo.ofertas) {
    if (!codigosQueCasam.has(o.codigoBarras)) continue;
    const mercado = mercados.get(o.mercadoId);
    if (!mercado) continue;

    const atualizadoEm = new Date(o.precoAtualizadoEm);
    const calculado = precoPorUnidadeDaOferta(o);
    const item: Oferta = {
      mercadoId: mercado.id,
      mercadoNome: mercado.nome,
      endereco: mercado.endereco,
      nomeNoMercado: o.nome,
      preco: o.preco,
      quantidadeTexto: o.quantidadeTexto,
      ...calculado,
      atualizadoEm: o.precoAtualizadoEm,
      diasDesdeAtualizacao: diasDesde(atualizadoEm, agora),
      desatualizado: precoDesatualizado(atualizadoEm, agora),
    };
    const entrada: Entrada = { oferta: item, chaveUnidade: chaveUnidadeDaOferta(o, calculado.precoPorUnidade) };
    const grupo = porCodigo.get(o.codigoBarras);
    if (!grupo) {
      porCodigo.set(o.codigoBarras, { nome: o.nome, nomeMercadoId: mercado.id, ofertas: [entrada] });
      continue;
    }
    grupo.ofertas.push(entrada);
    // Nome do grupo: o mais comprido; em empate, o do mercado de menor id.
    const maisComprido = o.nome.length > grupo.nome.length;
    const empateMenorId = o.nome.length === grupo.nome.length && mercado.id < grupo.nomeMercadoId;
    if (maisComprido || empateMenorId) {
      grupo.nome = o.nome;
      grupo.nomeMercadoId = mercado.id;
    }
  }

  const compararOfertas = ordem === 'embalagem' ? compararPorEmbalagem : compararPorUnidade;
  const ordenadas = [...porCodigo].map(([codigoBarras, g]) => ({
    codigoBarras,
    nome: g.nome,
    entradas: g.ofertas.sort((a, b) => compararOfertas(a, b) || a.oferta.mercadoId - b.oferta.mercadoId),
  }));
  ordenadas.sort(
    (a, b) =>
      compararOfertas(a.entradas[0], b.entradas[0]) ||
      compararNomes(a.nome, b.nome) ||
      comparar(a.codigoBarras, b.codigoBarras),
  );
  return ordenadas.slice(0, LIMITE_GRUPOS_BUSCA).map((g) => ({
    codigoBarras: g.codigoBarras,
    nome: g.nome,
    ofertas: g.entradas.map((e) => e.oferta),
  }));
}

/** Mercados em ordem alfabética (pt-BR), cada um com o total de produtos disponíveis. */
export function mercadosDoCatalogo(catalogo: Catalogo): MercadoComTotal[] {
  const totais = new Map<number, number>();
  for (const o of catalogo.ofertas) totais.set(o.mercadoId, (totais.get(o.mercadoId) ?? 0) + 1);
  return catalogo.mercados
    .map((m) => ({ id: m.id, nome: m.nome, endereco: m.endereco, totalProdutos: totais.get(m.id) ?? 0 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id - b.id);
}

/** Uma página (PRODUTOS_POR_PAGINA itens, em ordem de nome) dos produtos do mercado; `null` se o mercado não existe no catálogo. */
export function produtosDoMercadoNoCatalogo(
  catalogo: Catalogo,
  mercadoId: number,
  pagina: number,
  agora: Date = new Date(),
): { itens: ProdutoMercado[]; total: number } | null {
  if (!catalogo.mercados.some((m) => m.id === mercadoId)) return null;
  const ofertas = catalogo.ofertas
    .filter((o) => o.mercadoId === mercadoId)
    .sort((a, b) => comparar(a.nomeNorm, b.nomeNorm) || comparar(a.codigoBarras, b.codigoBarras));
  const inicio = (pagina - 1) * PRODUTOS_POR_PAGINA;
  return {
    itens: ofertas.slice(inicio, inicio + PRODUTOS_POR_PAGINA).map((o) => {
      const atualizadoEm = new Date(o.precoAtualizadoEm);
      return {
        codigoBarras: o.codigoBarras,
        nome: o.nome,
        preco: o.preco,
        quantidadeTexto: o.quantidadeTexto,
        ...precoPorUnidadeDaOferta(o),
        atualizadoEm: o.precoAtualizadoEm,
        diasDesdeAtualizacao: diasDesde(atualizadoEm, agora),
        desatualizado: precoDesatualizado(atualizadoEm, agora),
      };
    }),
    total: ofertas.length,
  };
}
