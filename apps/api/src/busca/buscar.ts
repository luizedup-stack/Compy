import { normalizarTexto, precoPorUnidade, type GrupoProduto, type Oferta, type Unidade } from '@mercado/shared';
import type { OfertaArmazenada, Repositorio } from '../repositorio';
import { diasDesde, precoDesatualizado } from '../tempo';
import { similaridadeDeTrigramas, trigramas } from './similaridade';

export type OrdemBusca = 'unidade' | 'embalagem';

const MIN_CARACTERES = 2;
const MAX_CARACTERES = 100;
/** Texto bruto maior que isto é recusado antes mesmo de normalizar. */
const MAX_BRUTO = 1000;
const MAX_PALAVRAS = 8;
const MAX_TERMO_REGISTRADO = 200;
const MIN_LETRAS_APROXIMADA = 4;
const LIMITE_SIMILARIDADE = 0.35;
/** Ordem fixa das unidades: grupos de kg antes de L, un e rolo. */
const ORDEM_UNIDADES: readonly Unidade[] = ['kg', 'L', 'un', 'rolo'];

/** Preço por unidade de uma oferta guardada (a partir da quantidade entendida; `null` se não houver). */
export function precoPorUnidadeDaOferta(o: OfertaArmazenada): {
  precoPorUnidade: number | null;
  unidade: Unidade | null;
} {
  if (o.quantidadeTexto === null || o.quantidadeValor === null || o.quantidadeUnidade === null) {
    return { precoPorUnidade: null, unidade: null };
  }
  const ppu = precoPorUnidade(o.preco, {
    texto: o.quantidadeTexto,
    valor: o.quantidadeValor,
    unidade: o.quantidadeUnidade,
  });
  return ppu === null ? { precoPorUnidade: null, unidade: null } : { precoPorUnidade: ppu, unidade: o.quantidadeUnidade };
}

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Nomes comparados sem depender de caixa ou acento; só então o texto cru decide. */
const compararNomes = (a: string, b: string) =>
  comparar(normalizarTexto(a), normalizarTexto(b)) || comparar(a, b);

/** Uma oferta do grupo com a chave de ordenação por unidade (preço bruto por unidade). */
interface Entrada {
  oferta: Oferta;
  /** `preco / quantidadeValor` em milionésimos (inteiro): sem o arredondamento de 2 casas mostrado ao usuário e sem ruído de ponto flutuante. `null` sem unidade. */
  chaveUnidade: number | null;
}

const ESCALA_CHAVE = 1e6;

function chaveUnidadeDaOferta(o: OfertaArmazenada, mostrado: number | null): number | null {
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

/**
 * Busca produtos pelo nome (um código casa se alguma oferta dele casa), agrupa o mesmo código de barras entre os mercados e ordena pelo preço
 * (por unidade ou da embalagem). Uma consulta curta demais, longa demais ou com palavras demais
 * devolve `[]` e não é registrada; toda outra busca é registrada, mesmo sem resultado.
 * Varre todas as ofertas em memória: aceitável no piloto (com banco, o filtro iria para a consulta).
 */
export async function buscar(
  repo: Repositorio,
  { q, ordem, usuarioId }: { q: string; ordem: OrdemBusca; usuarioId?: number },
): Promise<GrupoProduto[]> {
  if (q.length > MAX_BRUTO) return [];
  const normalizada = normalizarTexto(q);
  const palavras = normalizada === '' ? [] : normalizada.split(' ');
  if (normalizada.length < MIN_CARACTERES || normalizada.length > MAX_CARACTERES || palavras.length > MAX_PALAVRAS) {
    return [];
  }

  const agora = new Date();
  const consulta = palavras.map((texto) => ({
    texto,
    trigramas: texto.length >= MIN_LETRAS_APROXIMADA ? trigramas(texto) : null,
  }));
  // R24: casa por código de barras. O código entra na busca se ALGUMA oferta disponível dele casa;
  // então todas as ofertas disponíveis de mercados ativos desse código entram no grupo, mesmo as
  // que escrevem o nome de outro jeito (ex.: "Papel Hig. Neve").
  const porCodigo = new Map<string, { nome: string; nomeMercadoId: number; ofertas: Entrada[] }>();
  const codigosQueCasam = new Set<string>();
  const todas = await repo.listarOfertasParaBusca();
  for (const { oferta: o } of todas) {
    if (codigosQueCasam.has(o.codigoBarras)) continue;
    if (ofertaCasa(consulta, o.nomeNorm)) codigosQueCasam.add(o.codigoBarras);
  }
  for (const { oferta: o, mercado } of todas) {
    if (!codigosQueCasam.has(o.codigoBarras)) continue;

    const calculado = precoPorUnidadeDaOferta(o);
    const item: Oferta = {
      mercadoId: mercado.id,
      mercadoNome: mercado.nome,
      endereco: mercado.endereco,
      nomeNoMercado: o.nome,
      preco: o.preco,
      quantidadeTexto: o.quantidadeTexto,
      ...calculado,
      atualizadoEm: o.precoAtualizadoEm.toISOString(),
      diasDesdeAtualizacao: diasDesde(o.precoAtualizadoEm, agora),
      desatualizado: precoDesatualizado(o.precoAtualizadoEm, agora),
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
  const grupos: GrupoProduto[] = ordenadas.map((g) => ({
    codigoBarras: g.codigoBarras,
    nome: g.nome,
    ofertas: g.entradas.map((e) => e.oferta),
  }));

  const mercados = new Set<number>();
  for (const g of grupos) for (const o of g.ofertas) mercados.add(o.mercadoId);
  await repo.registrarBusca({
    usuarioId: usuarioId ?? null,
    termo: q.trim().slice(0, MAX_TERMO_REGISTRADO),
    resultados: grupos.length,
    mercadosDistintos: mercados.size,
  });
  return grupos;
}
