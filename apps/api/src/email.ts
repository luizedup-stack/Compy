export interface EmailSender {
  enviar(para: string, assunto: string, texto: string): Promise<void>;
}

/** Só escreve no log: o envio real (provedor) não faz parte do projeto ainda. */
export function criarEmailConsole(): EmailSender {
  return {
    async enviar(para, assunto, texto) {
      console.log(`[e-mail] para: ${para}\nassunto: ${assunto}\n${texto}`);
    },
  };
}

export function criarEmailMemoria(): EmailSender & {
  enviados: { para: string; assunto: string; texto: string }[];
} {
  const enviados: { para: string; assunto: string; texto: string }[] = [];
  return {
    enviados,
    async enviar(para, assunto, texto) {
      enviados.push({ para, assunto, texto });
    },
  };
}
