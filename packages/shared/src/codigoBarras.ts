export type ResultadoCodigoBarras = { ok: true; codigo: string } | { ok: false; motivo: string };

// Dígito verificador GS1 (EAN-8, UPC-A e EAN-13): pesos 3 e 1 alternados, da direita para a esquerda.
function digitoVerificadorValido(codigo: string): boolean {
  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop() as number;
  const soma = digitos
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === verificador;
}

export function validarCodigoBarras(entrada: string | number): ResultadoCodigoBarras {
  const texto = typeof entrada === 'number' ? String(entrada) : entrada.trim();

  if (texto === '') return { ok: false, motivo: 'Código de barras obrigatório' };
  if (/^\d+([.,]\d+)?e[+-]?\d+$/i.test(texto)) {
    return {
      ok: false,
      motivo: 'Código em notação científica (a planilha converteu o número); formate a coluna como texto',
    };
  }
  if (!/^\d+$/.test(texto)) {
    return { ok: false, motivo: 'O código de barras deve conter apenas dígitos' };
  }
  if (/^0+$/.test(texto)) {
    return { ok: false, motivo: 'Código de barras inválido (somente zeros)' };
  }

  switch (texto.length) {
    case 8:
    case 13:
      return digitoVerificadorValido(texto)
        ? { ok: true, codigo: texto }
        : { ok: false, motivo: 'Dígito verificador do código de barras inválido' };
    case 11:
    case 12: {
      // UPC-A (12 dígitos) ou EAN-13 que perdeu zeros à esquerda na planilha (11 ou 12 dígitos):
      // recompõe até 13 dígitos.
      const completo = texto.padStart(13, '0');
      return digitoVerificadorValido(completo)
        ? { ok: true, codigo: completo }
        : { ok: false, motivo: 'Dígito verificador do código de barras inválido' };
    }
    default:
      return { ok: false, motivo: 'O código de barras deve ter 8, 12 ou 13 dígitos' };
  }
}
