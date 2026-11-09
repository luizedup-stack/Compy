import { useSyncExternalStore } from 'react';

import { renovarCopiaDosProdutos } from './api';

/**
 * Botão "Atualizar" do topo do app. Quem toca no botão chama pedirAtualizacao(); as telas (Buscar, Mercados e a lista de
 * produtos de um mercado) usam useAtualizacao() e, quando o número da versão muda, consultam o servidor de novo.
 * Assim a pessoa não precisa fechar e abrir o app para ver produtos e preços novos.
 */
let versao = 0;
let atualizando = false;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

/** Pede para as telas consultarem tudo de novo e renova a cópia dos produtos guardada no celular (para usar sem internet). */
export async function pedirAtualizacao(): Promise<void> {
  if (atualizando) return; // já está atualizando: um segundo toque não faz nada
  atualizando = true;
  versao += 1; // as telas começam a consultar o servidor agora
  avisar();
  try {
    await renovarCopiaDosProdutos(true); // nunca lança erro; sem internet a cópia antiga continua valendo
  } finally {
    atualizando = false;
    avisar();
  }
}

/** `versao` muda a cada pedido de atualização (comece a olhar a partir de 1); `atualizando` é true enquanto a cópia é renovada. */
export function useAtualizacao(): { versao: number; atualizando: boolean } {
  const lerVersao = () => versao;
  const lerAtualizando = () => atualizando;
  const assinar = (aoMudar: () => void) => {
    ouvintes.add(aoMudar);
    return () => {
      ouvintes.delete(aoMudar);
    };
  };
  return {
    versao: useSyncExternalStore(assinar, lerVersao),
    atualizando: useSyncExternalStore(assinar, lerAtualizando),
  };
}
