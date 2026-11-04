export type ResultadoCodigoBarras = { ok: true; codigo: string } | { ok: false; motivo: string };

const COMPRIMENTOS_VALIDOS = [8, 12, 13];

// Dígito verificador GS1 (EAN-8, UPC-A e EAN-13): pesos 3 e 1 alternados, da direita para a esquerda.
function digitoVerificadorValido(codigo: string): boolean {
  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop() as number;
  const soma = digitos
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === verificador;
}

function validoDireto(codigo: string): boolean {
  return COMPRIMENTOS_VALIDOS.includes(codigo.length) && digitoVerificadorValido(codigo);
}

export function validarCodigoBarras(entrada: string | number): ResultadoCodigoBarras {
  const texto = typeof entrada === 'number' ? String(entrada) : entrada.trim();

  if (/^\d+([.,]\d+)?e[+-]?\d+$/i.test(texto)) {
    return {
      ok: false,
      motivo: 'Código em notação científica (a planilha converteu o número); formate a coluna como texto',
    };
  }
  if (!/^\d+$/.test(texto)) {
    return { ok: false, motivo: 'O código de barras deve conter apenas dígitos' };
  }

  // Códigos de 12 dígitos (UPC-A) são devolvidos como EAN-13 com zero à esquerda.
  if (texto.length === 12 && validoDireto(texto)) return { ok: true, codigo: texto.padStart(13, '0') };
  if (validoDireto(texto)) return { ok: true, codigo: texto };

  // Planilhas numéricas perdem os zeros à esquerda: tenta recompor até 13 dígitos.
  if (texto.length < 13) {
    const completo = texto.padStart(13, '0');
    if (digitoVerificadorValido(completo)) return { ok: true, codigo: completo };
  }

  if (!COMPRIMENTOS_VALIDOS.includes(texto.length)) {
    return { ok: false, motivo: 'O código de barras deve ter 8, 12 ou 13 dígitos' };
  }
  return { ok: false, motivo: 'Dígito verificador do código de barras inválido' };
}
