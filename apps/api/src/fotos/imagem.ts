// Validação e leitura das imagens enviadas pelos mercados (texto "data:image/jpeg;base64,...").
// O painel já reduz a foto antes de enviar; aqui o servidor confere de novo, porque tudo que chega de fora é desconfiável.

export const TAMANHO_MAXIMO_FOTO_BYTES = 300 * 1024;
export const MSG_FOTO_INVALIDA = 'Envie uma foto em JPEG, PNG ou WebP.';
export const MSG_FOTO_GRANDE = 'A foto é grande demais (máximo de 300 KB). O painel reduz a foto sozinho; tente outra imagem.';

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** O começo do arquivo precisa ser mesmo o de uma imagem do tipo declarado (não basta o que o texto diz). */
function formatoCombina(tipo: string, bytes: Buffer): boolean {
  if (tipo === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (tipo === 'image/png') return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (tipo === 'image/webp') return bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

export type ImagemLida = { ok: true; tipo: string; bytes: Buffer } | { ok: false; erro: string };

/** Lê e confere o texto "data:image/...;base64,...": tipo permitido, tamanho e cabeçalho do arquivo. */
export function lerImagem(valor: unknown): ImagemLida {
  if (typeof valor !== 'string') return { ok: false, erro: MSG_FOTO_INVALIDA };
  // Barra antes de decodificar: um texto gigante não deve ser processado.
  if (valor.length > Math.ceil((TAMANHO_MAXIMO_FOTO_BYTES * 4) / 3) + 64) return { ok: false, erro: MSG_FOTO_GRANDE };
  const m = DATA_URL.exec(valor);
  if (!m) return { ok: false, erro: MSG_FOTO_INVALIDA };
  const bytes = Buffer.from(m[2]!, 'base64');
  if (bytes.length > TAMANHO_MAXIMO_FOTO_BYTES) return { ok: false, erro: MSG_FOTO_GRANDE };
  if (!formatoCombina(m[1]!, bytes)) return { ok: false, erro: MSG_FOTO_INVALIDA };
  return { ok: true, tipo: m[1]!, bytes };
}
