import { useSyncExternalStore } from 'react';

/**
 * Se a última consulta ao servidor falhou e o app mostrou dados salvos, guarda de quando eram esses dados.
 * `null` = o servidor respondeu (tudo atualizado).
 */
let semConexaoDesde: number | null = null;
const ouvintes = new Set<() => void>();

function mudou(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

export function marcarSemConexao(dadosDe: number): void {
  if (semConexaoDesde === dadosDe) return;
  semConexaoDesde = dadosDe;
  mudou();
}

export function marcarComConexao(): void {
  if (semConexaoDesde === null) return;
  semConexaoDesde = null;
  mudou();
}

export function estaSemConexao(): boolean {
  return semConexaoDesde !== null;
}

/** De quando são os dados que estão na tela, se vieram da cópia salva; senão null. */
export function useSemConexaoDesde(): number | null {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    () => semConexaoDesde,
    () => semConexaoDesde,
  );
}
