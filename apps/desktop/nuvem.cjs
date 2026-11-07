// Regras do endereço do "servidor na nuvem" (separadas do main.cjs para poderem ser testadas sem abrir o Electron).

/** Aceita só https (ou http no próprio computador, para testes) e devolve apenas o endereço-base, sem caminho. */
function normalizarUrlNuvem(texto) {
  let u;
  try {
    u = new URL(String(texto).trim());
  } catch {
    throw new Error('Endereço inválido. Exemplo: https://bolso-certo.onrender.com');
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new Error('Use um endereço que comece com https:// (o servidor na nuvem sempre usa https).');
  }
  return u.origin;
}

module.exports = { normalizarUrlNuvem };
