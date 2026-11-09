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

/** true quando o servidor existe mas demorou demais para responder (acordando/lento), em vez de não ter conexão nenhuma. */
let servidorLento = false;

/** `lento`: o servidor não caiu, só demorou: o aviso diz isso em vez de "sem conexão". */
export function marcarSemConexao(dadosDe: number, lento = false): void {
  if (semConexaoDesde === dadosDe && servidorLento === lento) return;
  semConexaoDesde = dadosDe;
  servidorLento = lento;
  mudou();
}

export function marcarComConexao(): void {
  if (semConexaoDesde === null) return;
  semConexaoDesde = null;
  servidorLento = false;
  mudou();
}

/** O aviso atual é de servidor lento (não de falta de conexão)? */
export function useServidorLento(): boolean {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    () => servidorLento,
    () => servidorLento,
  );
}

export function estaSemConexao(): boolean {
  return semConexaoDesde !== null;
}

/** O aviso atual é de servidor lento (não de falta de conexão)? Sem React, para quem não é tela. */
export function servidorEstaLento(): boolean {
  return servidorLento;
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

// ---- Servidor acordando ----------------------------------------------------------------------------------------
// O servidor gratuito dorme sem uso e leva até ~1 minuto para ligar (e o banco, mais um pouco). Nesse tempo ele responde
// 502/503/504: o app espera e tenta de novo sozinho, e esta faixa avisa a pessoa em vez de mostrar um erro.
let acordando = 0; // quantas consultas estão esperando o servidor acordar
const ouvintesAcordando = new Set<() => void>();

export function comecouEsperarServidor(): void {
  acordando += 1;
  for (const o of ouvintesAcordando) o();
}

export function terminouEsperarServidor(): void {
  acordando = Math.max(0, acordando - 1);
  for (const o of ouvintesAcordando) o();
}

export function useServidorAcordando(): boolean {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintesAcordando.add(ouvinte);
      return () => ouvintesAcordando.delete(ouvinte);
    },
    () => acordando > 0,
    () => acordando > 0,
  );
}
