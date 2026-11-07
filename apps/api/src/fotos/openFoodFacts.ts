// Busca da foto de um produto pelo código de barras no Open Food Facts (https://world.openfoodfacts.org), um banco de dados
// aberto e gratuito de produtos. As fotos são de colaboradores, com licença Creative Commons BY-SA: o app mostra o crédito.
// Regras do serviço que seguimos: identificar o programa no User-Agent e não fazer muitas consultas por minuto
// (o gerenciador espera entre uma consulta e outra).

export interface ResultadoFoto {
  /** Endereço (https) da imagem do produto, vista de frente. */
  url: string;
}

/** `null` = o produto (ou a foto dele) não existe no banco aberto. Falha passageira lança ErroTemporario. */
export interface BuscadorDeFotos {
  buscar(codigoBarras: string): Promise<ResultadoFoto | null>;
}

/** Limite de consultas, servidor fora do ar ou internet caindo: não vale concluir que "não achou", é para tentar depois. */
export class ErroTemporario extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroTemporario';
  }
}

const URL_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const CAMPOS = 'image_front_small_url,image_front_url,image_url';

/**
 * Os códigos que vale consultar para um mesmo produto: o próprio e a forma que o banco aberto usa
 * (UPC-A de 12 dígitos vira EAN-13 com um zero na frente; GTIN-14 que começa com zero perde o zero).
 */
export function candidatosDoCodigo(codigoBarras: string): string[] {
  const codigo = codigoBarras.trim();
  const lista = [codigo];
  if (/^\d{12}$/.test(codigo)) lista.push(`0${codigo}`);
  if (/^0\d{13}$/.test(codigo)) lista.push(codigo.slice(1));
  return [...new Set(lista)];
}

/** Só aceita imagem https do próprio Open Food Facts (a resposta vem de fora: não seguimos endereço qualquer). */
function urlDeImagemValida(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  try {
    const u = new URL(valor);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'openfoodfacts.org' && !u.hostname.endsWith('.openfoodfacts.org')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function criarBuscadorOpenFoodFacts({
  userAgent,
  fetchFn = globalThis.fetch,
  tempoLimiteMs = 10_000,
}: {
  /** Identifica o programa para o serviço, com um contato (ex.: "BolsoCerto/1.0 (https://github.com/...)"). */
  userAgent: string;
  fetchFn?: typeof fetch;
  tempoLimiteMs?: number;
}): BuscadorDeFotos {
  async function consultar(codigo: string): Promise<ResultadoFoto | null> {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);
    let resposta: Response;
    try {
      resposta = await fetchFn(`${URL_BASE}/${encodeURIComponent(codigo)}.json?fields=${CAMPOS}`, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: controle.signal,
      });
    } catch (e) {
      throw new ErroTemporario(`Sem resposta do Open Food Facts (${e instanceof Error ? e.message : String(e)})`);
    } finally {
      clearTimeout(relogio);
    }

    if (resposta.status === 404) return null;
    if (resposta.status === 429 || resposta.status >= 500) throw new ErroTemporario(`Open Food Facts respondeu ${resposta.status}`);
    if (!resposta.ok) return null; // outro erro do pedido (ex.: código inválido para eles): sem foto

    let json: unknown;
    try {
      json = await resposta.json();
    } catch {
      throw new ErroTemporario('Resposta do Open Food Facts ilegível');
    }
    const produto = (json as { status?: unknown; product?: Record<string, unknown> } | null)?.product;
    if (!produto || (json as { status?: unknown }).status === 0) return null;
    const url = urlDeImagemValida(produto.image_front_small_url) ?? urlDeImagemValida(produto.image_front_url) ?? urlDeImagemValida(produto.image_url);
    return url ? { url } : null;
  }

  return {
    async buscar(codigoBarras) {
      for (const codigo of candidatosDoCodigo(codigoBarras)) {
        const achou = await consultar(codigo);
        if (achou) return achou;
      }
      return null;
    },
  };
}
