// Baixa a foto de um produto a partir de um link e a prepara para guardar no banco: um JPEG pequeno (até 400 px).
// O link vem de fora (de uma planilha do mercado ou de um banco aberto de produtos), então o servidor NÃO confia nele:
// só https em endereço público (nada de localhost, rede interna ou o endereço de metadados da nuvem), poucos redirecionamentos,
// tamanho e tempo limitados, e o conteúdo precisa ser mesmo uma imagem (quem confere é a biblioteca de imagens, não o que o servidor diz).
import dns from 'node:dns/promises';
import net from 'node:net';
import sharp from 'sharp';
import { TAMANHO_MAXIMO_FOTO_BYTES } from './imagem';
import { ErroTemporario } from './openFoodFacts';

/** O link ou o conteúdo não serve e não vai passar a servir: não adianta tentar de novo. */
export class ImagemInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ImagemInvalida';
  }
}

const LADO_MAXIMO = 400;
const MAXIMO_BAIXADO_BYTES = 5 * 1024 * 1024;
const MAXIMO_REDIRECIONAMENTOS = 3;
const QUALIDADES = [82, 65, 50];

/** Endereço IP que não é da internet pública (rede interna, loopback, link-local, metadados da nuvem...). */
export function enderecoPrivado(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local, inclui 169.254.169.254 (metadados da nuvem)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const baixo = ip.toLowerCase();
    if (baixo === '::' || baixo === '::1') return true;
    const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(baixo); // IPv4 dentro de IPv6
    if (mapeado) return enderecoPrivado(mapeado[1]!);
    return /^f[cd]/.test(baixo) || /^fe[89ab]/.test(baixo) || baixo.startsWith('ff');
  }
  return true; // não é um IP válido: não confia
}

type Resolvedor = (host: string) => Promise<string[]>;
const resolverPadrao: Resolvedor = async (host) => (await dns.lookup(host, { all: true })).map((r) => r.address);

/** Confere que o link é https, sem usuário/senha, em porta normal e que o nome aponta só para endereços públicos. */
export async function conferirUrlPublica(texto: string, resolver: Resolvedor = resolverPadrao): Promise<URL> {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ImagemInvalida('Link da foto inválido');
  }
  if (url.protocol !== 'https:') throw new ImagemInvalida('O link da foto precisa começar com https://');
  if (url.username || url.password) throw new ImagemInvalida('Link da foto inválido');
  if (url.port && url.port !== '443') throw new ImagemInvalida('Link da foto em porta não permitida');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ImagemInvalida('Link da foto aponta para um endereço interno');
  }
  let enderecos: string[];
  if (net.isIP(host)) enderecos = [host];
  else {
    try {
      enderecos = await resolver(host);
    } catch {
      throw new ErroTemporario(`Não consegui resolver o endereço ${host}`);
    }
  }
  if (enderecos.length === 0 || enderecos.some(enderecoPrivado)) throw new ImagemInvalida('Link da foto aponta para um endereço interno');
  return url;
}

async function lerCorpoLimitado(resposta: Response, limite: number): Promise<Buffer> {
  const declarado = Number(resposta.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > limite) throw new ImagemInvalida('A imagem é grande demais');
  if (!resposta.body) return Buffer.from(await resposta.arrayBuffer());
  const leitor = resposta.body.getReader();
  const partes: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > limite) {
      await leitor.cancel();
      throw new ImagemInvalida('A imagem é grande demais');
    }
    partes.push(Buffer.from(value));
  }
  return Buffer.concat(partes);
}

/** Reduz qualquer imagem (JPEG, PNG, WebP, AVIF...) para um JPEG de até 400 px, como texto "data:image/jpeg;base64,...". */
export async function reduzirParaJpeg(bytes: Buffer): Promise<string> {
  for (const qualidade of QUALIDADES) {
    let saida: Buffer;
    try {
      saida = await sharp(bytes, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize(LADO_MAXIMO, LADO_MAXIMO, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }) // PNG com transparência não vira preto
        .jpeg({ quality: qualidade })
        .toBuffer();
    } catch {
      throw new ImagemInvalida('O arquivo não é uma imagem válida');
    }
    if (saida.length <= TAMANHO_MAXIMO_FOTO_BYTES) return `data:image/jpeg;base64,${saida.toString('base64')}`;
  }
  throw new ImagemInvalida('A imagem continua grande demais depois de reduzida');
}

export interface OpcoesBaixar {
  fetchFn?: typeof fetch;
  resolver?: Resolvedor;
  tempoLimiteMs?: number;
  userAgent?: string;
}

/** Baixa o link e devolve a foto reduzida. Lança ImagemInvalida (definitivo) ou ErroTemporario (tentar depois). */
export async function baixarFoto(
  link: string,
  { fetchFn = globalThis.fetch, resolver = resolverPadrao, tempoLimiteMs = 15_000, userAgent = 'BolsoCerto/1.0 (https://github.com/luizedup-stack/bolso-certo)' }: OpcoesBaixar = {},
): Promise<string> {
  let atual = await conferirUrlPublica(link, resolver);
  for (let salto = 0; ; salto++) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);
    let resposta: Response;
    try {
      resposta = await fetchFn(atual.toString(), { redirect: 'manual', signal: controle.signal, headers: { 'User-Agent': userAgent, Accept: 'image/*' } });
    } catch (e) {
      clearTimeout(relogio);
      throw new ErroTemporario(`Sem resposta ao baixar a foto (${e instanceof Error ? e.message : String(e)})`);
    }

    try {
      if (resposta.status >= 300 && resposta.status < 400) {
        const destino = resposta.headers.get('location');
        if (!destino || salto >= MAXIMO_REDIRECIONAMENTOS) throw new ImagemInvalida('Redirecionamentos demais ao baixar a foto');
        atual = await conferirUrlPublica(new URL(destino, atual).toString(), resolver); // cada salto é conferido de novo
        continue;
      }
      if (resposta.status === 429 || resposta.status >= 500) throw new ErroTemporario(`O servidor da foto respondeu ${resposta.status}`);
      if (!resposta.ok) throw new ImagemInvalida(`O servidor da foto respondeu ${resposta.status}`);
      return await reduzirParaJpeg(await lerCorpoLimitado(resposta, MAXIMO_BAIXADO_BYTES));
    } finally {
      clearTimeout(relogio);
    }
  }
}
