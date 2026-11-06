import { normalizarTexto } from '@mercado/shared';

export const MSG_EMAIL_INVALIDO = 'E-mail inválido';
export const MSG_SENHA_CURTA = 'A senha precisa de pelo menos 8 caracteres';
export const MSG_INFORME_SENHA = 'Informe a senha';
export const MSG_SENHAS_DIFERENTES = 'As senhas não são iguais';
export const MSG_INFORME_CODIGO = 'Informe o código';
export const TAMANHO_MINIMO_SENHA = 8;

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** O código do e-mail pode chegar com espaços e quebras de linha ao colar: tira todos. */
export function limparCodigo(texto: string): string {
  return texto.replace(/\s+/g, '');
}

/** Id estável de um campo a partir do rótulo ("Código recebido por e-mail" vira "codigo-recebido-por-e-mail"). */
export function chaveDeCampo(rotulo: string): string {
  return normalizarTexto(rotulo).replace(/ /g, '-');
}
