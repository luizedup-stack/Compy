// Extrai o link da foto de um produto dos dados dos sites (catálogo do Atacadão e dados estruturados do Carrefour).
// O dado pode vir como texto, lista de textos, objeto com "url" (imagem estruturada) ou lista de objetos; devolve o primeiro
// link utilizável, sempre com https://, ou '' se não houver.
export function urlDaFoto(valor) {
  if (!valor) return '';
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achado = urlDaFoto(item);
      if (achado) return achado;
    }
    return '';
  }
  const texto = typeof valor === 'string' ? valor : valor.url ?? valor.contentUrl ?? valor.imageUrl ?? '';
  if (typeof texto !== 'string') return '';
  const t = texto.trim().replace(/^\/\//, 'https://').replace(/^http:\/\//i, 'https://');
  return /^https:\/\/\S{4,}$/i.test(t) ? t : '';
}
