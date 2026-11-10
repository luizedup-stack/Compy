// Promoções pagas: leitura da aba "Descontos", pedido retido até o pagamento e aplicação da planilha.
//
// Como funciona (veja docs/superpowers/specs/2026-11-10-produtos-descontos-design.md):
//  1. O comércio envia a planilha. Se ela tem a aba "Descontos" com linhas válidas, NADA é salvo: a planilha (produtos, fotos e
//     descontos) fica retida num "pedido de promoções" aguardando pagamento (Pix manual: o valor e a chave Pix vêm da Configuracao).
//  2. A dona confere o Pix e marca o pedido como pago (administração). Só então a planilha é aplicada (`aplicarPlanilha`).
//  3. Cada linha de desconto = 1 promoção = o valor por promoção (padrão R$ 5,00, em centavos).
import { VALOR_PADRAO_PROMOCAO_CENTAVOS, parsePreco, validarCodigoBarras } from '@mercado/shared';
import type { OfertaArmazenada, Repositorio } from '../repositorio';

export const CHAVE_VALOR_PROMOCAO = 'promocao.valorCentavos';
export const CHAVE_PIX = 'pix.chave';
export const MAX_TAMANHO_CHAVE_PIX = 140;
/** Uma promoção não pode terminar daqui a mais que isto (evita datas digitadas errado, como o ano 2062). */
const MAX_DIAS_A_FRENTE = 366;

/** Uma linha da aba Descontos já conferida: o preço promocional vale de `inicio` (ou de quando for liberada) até `fim`. */
export interface Desconto {
  codigoBarras: string;
  precoPromocional: number;
  /** ISO 8601, ou null = vale a partir da liberação. */
  inicio: string | null;
  /** ISO 8601: o fim do dia (horário de Brasília) escolhido em "Válido até". */
  fim: string;
  linha: number;
}

/** A planilha já lida, como fica guardada no pedido retido. */
export interface PlanilhaRetida {
  ofertas: Omit<OfertaArmazenada, 'mercadoId' | 'precoAtualizadoEm'>[];
  /** código de barras → link da foto. */
  fotos: [string, string][];
  descontos: Desconto[];
}

type Erro = { linha: number; motivo: string };

// ---------------------------------------------------------------------------------------------------------------------
// Valor por promoção e chave Pix (configurações da dona)

/** Valor de cada promoção, em centavos (padrão R$ 5,00). Configuração inválida volta ao padrão. */
export async function valorPorPromocaoCentavos(repo: Repositorio): Promise<number> {
  const bruto = await repo.acharConfiguracao(CHAVE_VALOR_PROMOCAO);
  const n = bruto === null ? NaN : Number(bruto);
  return Number.isInteger(n) && n >= 0 ? n : VALOR_PADRAO_PROMOCAO_CENTAVOS;
}

export async function chavePix(repo: Repositorio): Promise<string | null> {
  const chave = (await repo.acharConfiguracao(CHAVE_PIX))?.trim();
  return chave ? chave : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Datas da planilha

/**
 * Lê o DIA de uma célula: texto "dd/mm/aaaa" (ou "dd/mm/aa"), "aaaa-mm-dd", uma data do Excel (já em ISO) ou o número de série do Excel.
 * Devolve `null` se não for uma data de calendário válida.
 */
export function lerDia(v: string | number | null): { a: number; m: number; d: number } | null {
  if (v === null) return null;
  let a: number, m: number, d: number;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 1 || v > 80000) return null;
    const data = new Date(Math.round((v - 25569) * 86400000)); // série do Excel → data (UTC)
    a = data.getUTCFullYear(); m = data.getUTCMonth() + 1; d = data.getUTCDate();
  } else {
    const t = v.trim();
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(t);
    if (br) { d = Number(br[1]); m = Number(br[2]); a = Number(br[3]); if (a < 100) a += 2000; }
    else if (iso) { a = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
    else return null;
  }
  const conferida = new Date(Date.UTC(a, m - 1, d));
  if (conferida.getUTCFullYear() !== a || conferida.getUTCMonth() !== m - 1 || conferida.getUTCDate() !== d) return null;
  return { a, m, d };
}

/** Começo do dia no horário de Brasília (UTC−3) como ISO. */
const inicioDoDia = ({ a, m, d }: { a: number; m: number; d: number }) => new Date(Date.UTC(a, m - 1, d, 3, 0, 0, 0)).toISOString();
/** Fim do dia no horário de Brasília (UTC−3) como ISO. */
const fimDoDia = ({ a, m, d }: { a: number; m: number; d: number }) => new Date(Date.UTC(a, m - 1, d + 1, 2, 59, 59, 999)).toISOString();

// ---------------------------------------------------------------------------------------------------------------------
// Leitura e conferência da aba Descontos

/**
 * Confere uma linha da aba Descontos (formato dos campos): código de barras, preço promocional e o período. Não olha o preço
 * normal do produto (isso é `conferirDescontos`). `agora` serve para recusar "Válido até" no passado.
 */
export function lerLinhaDeDesconto(
  linha: number,
  campos: { codigo: string | number | null; preco: string | number | null; de: string | number | null; ate: string | number | null },
  agora: Date,
): { ok: true; desconto: Desconto } | { ok: false; motivo: string } {
  const barras = validarCodigoBarras(typeof campos.codigo === 'number' ? campos.codigo : (campos.codigo ?? ''));
  if (!barras.ok) return { ok: false, motivo: barras.motivo };
  const preco = campos.preco === null ? null : parsePreco(campos.preco);
  if (preco === null) return { ok: false, motivo: `Preço promocional inválido: ${campos.preco ?? 'em branco'}` };

  const ateBruto = campos.ate === null || String(campos.ate).trim() === '' ? null : campos.ate;
  if (ateBruto === null) return { ok: false, motivo: 'Preencha "Válido até" (o último dia da promoção)' };
  const ate = lerDia(ateBruto);
  if (!ate) return { ok: false, motivo: `Data inválida em "Válido até": ${ateBruto} (use dia/mês/ano, por exemplo 25/12/2026)` };
  const fim = fimDoDia(ate);
  if (Date.parse(fim) < agora.getTime()) return { ok: false, motivo: `A promoção já acabou: "Válido até" ${ateBruto} já passou` };
  if (Date.parse(fim) - agora.getTime() > MAX_DIAS_A_FRENTE * 86400000) {
    return { ok: false, motivo: `"Válido até" ${ateBruto} está longe demais (o máximo é ${MAX_DIAS_A_FRENTE} dias)` };
  }

  let inicio: string | null = null;
  const deBruto = campos.de === null || String(campos.de).trim() === '' ? null : campos.de;
  if (deBruto !== null) {
    const de = lerDia(deBruto);
    if (!de) return { ok: false, motivo: `Data inválida em "Válido de": ${deBruto} (use dia/mês/ano)` };
    inicio = inicioDoDia(de);
    if (Date.parse(inicio) > Date.parse(fim)) return { ok: false, motivo: '"Válido de" não pode ser depois de "Válido até"' };
  }
  return { ok: true, desconto: { codigoBarras: barras.codigo, precoPromocional: preco, inicio, fim, linha } };
}

/**
 * Segunda conferência: o produto precisa existir (na aba Produtos da mesma planilha ou já cadastrado) e o preço promocional precisa
 * ser MENOR que o preço normal. `precoNormal(codigo)` devolve o preço normal ou `null` se o produto não existe.
 */
export async function conferirDescontos(
  descontos: Desconto[],
  precoNormal: (codigoBarras: string) => Promise<number | null>,
): Promise<{ validos: Desconto[]; erros: Erro[] }> {
  const validos: Desconto[] = [];
  const erros: Erro[] = [];
  for (const d of descontos) {
    const normal = await precoNormal(d.codigoBarras);
    if (normal === null) {
      erros.push({ linha: d.linha, motivo: `Aba Descontos: o produto ${d.codigoBarras} não está cadastrado (coloque-o na aba Produtos)` });
    } else if (!(d.precoPromocional < normal)) {
      erros.push({ linha: d.linha, motivo: `Aba Descontos: o preço promocional (${d.precoPromocional}) precisa ser menor que o preço normal (${normal})` });
    } else validos.push(d);
  }
  return { validos, erros };
}

// ---------------------------------------------------------------------------------------------------------------------
// Aplicar a planilha (direto, ou quando o pedido é pago)

/**
 * Grava a planilha no comércio: produtos, fotos e promoções. Use só o `r` recebido (dentro de uma transação).
 * Reenviar produtos NÃO apaga uma promoção que ainda vale (o preço promocional segue enquanto for menor que o novo preço normal).
 * Promoção que deixou de valer entre o envio e o pagamento (produto apagado, preço normal agora menor, período já encerrado) é ignorada.
 */
export async function aplicarPlanilha(
  r: Repositorio,
  mercadoId: number,
  planilha: PlanilhaRetida,
  agora: Date,
): Promise<{ importadas: number; promocoes: number; ignoradas: number }> {
  const existentes = new Map((await r.listarOfertasDoMercado(mercadoId)).map((o) => [o.codigoBarras, o]));
  await r.salvarOfertas(
    planilha.ofertas.map((o) => {
      const antiga = existentes.get(o.codigoBarras);
      const mantem = antiga && antiga.promocaoPreco !== null && antiga.promocaoPreco < o.preco;
      return {
        ...o,
        mercadoId,
        precoAtualizadoEm: agora,
        ...(mantem ? { promocaoPreco: antiga.promocaoPreco, promocaoInicio: antiga.promocaoInicio, promocaoFim: antiga.promocaoFim } : {}),
      };
    }),
  );
  // Fotos indicadas na planilha: o servidor baixa e guarda depois (veja fotos/gerenciador.ts). A foto que um mercado enviou à
  // mão pelo painel vale mais e não é trocada; um link já indicado antes (igual) também não é refeito.
  await r.salvarFotosDaPlanilha(planilha.fotos, mercadoId, agora);

  let promocoes = 0;
  let ignoradas = 0;
  for (const d of planilha.descontos) {
    const oferta = await r.acharOferta(mercadoId, d.codigoBarras);
    if (!oferta || !(d.precoPromocional < oferta.preco) || Date.parse(d.fim) < agora.getTime()) {
      ignoradas += 1;
      continue;
    }
    await r.salvarOferta({
      ...oferta,
      promocaoPreco: d.precoPromocional,
      promocaoInicio: d.inicio ? new Date(d.inicio) : null,
      promocaoFim: new Date(d.fim),
    });
    promocoes += 1;
  }
  return { importadas: planilha.ofertas.length, promocoes, ignoradas };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pedidos

/** Texto "R$ 15,00" a partir de centavos. */
export function reais(centavos: number): string {
  const inteiros = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${inteiros},${String(centavos % 100).padStart(2, '0')}`;
}

/** Normaliza a chave Pix digitada (aparada); `null` se passar do tamanho máximo. */
export function lerChavePix(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (t.length > MAX_TAMANHO_CHAVE_PIX) return undefined;
  return t === '' ? null : t;
}

