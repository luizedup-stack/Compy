// Tema do painel: claro (azul clarinho e branco) ou escuro (para não cansar a vista). Sem escolha da pessoa, segue o sistema do aparelho.
// A escolha fica guardada neste navegador (localStorage) e vira o atributo data-tema na página, que o estilos.css lê.
export type Tema = 'claro' | 'escuro';

const CHAVE = 'bolso-certo:tema';

/** A escolha guardada, ou null se a pessoa nunca escolheu (vale então o tema do sistema). */
export function lerTemaEscolhido(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'claro' || v === 'escuro' ? v : null;
  } catch {
    return null; // navegador sem armazenamento: segue o sistema
  }
}

/** O tema que está valendo agora (escolhido ou, na falta, o do sistema). */
export function temaEmUso(): Tema {
  const escolhido = lerTemaEscolhido();
  if (escolhido) return escolhido;
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  } catch {
    return 'claro';
  }
}

/** Põe o tema na página. Sem escolha guardada, tira o atributo e deixa o sistema decidir. */
export function aplicarTema(): void {
  const escolhido = lerTemaEscolhido();
  if (escolhido) document.documentElement.setAttribute('data-tema', escolhido);
  else document.documentElement.removeAttribute('data-tema');
}

/** Guarda a escolha da pessoa e aplica. */
export function escolherTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // sem armazenamento: vale só até recarregar
    document.documentElement.setAttribute('data-tema', tema);
    return;
  }
  aplicarTema();
}
