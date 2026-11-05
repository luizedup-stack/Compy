// Ponto de entrada da API dentro do programa de computador. O esbuild junta tudo (API + pacote compartilhado)
// em um único arquivo (api.cjs), que o main.cjs carrega. Os e-mails (códigos de confirmação) ainda não saem
// para lugar nenhum: ficam numa lista que o programa mostra na tela "Códigos de e-mail".
import type { FastifyInstance } from 'fastify';
import { lerConfig } from '../api/src/config';
import type { EmailSender } from '../api/src/email';
import { completarAdminDeDesenvolvimento, montarServidor } from '../api/src/servidor';

export interface EmailGuardado {
  quando: string;
  para: string;
  assunto: string;
  texto: string;
}

const MAXIMO_DE_EMAILS = 50;
const emails: EmailGuardado[] = [];

const emailEmLista: EmailSender = {
  async enviar(para, assunto, texto) {
    emails.unshift({ quando: new Date().toISOString(), para, assunto, texto });
    if (emails.length > MAXIMO_DE_EMAILS) emails.length = MAXIMO_DE_EMAILS;
  },
};

export function emailsRecentes(): EmailGuardado[] {
  return [...emails];
}

export interface OpcoesApi {
  porta: number;
  pastaDados: string;
  adminEmail: string;
  adminSenha: string;
}

/** Sobe a API (dados em memória, planilhas da pasta carregadas) e devolve o servidor para poder fechá-lo. */
export async function iniciarApi(op: OpcoesApi): Promise<FastifyInstance> {
  const { config } = completarAdminDeDesenvolvimento(
    lerConfig({
      PORT: String(op.porta),
      ADMIN_EMAIL: op.adminEmail,
      ADMIN_SENHA: op.adminSenha,
      PASTA_DADOS_DE_TESTE: op.pastaDados,
      CARREGAR_DADOS_DE_TESTE: '1',
    }),
  );
  const { app } = await montarServidor(config, { logger: false, email: emailEmLista });
  await app.listen({ port: config.porta, host: config.host });
  return app;
}
