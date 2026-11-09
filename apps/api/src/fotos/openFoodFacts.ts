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

// ---- Busca pelo NOME do produto -----------------------------------------------------------------------------------------
// Para produtos cujo código de barras o banco aberto não conhece (por exemplo, os produtos de teste, que têm códigos inventados),
// procura pelo nome, só entre produtos do Brasil. Como pode trazer um produto parecido mas diferente, cada resultado recebe uma
// pontuação de parecença com o nome buscado e só vale se passar de um mínimo. O serviço limita as buscas por minuto: o gerenciador
// espera bastante entre elas.

export interface BuscadorPorNome {
  buscarPorNome(nome: string): Promise<ResultadoFoto | null>;
}

const URL_BUSCA = 'https://world.openfoodfacts.org/cgi/search.pl';
const CAMPOS_BUSCA = 'code,product_name,brands,image_front_small_url,image_front_url,image_url,countries_tags';
/** Palavras que não ajudam a identificar o produto (ligações, unidades, embalagens). */
const PALAVRAS_SEM_VALOR = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'em', 'para', 'c', 'a', 'o', 'tipo', 'un', 'und', 'unid', 'unidade', 'unidades', 'pct', 'pacote',
  'cx', 'caixa', 'kg', 'g', 'mg', 'ml', 'l', 'lt', 'litro', 'litros', 'gr', 'rolo', 'rolos', 'x', 'folha', 'folhas', 'pet', 'lata', 'garrafa', 'sache',
]);

/** As palavras que importam do nome ("Leite Integral Piracanjuba 1L" → ["leite", "integral", "piracanjuba"]): sem acento, sem números e unidades. */
export function termosDoNome(nome: string): string[] {
  const normal = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  const termos = normal
    .split(' ')
    .filter((t) => t.length > 1 && !/^\d/.test(t) && !PALAVRAS_SEM_VALOR.has(t));
  return [...new Set(termos)];
}

/** Quanto do que foi buscado aparece no produto achado (0 a 1): fração dos termos buscados presentes no nome e na marca dele. */
export function parecenca(termosBuscados: string[], produto: { product_name?: unknown; brands?: unknown }): number {
  if (termosBuscados.length === 0) return 0;
  const achados = new Set(termosDoNome(`${String(produto.product_name ?? '')} ${String(produto.brands ?? '')}`));
  return termosBuscados.filter((t) => achados.has(t)).length / termosBuscados.length;
}

const PARECENCA_MINIMA = 0.6;
const TERMOS_MINIMOS_EM_COMUM = 2;

export function criarBuscadorPorNomeOpenFoodFacts({
  userAgent,
  fetchFn = globalThis.fetch,
  tempoLimiteMs = 20_000,
}: {
  userAgent: string;
  fetchFn?: typeof fetch;
  tempoLimiteMs?: number;
}): BuscadorPorNome {
  return {
    async buscarPorNome(nome) {
      const termos = termosDoNome(nome);
      if (termos.length < TERMOS_MINIMOS_EM_COMUM) return null; // nome curto demais: qualquer resultado seria chute
      const parametros = new URLSearchParams({
        search_terms: termos.join(' '),
        search_simple: '1',
        action: 'process',
        json: '1',
        page_size: '12',
        tagtype_0: 'countries',
        tag_contains_0: 'contains',
        tag_0: 'brazil',
        fields: CAMPOS_BUSCA,
      });
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);
      let resposta: Response;
      try {
        resposta = await fetchFn(`${URL_BUSCA}?${parametros}`, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: controle.signal });
      } catch (e) {
        throw new ErroTemporario(`Sem resposta da busca do Open Food Facts (${e instanceof Error ? e.message : String(e)})`);
      } finally {
        clearTimeout(relogio);
      }
      // A busca tem limite por minuto e às vezes fica indisponível (503): é para esperar, não para concluir "não achou".
      if (resposta.status === 429 || resposta.status >= 500) throw new ErroTemporario(`A busca do Open Food Facts respondeu ${resposta.status}`);
      if (!resposta.ok) return null;
      let json: unknown;
      try {
        json = await resposta.json();
      } catch {
        throw new ErroTemporario('Resposta da busca do Open Food Facts ilegível');
      }
      const produtos = (json as { products?: Record<string, unknown>[] } | null)?.products ?? [];
      let melhor: { nota: number; url: string } | null = null;
      for (const p of produtos) {
        const url = urlDeImagemValida(p.image_front_small_url) ?? urlDeImagemValida(p.image_front_url) ?? urlDeImagemValida(p.image_url);
        if (!url) continue;
        const nota = parecenca(termos, p);
        const emComum = Math.round(nota * termos.length);
        if (nota < PARECENCA_MINIMA || emComum < TERMOS_MINIMOS_EM_COMUM) continue;
        if (!melhor || nota > melhor.nota) melhor = { nota, url };
      }
      return melhor ? { url: melhor.url } : null;
    },
  };
}
