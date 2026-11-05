import { definirUrlApi, urlApi } from './api';
import { apagarDoCofre, guardarNoCofre, lerDoCofre } from './cofre';

/** Chave do cofre onde fica o endereço do servidor escolhido na tela Entrar. */
export const CHAVE_SERVIDOR = 'bolso-certo.servidor';

export const MSG_SERVIDOR_INVALIDO = 'Endereço inválido. Exemplo: http://192.168.0.10:3000 ou https://meu-servidor.com';

/**
 * Aceita "192.168.0.10:3000" (assume http://) ou o endereço completo. Devolve o endereço sem a barra final,
 * ou null se não parecer um endereço.
 */
export function normalizarServidor(texto: string): string | null {
  const t = texto.trim();
  if (t === '') return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:\/\//i.test(t)) return null; // outro tipo de endereço (ftp:// etc.)
  const completo = /^https?:\/\//i.test(t) ? t : `http://${t}`;
  if (!/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(completo)) return null;
  return completo.replace(/\/+$/, '');
}

/** Ao abrir o app: usa o endereço que a pessoa escolheu antes, se houver. */
export async function carregarServidor(): Promise<void> {
  try {
    const guardado = await lerDoCofre(CHAVE_SERVIDOR);
    const url = guardado ? normalizarServidor(guardado) : null;
    if (url) definirUrlApi(url);
  } catch {
    // Sem o cofre, vale o endereço de fábrica.
  }
}

/** Troca o endereço do servidor e o guarda. Texto vazio volta ao endereço de fábrica. Devolve false se for inválido. */
export async function salvarServidor(texto: string): Promise<boolean> {
  if (texto.trim() === '') {
    definirUrlApi(null);
    try {
      await apagarDoCofre(CHAVE_SERVIDOR);
    } catch {
      // Já voltou ao padrão na memória.
    }
    return true;
  }
  const url = normalizarServidor(texto);
  if (!url) return false;
  definirUrlApi(url);
  try {
    await guardarNoCofre(CHAVE_SERVIDOR, url);
  } catch {
    // Vale até fechar o app.
  }
  return true;
}

export { urlApi };
