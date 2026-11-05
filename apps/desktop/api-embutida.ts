// Ponto de entrada da API dentro do programa de computador. O esbuild junta tudo (API + pacote compartilhado)
// em um único arquivo (api.cjs), que o main.cjs carrega.
// - Os e-mails (códigos de confirmação) ainda não saem para lugar nenhum: ficam numa lista que o programa mostra.
// - Os dados (contas, mercados, produtos, correções) são guardados em um arquivo na pasta do usuário a cada
//   poucos segundos e ao fechar, e voltam quando o programa abre de novo. É um quebra-galho até existir o banco.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { lerConfig } from '../api/src/config';
import type { EmailSender } from '../api/src/email';
import { criarRepositorioMemoria } from '../api/src/repositorioMemoria';
import { completarAdminDeDesenvolvimento, montarServidor } from '../api/src/servidor';

export interface EmailGuardado {
  quando: string;
  para: string;
  assunto: string;
  texto: string;
}

const MAXIMO_DE_EMAILS = 50;
const INTERVALO_DE_SALVAR_MS = 3000;
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
  /** Planilhas que entram na primeira vez (ou depois de "apagar dados salvos"). */
  pastaDados: string;
  /** Pasta do usuário onde ficam o estado salvo e o segredo das sessões. */
  pastaSalvos: string;
  adminEmail: string;
  adminSenha: string;
}

export interface ApiEmbutida {
  app: FastifyInstance;
  /** true se esta abertura restaurou dados salvos (em vez de carregar as planilhas). */
  restaurou: boolean;
  salvarAgora(): Promise<void>;
  /** Para de salvar e apaga o que foi salvo; na próxima abertura volta ao começo. */
  apagarSalvos(): void;
}

/** O segredo e a identificação das sessões ficam guardados: quem já entrou no app continua entrando depois que o programa reabre. */
function lerOuCriarSegredo(arquivo: string, bytes = 32): string {
  try {
    const guardado = fs.readFileSync(arquivo, 'utf8').trim();
    if (guardado.length >= 32) return guardado;
  } catch {
    // Primeira vez: cria abaixo.
  }
  const novo = randomBytes(bytes).toString('hex');
  fs.writeFileSync(arquivo, novo, 'utf8');
  return novo;
}

/** Sobe a API e devolve o servidor para poder fechá-lo. */
export async function iniciarApi(op: OpcoesApi): Promise<ApiEmbutida> {
  fs.mkdirSync(op.pastaSalvos, { recursive: true });
  const arquivoEstado = path.join(op.pastaSalvos, 'dados.json');
  const repo = criarRepositorioMemoria();

  let restaurou = false;
  if (fs.existsSync(arquivoEstado)) {
    try {
      repo.importarEstado(fs.readFileSync(arquivoEstado, 'utf8'));
      restaurou = true;
    } catch {
      // Arquivo estragado: guarda para conferir depois e começa do zero.
      fs.renameSync(arquivoEstado, path.join(op.pastaSalvos, `dados-com-erro-${Date.now()}.json`));
    }
  }

  const { config } = completarAdminDeDesenvolvimento(
    lerConfig({
      PORT: String(op.porta),
      ADMIN_EMAIL: op.adminEmail,
      ADMIN_SENHA: op.adminSenha,
      JWT_SECRET: lerOuCriarSegredo(path.join(op.pastaSalvos, 'segredo.txt')),
      PASTA_DADOS_DE_TESTE: op.pastaDados,
      CARREGAR_DADOS_DE_TESTE: restaurou ? '0' : '1',
    }),
  );
  const instancia = lerOuCriarSegredo(path.join(op.pastaSalvos, 'instancia.txt'), 16);
  const { app } = await montarServidor(config, { logger: false, email: emailEmLista, repo, instancia });
  await app.listen({ port: config.porta, host: config.host });

  let ultimo = '';
  let ativo = true;
  const salvarAgora = async (): Promise<void> => {
    if (!ativo) return;
    const texto = await repo.exportarEstado();
    if (texto === ultimo) return;
    const temporario = `${arquivoEstado}.tmp`;
    fs.writeFileSync(temporario, texto, 'utf8');
    fs.renameSync(temporario, arquivoEstado);
    ultimo = texto;
  };
  await salvarAgora();
  const relogio = setInterval(() => void salvarAgora().catch(() => undefined), INTERVALO_DE_SALVAR_MS);
  relogio.unref();

  return {
    app,
    restaurou,
    salvarAgora,
    apagarSalvos() {
      ativo = false;
      clearInterval(relogio);
      fs.rmSync(arquivoEstado, { force: true });
    },
  };
}
