/** Trigramas de uma palavra, como o `pg_trgm`: dois espaços antes, um depois, conjunto sem repetição. */
function trigramas(palavra: string): Set<string> {
  const padded = `  ${palavra} `;
  const conjunto = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) conjunto.add(padded.slice(i, i + 3));
  return conjunto;
}

/**
 * Similaridade entre duas palavras (0 a 1): coeficiente de Jaccard dos trigramas, igual ao
 * `similarity()` do PostgreSQL com `pg_trgm`. Espera texto já normalizado (veja `normalizarTexto`).
 */
export function similaridade(a: string, b: string): number {
  if (a === '' || b === '') return 0;
  const ta = trigramas(a);
  const tb = trigramas(b);
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns / (ta.size + tb.size - comuns);
}
