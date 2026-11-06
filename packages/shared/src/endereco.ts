/**
 * Endereço e telefone de um mercado: regras de validação e de formatação usadas pelo servidor e pelo painel.
 * O servidor guarda o endereço por partes (EnderecoMercado) e também como um texto único (montarEndereco),
 * que é o que o aplicativo do cliente mostra.
 */

/** Siglas dos estados brasileiros (e do Distrito Federal). */
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/** O endereço completo de um mercado, por partes. */
export interface EnderecoMercado {
  /** Rua, avenida, travessa... (sem o número). */
  logradouro: string;
  /** Número do imóvel; aceita texto como "S/N". */
  numero: string;
  /** Sala, loja, bloco... Opcional. */
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  /** Só os 8 dígitos, sem hífen. */
  cep: string;
}

export const MSG_CEP_INVALIDO = 'CEP inválido (use 8 números, por exemplo 05501-000)';
export const MSG_TELEFONE_INVALIDO = 'Telefone inválido (use DDD + número, por exemplo (11) 91234-5678)';

/** Só os dígitos de um texto ("(11) 91234-5678" vira "11912345678"). */
export const soDigitos = (texto: string): string => texto.replace(/\D/g, '');

export type ResultadoValidacao = { ok: true; valor: string } | { ok: false; motivo: string };

/** CEP com 8 dígitos (aceita "05501-000", "05501000" ou com pontos/espaços). Não aceita só zeros. */
export function validarCep(entrada: string): ResultadoValidacao {
  const digitos = soDigitos(entrada);
  if (digitos.length !== 8 || /^0+$/.test(digitos)) return { ok: false, motivo: MSG_CEP_INVALIDO };
  return { ok: true, valor: digitos };
}

/**
 * Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular, começa com 9 depois do DDD).
 * Aceita "+55" na frente. O DDD vai de 11 a 99.
 */
export function validarTelefone(entrada: string): ResultadoValidacao {
  let digitos = soDigitos(entrada);
  if (digitos.length > 11 && digitos.startsWith('55')) digitos = digitos.slice(2);
  const ddd = Number(digitos.slice(0, 2));
  const celularOk = digitos.length === 11 && digitos[2] === '9';
  const fixoOk = digitos.length === 10 && digitos[2] !== '0' && digitos[2] !== '1';
  if (!(celularOk || fixoOk) || ddd < 11 || ddd > 99) return { ok: false, motivo: MSG_TELEFONE_INVALIDO };
  return { ok: true, valor: digitos };
}

/** "05501000" vira "05501-000". */
export function formatarCep(cep: string): string {
  return cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

/** "11912345678" vira "(11) 91234-5678"; "1133334444" vira "(11) 3333-4444". */
export function formatarTelefone(telefone: string): string {
  if (telefone.length === 11) return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}`;
  if (telefone.length === 10) return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 6)}-${telefone.slice(6)}`;
  return telefone;
}

/** O endereço em uma linha só, como o cliente vê: "Rua X, 123, Loja 2 - Bairro, Cidade - SP, CEP 05501-000". */
export function montarEndereco(e: EnderecoMercado): string {
  const numero = e.complemento ? `${e.numero}, ${e.complemento}` : e.numero;
  return `${e.logradouro}, ${numero} - ${e.bairro}, ${e.cidade} - ${e.uf}, CEP ${formatarCep(e.cep)}`;
}
