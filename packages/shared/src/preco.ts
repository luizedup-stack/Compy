export function parsePreco(entrada: string | number): number | null {
  let valor: number;

  if (typeof entrada === 'number') {
    valor = entrada;
  } else {
    let texto = entrada.replace(/R\$/gi, '').replace(/\s+/g, '');
    if (!/^-?[\d.,]+$/.test(texto)) return null;

    // Se há ponto e vírgula, o último símbolo é o decimal e o outro é milhar.
    const ultimoPonto = texto.lastIndexOf('.');
    const ultimaVirgula = texto.lastIndexOf(',');
    if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
      const decimal = ultimoPonto > ultimaVirgula ? '.' : ',';
      const milhar = decimal === '.' ? ',' : '.';
      texto = texto.split(milhar).join('').replace(decimal, '.');
    } else {
      texto = texto.replace(',', '.');
    }
    valor = Number(texto);
  }

  if (!Number.isFinite(valor)) return null;
  const arredondado = Math.round(valor * 100) / 100;
  return arredondado > 0 ? arredondado : null;
}
