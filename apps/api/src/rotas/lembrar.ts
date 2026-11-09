// Guarda por um tempo o resultado de uma montagem pesada (a lista de produtos), para não refazê-la a cada pedido.

/**
 * Guarda o resultado de `fabrica` por `ms` milissegundos (falha não é guardada). Passado o prazo, o valor antigo ainda é entregue na
 * hora (por até 10 minutos) enquanto um novo é montado por trás: assim ninguém espera a montagem, que no servidor gratuito leva
 * vários segundos. Com `ms` 0, não guarda nada.
 */
export function lembrar<T>(fabrica: () => Promise<T>, ms: number): () => Promise<T> {
  const VELHO_DEMAIS_MS = 10 * 60 * 1000;
  let guardado: { montadoEm: number; valor: Promise<T> } | null = null;
  let atualizando = false;
  const montar = (): Promise<T> => {
    const valor = fabrica();
    const novo = { montadoEm: Date.now(), valor };
    guardado = novo;
    valor.catch(() => {
      if (guardado === novo) guardado = null;
    });
    return valor;
  };
  return () => {
    if (ms <= 0) return fabrica();
    if (!guardado) return montar();
    const idade = Date.now() - guardado.montadoEm;
    if (idade < ms) return guardado.valor;
    if (idade >= VELHO_DEMAIS_MS) return montar();
    const antigo = guardado.valor;
    if (!atualizando) {
      atualizando = true;
      // Um instante depois, para a resposta atual sair antes: a montagem trava o servidor (conta pesada) enquanto roda.
      setTimeout(() => {
        void montar().then(() => undefined, () => undefined).finally(() => {
          atualizando = false;
        });
      }, 30).unref();
    }
    return antigo;
  };
}
