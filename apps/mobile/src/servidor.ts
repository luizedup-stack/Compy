import { definirUrlApi, urlApi } from './api';
import { apagarDoCofre, guardarNoCofre, lerDoCofre } from './cofre';

/**
 * Chave do cofre onde fica o endereço do servidor escolhido na tela Entrar. O ".2" existe de propósito: versões antigas do app
 * guardavam aqui um endereço de teste (de rede local, por exemplo) que, ao atualizar o app por cima, passava na frente do endereço
 * de fábrica do APK novo. Com a chave nova, o que foi guardado antes é ignorado; o que a pessoa escolher agora continua valendo.
 */
export const CHAVE_SERVIDOR = 'bolso-certo.servidor.2';
/** Chave das versões anteriores: o que está nela não vale mais e é apagado ao abrir o app. */
export const CHAVE_SERVIDOR_ANTIGA = 'bolso-certo.servidor';

export const MSG_SERVIDOR_INVALIDO = 'Endereço inválido. Exemplo: http://192.168.0.10:3000 ou https://meu-servidor.com';

/**
 * Aceita o endereço completo ou sem "http(s)://". Sem isso, assume https:// para nome de site ("meu-servidor.onrender.com":
 * servidor hospedado) e http:// para número de rede local, "localhost" ou endereço com porta ("192.168.0.10:3000").
 * Devolve o endereço sem a barra final, ou null se não parecer um endereço.
 */
export function normalizarServidor(texto: string): string | null {
  const t = texto.trim();
  if (t === '') return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:\/\//i.test(t)) return null; // outro tipo de endereço (ftp:// etc.)
  const completo = /^https?:\/\//i.test(t) ? t : `${esquemaPadrao(t)}://${t}`;
  if (!/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(completo)) return null;
  return completo.replace(/\/+$/, '');
}

/** Nome de site de verdade (tem letras e ponto, sem porta): é hospedagem na internet, que sempre usa https. */
function esquemaPadrao(semEsquema: string): 'http' | 'https' {
  const servidor = semEsquema.split(/[/?#]/)[0] ?? '';
  const nomeDeSite = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z][a-z0-9-]*$/i.test(servidor) && !/\.(local|lan|home|internal)$/i.test(servidor);
  return nomeDeSite ? 'https' : 'http';
}

/** Ao abrir o app: usa o endereço que a pessoa escolheu antes, se houver. */
export async function carregarServidor(): Promise<void> {
  try {
    await apagarDoCofre(CHAVE_SERVIDOR_ANTIGA);
  } catch {
    // Sem o cofre, nada a apagar.
  }
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
