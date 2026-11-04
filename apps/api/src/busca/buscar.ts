import { normalizarTexto, precoPorUnidade, type GrupoProduto, type Oferta, type Unidade } from '@mercado/shared';
import type { OfertaArmazenada, Repositorio } from '../repositorio';
import { diasDesde, precoDesatualizado } from '../tempo';
import { similaridade } from './similaridade';

export type OrdemBusca = 'unidade' | 'embalagem';

const MIN_CARACTERES = 2;
const MAX_CARACTERES = 100;
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

function palavraCasa(palavra: string, nomeNorm: string, palavrasDoNome: string[]): boolean {
  if (nomeNorm.includes(palavra)) return true;
  if (palavra.length < MIN_LETRAS_APROXIMADA) return false;
  return palavrasDoNome.some((w) => similaridade(palavra, w) >= LIMITE_SIMILARIDADE);
}

/** Por preço por unidade: com unidade primeiro (kg, L, un, rolo; a mais barata antes), depois as sem, por preço. */
function compararPorUnidade(a: Oferta, b: Oferta): number {
  if (a.precoPorUnidade !== null && a.unidade !== null) {
    if (b.precoPorUnidade === null || b.unidade === null) return -1;
    const porUnidade = ORDEM_UNIDADES.indexOf(a.unidade) - ORDEM_UNIDADES.indexOf(b.unidade);
    return porUnidade !== 0 ? porUnidade : a.precoPorUnidade - b.precoPorUnidade;
  }
  if (b.precoPorUnidade !== null && b.unidade !== null) return 1;
  return a.preco - b.preco;
}

const compararPorEmbalagem = (a: Oferta, b: Oferta) => a.preco - b.preco;

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
  const normalizada = normalizarTexto(q);
  const palavras = normalizada === '' ? [] : normalizada.split(' ');
  if (normalizada.length < MIN_CARACTERES || normalizada.length > MAX_CARACTERES || palavras.length > MAX_PALAVRAS) {
    return [];
  }

  const agora = new Date();
  // R24: casa por código de barras. O código entra na busca se ALGUMA oferta disponível dele casa;
  // então todas as ofertas disponíveis de mercados ativos desse código entram no grupo, mesmo as
  // que escrevem o nome de outro jeito (ex.: "Papel Hig. Neve").
  const porCodigo = new Map<string, { nome: string; nomeMercadoId: number; ofertas: Oferta[] }>();
  const codigosQueCasam = new Set<string>();
  const todas = await repo.listarOfertasParaBusca();
  for (const { oferta: o } of todas) {
    if (codigosQueCasam.has(o.codigoBarras)) continue;
    const palavrasDoNome = o.nomeNorm.split(' ');
    if (palavras.every((p) => palavraCasa(p, o.nomeNorm, palavrasDoNome))) codigosQueCasam.add(o.codigoBarras);
  }
  for (const { oferta: o, mercado } of todas) {
    if (!codigosQueCasam.has(o.codigoBarras)) continue;

    const item: Oferta = {
      mercadoId: mercado.id,
      mercadoNome: mercado.nome,
      endereco: mercado.endereco,
      nomeNoMercado: o.nome,
      preco: o.preco,
      quantidadeTexto: o.quantidadeTexto,
      ...precoPorUnidadeDaOferta(o),
      atualizadoEm: o.precoAtualizadoEm.toISOString(),
      diasDesdeAtualizacao: diasDesde(o.precoAtualizadoEm, agora),
      desatualizado: precoDesatualizado(o.precoAtualizadoEm, agora),
    };
    const grupo = porCodigo.get(o.codigoBarras);
    if (!grupo) {
      porCodigo.set(o.codigoBarras, { nome: o.nome, nomeMercadoId: mercado.id, ofertas: [item] });
      continue;
    }
    grupo.ofertas.push(item);
    // Nome do grupo: o mais comprido; em empate, o do mercado de menor id.
    const maisComprido = o.nome.length > grupo.nome.length;
    const empateMenorId = o.nome.length === grupo.nome.length && mercado.id < grupo.nomeMercadoId;
    if (maisComprido || empateMenorId) {
      grupo.nome = o.nome;
      grupo.nomeMercadoId = mercado.id;
    }
  }

  const compararOfertas = ordem === 'embalagem' ? compararPorEmbalagem : compararPorUnidade;
  const grupos = [...porCodigo].map(
    ([codigoBarras, g]): GrupoProduto => ({
      codigoBarras,
      nome: g.nome,
      ofertas: g.ofertas.sort((a, b) => compararOfertas(a, b) || a.mercadoId - b.mercadoId),
    }),
  );
  grupos.sort(
    (a, b) =>
      compararOfertas(a.ofertas[0], b.ofertas[0]) ||
      comparar(a.nome, b.nome) ||
      comparar(a.codigoBarras, b.codigoBarras),
  );

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
