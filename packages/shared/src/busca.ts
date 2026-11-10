import { DIAS_PRECO_VELHO, caminhoDaFoto, type GrupoProduto, type Oferta, type ProdutoMercado, type Unidade } from './constantes';
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
/** Produtos por página na lista da tela inicial do aplicativo. */
export const PRODUTOS_POR_PAGINA_INICIO = 30;

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
  /** Preço de promoção (vale entre `promocaoInicio` e `promocaoFim`, se for menor que `preco`). Ausente = sem promoção. */
  precoPromocional?: number | null;
  promocaoInicio?: string | null;
  promocaoFim?: string | null;
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
  /** Códigos de barras que têm foto na API. Ausente = a fonte não informa fotos (os produtos saem sem o campo `foto`). */
  comFoto?: string[];
  /** Dos códigos com foto, os cuja foto é só ilustrativa (a do tipo de produto). */
  fotosIlustrativas?: string[];
  /** true quando esta cópia traz só parte dos produtos (os mais úteis para comparar): a busca no servidor continua completa. */
  parcial?: boolean;
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
 * Chave de comparação de uma oferta (já com o preço de PROMOÇÃO, quando ela está valendo): o preço da embalagem, a unidade e o
 * preço por unidade (milionésimos, inteiro).
 */
interface Chave {
  preco: number;
  unidade: Unidade | null;
  /** `preco / quantidadeValor` em milionésimos (inteiro): sem o arredondamento de 2 casas mostrado ao usuário e sem ruído de ponto flutuante. `null` sem unidade. */
  chaveUnidade: number | null;
}

/** Uma oferta do grupo com a chave de ordenação. */
interface Entrada {
  oferta: Oferta;
  chave: Chave;
}

const ESCALA_CHAVE = 1e6;

function chaveUnidadeDaOferta(preco: number, quantidadeValor: number | null, mostrado: number | null): number | null {
  if (mostrado === null || quantidadeValor === null) return null;
  return Math.round((preco / quantidadeValor) * ESCALA_CHAVE);
}

/**
 * Compara duas chaves. Por unidade: com unidade primeiro (kg, L, un, rolo; a mais barata antes), depois as sem, por preço.
 * Por embalagem: só o preço. `sentido` -1 inverte só a parte do PREÇO (a ordem das unidades e "com unidade antes de sem" não muda).
 */
function compararChaves(a: Chave, b: Chave, ordem: OrdemBusca, sentido: 1 | -1 = 1): number {
  if (ordem === 'embalagem') return (a.preco - b.preco) * sentido;
  if (a.chaveUnidade !== null && a.unidade !== null) {
    if (b.chaveUnidade === null || b.unidade === null) return -1;
    const porUnidade = ORDEM_UNIDADES.indexOf(a.unidade) - ORDEM_UNIDADES.indexOf(b.unidade);
    return porUnidade !== 0 ? porUnidade : (a.chaveUnidade - b.chaveUnidade) * sentido;
  }
  if (b.chaveUnidade !== null && b.unidade !== null) return 1;
  return (a.preco - b.preco) * sentido;
}

/** Promoção valendo agora: preço promocional menor que o normal e `agora` dentro do período (início e fim são opcionais). */
export function promocaoAtiva(
  o: { preco: number; precoPromocional?: number | null; promocaoInicio?: string | null; promocaoFim?: string | null },
  agora: Date = new Date(),
): boolean {
  if (o.precoPromocional === undefined || o.precoPromocional === null) return false;
  if (!(o.precoPromocional > 0) || !(o.precoPromocional < o.preco)) return false;
  const t = agora.getTime();
  if (o.promocaoInicio && Date.parse(o.promocaoInicio) > t) return false;
  if (o.promocaoFim && Date.parse(o.promocaoFim) < t) return false;
  return true;
}

/** Uma oferta do catálogo já avaliada: preço que vale agora (promoção ou normal), unidade e chave de ordenação. */
interface Avaliada {
  o: OfertaCatalogo;
  /** Preço que vale agora. */
  preco: number;
  /** Preço normal, quando há promoção valendo; senão `null`. */
  precoOriginal: number | null;
  calculado: { precoPorUnidade: number | null; unidade: Unidade | null };
  chave: Chave;
}

function avaliar(o: OfertaCatalogo, agora: Date): Avaliada {
  const emPromocao = promocaoAtiva(o, agora);
  const preco = emPromocao ? (o.precoPromocional as number) : o.preco;
  const calculado = precoPorUnidadeDaOferta({ ...o, preco });
  return {
    o,
    preco,
    precoOriginal: emPromocao ? o.preco : null,
    calculado,
    chave: { preco, unidade: calculado.unidade, chaveUnidade: chaveUnidadeDaOferta(preco, o.quantidadeValor, calculado.precoPorUnidade) },
  };
}

/**
 * Filtros da busca e da lista (todos opcionais). Os de preço, quantidade, comércio e promoção valem para cada OFERTA (o produto
 * aparece só com as ofertas que passam, e some se nenhuma passar); `soComparaveis` vale para o produto (precisa de 2 ou mais ofertas que passaram).
 */
export interface Filtros {
  /** Preço da embalagem que vale agora (promoção, se houver). */
  precoMin?: number;
  precoMax?: number;
  /** Faixa de quantidade na `unidade` escolhida (ex.: de 1 a 5 kg). Sem `unidade`, a faixa é ignorada. */
  quantidadeMin?: number;
  quantidadeMax?: number;
  unidade?: Unidade;
  /** Só ofertas destes comércios (ids). */
  mercadoIds?: number[];
  soPromocao?: boolean;
  soComparaveis?: boolean;
}

export type CriterioOrdem = 'relevancia' | 'menor-preco' | 'maior-preco' | 'recentes';
export const CRITERIOS_ORDEM: readonly CriterioOrdem[] = ['relevancia', 'menor-preco', 'maior-preco', 'recentes'];

/** Algum filtro que exige conhecer o preço de cada oferta (tudo menos "só comparáveis", que só conta ofertas). */
const temFiltroDeOferta = (f: Filtros | undefined): boolean =>
  !!f &&
  (f.precoMin !== undefined ||
    f.precoMax !== undefined ||
    f.unidade !== undefined ||
    (f.mercadoIds !== undefined && f.mercadoIds.length > 0) ||
    f.soPromocao === true);

function passaNosFiltros(a: Avaliada, f: Filtros | undefined, mercadosPermitidos: Set<number> | null): boolean {
  if (!f) return true;
  if (f.precoMin !== undefined && a.preco < f.precoMin) return false;
  if (f.precoMax !== undefined && a.preco > f.precoMax) return false;
  if (mercadosPermitidos && !mercadosPermitidos.has(a.o.mercadoId)) return false;
  if (f.soPromocao && a.precoOriginal === null) return false;
  if (f.unidade !== undefined) {
    if (a.o.quantidadeUnidade !== f.unidade) return false;
    const q = a.o.quantidadeValor;
    if (f.quantidadeMin !== undefined && (q === null || q < f.quantidadeMin)) return false;
    if (f.quantidadeMax !== undefined && (q === null || q > f.quantidadeMax)) return false;
  }
  return true;
}

/** Resumo de um produto (código de barras) para ordenar a lista sem montar o grupo inteiro. */
interface Resumo {
  codigo: string;
  nome: string;
  nomeMercadoId: number;
  /** Quantas ofertas (de comércios) passaram nos filtros. */
  n: number;
  /** A melhor oferta (a mais barata pela ordem escolhida). Só existe quando o preço foi avaliado. */
  melhor: Chave | null;
  /** A data de atualização mais recente entre as ofertas (texto ISO, que ordena como data). */
  recente: string;
}

/**
 * Passada leve sobre as ofertas: um Resumo por código. `codigos` limita a quais códigos entram (`null` = todos). Sem filtro de
 * oferta e sem precisar do preço (`precisaDoPreco` falso), só conta ofertas e escolhe o nome (rápido mesmo com dezenas de milhares).
 */
function resumir(
  catalogo: Catalogo,
  codigos: Set<string> | null,
  ordem: OrdemBusca,
  filtros: Filtros | undefined,
  precisaDoPreco: boolean,
  agora: Date,
): Map<string, Resumo> {
  const mercadosExistentes = new Set(catalogo.mercados.map((m) => m.id));
  const permitidos = filtros?.mercadoIds && filtros.mercadoIds.length > 0 ? new Set(filtros.mercadoIds) : null;
  const filtraOferta = temFiltroDeOferta(filtros);
  const resumos = new Map<string, Resumo>();
  for (const o of catalogo.ofertas) {
    if (codigos && !codigos.has(o.codigoBarras)) continue;
    if (!mercadosExistentes.has(o.mercadoId)) continue;
    let chave: Chave | null = null;
    if (filtraOferta || precisaDoPreco) {
      const a = avaliar(o, agora);
      if (filtraOferta && !passaNosFiltros(a, filtros, permitidos)) continue;
      chave = a.chave;
    }
    const r = resumos.get(o.codigoBarras);
    if (!r) {
      resumos.set(o.codigoBarras, { codigo: o.codigoBarras, nome: o.nome, nomeMercadoId: o.mercadoId, n: 1, melhor: chave, recente: o.precoAtualizadoEm });
      continue;
    }
    r.n += 1;
    // Nome do grupo: o mais comprido; em empate, o do mercado de menor id.
    const maisComprido = o.nome.length > r.nome.length;
    const empateMenorId = o.nome.length === r.nome.length && o.mercadoId < r.nomeMercadoId;
    if (maisComprido || empateMenorId) {
      r.nome = o.nome;
      r.nomeMercadoId = o.mercadoId;
    }
    if (chave !== null && (r.melhor === null || compararChaves(chave, r.melhor, ordem) < 0)) r.melhor = chave;
    if (o.precoAtualizadoEm > r.recente) r.recente = o.precoAtualizadoEm;
  }
  return resumos;
}

/** Ordena os resumos pelo critério escolhido. `exatos` (só na busca): códigos em que alguma oferta tem TODAS as palavras escritas por inteiro. */
function ordenarResumos(lista: Resumo[], criterio: CriterioOrdem, ordem: OrdemBusca, exatos: Set<string> | null): Resumo[] {
  const nomes = (a: Resumo, b: Resumo) => compararNomes(a.nome, b.nome) || comparar(a.codigo, b.codigo);
  const preco = (a: Resumo, b: Resumo, sentido: 1 | -1) => (a.melhor && b.melhor ? compararChaves(a.melhor, b.melhor, ordem, sentido) : 0);
  switch (criterio) {
    case 'menor-preco':
      return lista.sort((a, b) => preco(a, b, 1) || nomes(a, b));
    case 'maior-preco':
      return lista.sort((a, b) => preco(a, b, -1) || nomes(a, b));
    case 'recentes':
      return lista.sort((a, b) => comparar(b.recente, a.recente) || preco(a, b, 1) || nomes(a, b));
    default: // relevância: o que casa por inteiro com o que foi digitado, depois o vendido em mais comércios (sem busca, só esta segunda parte)
      return lista.sort((a, b) => {
        const ea = exatos?.has(a.codigo) ? 1 : 0;
        const eb = exatos?.has(b.codigo) ? 1 : 0;
        return eb - ea || b.n - a.n || nomes(a, b);
      });
  }
}

/**
 * Monta os grupos completos dos `codigos` (na ordem dada): as ofertas de cada produto, já com o preço que vale agora e ordenadas pela
 * opção `ordem` (a primeira é a mais barata), respeitando os filtros. Todas as ofertas disponíveis de comércios ativos de um código
 * entram, mesmo as que escrevem o nome de outro jeito (ex.: "Papel Hig. Neve").
 */
function montarGrupos(catalogo: Catalogo, codigos: string[], ordem: OrdemBusca, filtros: Filtros | undefined, agora: Date): GrupoProduto[] {
  const conjunto = new Set(codigos);
  const mercados = new Map(catalogo.mercados.map((m) => [m.id, m]));
  const permitidos = filtros?.mercadoIds && filtros.mercadoIds.length > 0 ? new Set(filtros.mercadoIds) : null;
  const porCodigo = new Map<string, { nome: string; nomeMercadoId: number; entradas: Entrada[] }>();
  for (const o of catalogo.ofertas) {
    if (!conjunto.has(o.codigoBarras)) continue;
    const mercado = mercados.get(o.mercadoId);
    if (!mercado) continue;
    const a = avaliar(o, agora);
    if (!passaNosFiltros(a, filtros, permitidos)) continue;

    const atualizadoEm = new Date(o.precoAtualizadoEm);
    const item: Oferta = {
      mercadoId: mercado.id,
      mercadoNome: mercado.nome,
      endereco: mercado.endereco,
      nomeNoMercado: o.nome,
      preco: a.preco,
      quantidadeTexto: o.quantidadeTexto,
      ...a.calculado,
      atualizadoEm: o.precoAtualizadoEm,
      diasDesdeAtualizacao: diasDesde(atualizadoEm, agora),
      desatualizado: precoDesatualizado(atualizadoEm, agora),
      ...(a.precoOriginal !== null ? { precoOriginal: a.precoOriginal, promocaoAte: o.promocaoFim ?? null } : {}),
    };
    const entrada: Entrada = { oferta: item, chave: a.chave };
    const grupo = porCodigo.get(o.codigoBarras);
    if (!grupo) {
      porCodigo.set(o.codigoBarras, { nome: o.nome, nomeMercadoId: mercado.id, entradas: [entrada] });
      continue;
    }
    grupo.entradas.push(entrada);
    const maisComprido = o.nome.length > grupo.nome.length;
    const empateMenorId = o.nome.length === grupo.nome.length && mercado.id < grupo.nomeMercadoId;
    if (maisComprido || empateMenorId) {
      grupo.nome = o.nome;
      grupo.nomeMercadoId = mercado.id;
    }
  }
  const grupos: GrupoProduto[] = [];
  for (const codigo of codigos) {
    const g = porCodigo.get(codigo);
    if (!g) continue;
    g.entradas.sort((a, b) => compararChaves(a.chave, b.chave, ordem) || a.oferta.mercadoId - b.oferta.mercadoId);
    grupos.push({ codigoBarras: codigo, nome: g.nome, ofertas: g.entradas.map((e) => e.oferta), ...campoFoto(catalogo, codigo) });
  }
  return grupos;
}

/** O campo `foto` só existe quando o catálogo informa quais produtos têm foto (`comFoto`). */
const conjuntosDeFoto = new WeakMap<string[], Set<string>>();
const conjuntoDe = (lista: string[]): Set<string> => {
  let conjunto = conjuntosDeFoto.get(lista);
  if (!conjunto) conjuntosDeFoto.set(lista, (conjunto = new Set(lista)));
  return conjunto;
};
function campoFoto(catalogo: Catalogo, codigoBarras: string): { foto?: string | null; fotoIlustrativa?: boolean } {
  if (!catalogo.comFoto) return {};
  if (!conjuntoDe(catalogo.comFoto).has(codigoBarras)) return { foto: null };
  const ilustrativa = catalogo.fotosIlustrativas ? conjuntoDe(catalogo.fotosIlustrativas).has(codigoBarras) : false;
  return { foto: caminhoDaFoto(codigoBarras), ...(ilustrativa ? { fotoIlustrativa: true } : {}) };
}

/** Resumos prontos para ordenar, já sem os produtos que ficaram sem oferta (ou com só uma, se `soComparaveis`). */
function listaDeResumos(resumos: Map<string, Resumo>, filtros: Filtros | undefined): Resumo[] {
  const lista = [...resumos.values()];
  return filtros?.soComparaveis ? lista.filter((r) => r.n >= 2) : lista;
}

/**
 * Busca produtos pelo nome (um código casa se alguma oferta dele casa), agrupa o mesmo código de barras entre os
 * comércios e ordena pelo critério (`menor-preco`, `maior-preco`, `recentes` ou `relevancia`). Sem `criterio`, ordena por menor preço
 * (como sempre foi). `ordem` diz se o preço comparado é por unidade ou da embalagem. Consulta inválida devolve `[]`.
 * Devolve no máximo LIMITE_GRUPOS_BUSCA grupos. Varre todas as ofertas em memória: aceitável no piloto.
 */
export function buscarNoCatalogo(
  catalogo: Catalogo,
  { q, ordem, criterio, filtros, agora = new Date() }: { q: string; ordem: OrdemBusca; criterio?: CriterioOrdem; filtros?: Filtros; agora?: Date },
): GrupoProduto[] {
  const palavras = palavrasDaBusca(q);
  if (palavras === null) return [];

  const consulta = palavras.map((texto) => ({
    texto,
    trigramas: texto.length >= MIN_LETRAS_APROXIMADA ? trigramas(texto) : null,
  }));
  // R24: casa por código de barras. O código entra na busca se ALGUMA oferta disponível dele casa.
  const codigosQueCasam = new Set<string>();
  const exatos = new Set<string>();
  for (const o of catalogo.ofertas) {
    if (!exatos.has(o.codigoBarras) && palavras.every((p) => o.nomeNorm.includes(p))) exatos.add(o.codigoBarras);
    if (codigosQueCasam.has(o.codigoBarras)) continue;
    if (ofertaCasa(consulta, o.nomeNorm)) codigosQueCasam.add(o.codigoBarras);
  }
  const resumos = resumir(catalogo, codigosQueCasam, ordem, filtros, true, agora);
  const ordenados = ordenarResumos(listaDeResumos(resumos, filtros), criterio ?? 'menor-preco', ordem, exatos);
  return montarGrupos(catalogo, ordenados.slice(0, LIMITE_GRUPOS_BUSCA).map((r) => r.codigo), ordem, filtros, agora);
}

/**
 * Lista de produtos da tela inicial (quando a pessoa ainda não digitou nada), já com a comparação entre comércios.
 * Sem `criterio` (ou em `relevancia`), vêm primeiro os produtos vendidos em MAIS DE UM comércio (os que dá para comparar), do que está em
 * mais para o que está em menos; depois os vendidos em um só; dentro de cada faixa, ordem alfabética. Os outros critérios e os `filtros`
 * funcionam como na busca. As ofertas de cada produto seguem a ordem escolhida (a primeira é a mais barata). Devolve a página pedida
 * (`pagina` começa em 1) e o total de produtos.
 */
export function listarProdutosNoCatalogo(
  catalogo: Catalogo,
  { ordem, criterio, filtros, pagina = 1, agora = new Date() }: { ordem: OrdemBusca; criterio?: CriterioOrdem; filtros?: Filtros; pagina?: number; agora?: Date },
): { grupos: GrupoProduto[]; total: number } {
  // Com dezenas de milhares de ofertas, montar o grupo completo de TODOS os produtos só para mostrar 30 seria lento
  // (segundos). Por isso: 1) um resumo leve por código; 2) a ordenação da lista com esse resumo; 3) só então a montagem
  // completa dos grupos da página pedida. No caso comum (relevância, sem filtros) o resumo nem avalia preços.
  const c = criterio ?? 'relevancia';
  const resumos = resumir(catalogo, null, ordem, filtros, c !== 'relevancia', agora);
  const lista = ordenarResumos(listaDeResumos(resumos, filtros), c, ordem, null);
  const inicio = (Math.max(1, pagina) - 1) * PRODUTOS_POR_PAGINA_INICIO;
  const daPagina = lista.slice(inicio, inicio + PRODUTOS_POR_PAGINA_INICIO);
  return { grupos: montarGrupos(catalogo, daPagina.map((r) => r.codigo), ordem, filtros, agora), total: lista.length };
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
      const a = avaliar(o, agora);
      return {
        codigoBarras: o.codigoBarras,
        nome: o.nome,
        preco: a.preco,
        quantidadeTexto: o.quantidadeTexto,
        ...a.calculado,
        ...(a.precoOriginal !== null ? { precoOriginal: a.precoOriginal, promocaoAte: o.promocaoFim ?? null } : {}),
        atualizadoEm: o.precoAtualizadoEm,
        diasDesdeAtualizacao: diasDesde(atualizadoEm, agora),
        desatualizado: precoDesatualizado(atualizadoEm, agora),
        ...campoFoto(catalogo, o.codigoBarras),
      };
    }),
    total: ofertas.length,
  };
}
