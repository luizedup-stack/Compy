// Ponto de entrada da API dentro do programa de computador. O esbuild junta tudo (API + pacote compartilhado)
// em um único arquivo (api.cjs), que o main.cjs carrega.
// - E-mails (códigos de confirmação): se o arquivo configuracao-email.json estiver preenchido, saem de verdade por SMTP.
//   Em qualquer caso ficam também numa lista que o programa mostra (menu "Códigos de e-mail"), com a situação de cada um.
// - Os dados (contas, mercados, produtos, correções) são guardados em um arquivo na pasta do usuário a cada
//   poucos segundos e ao fechar, e voltam quando o programa abre de novo. É um quebra-galho até existir o banco.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { lerConfig } from '../api/src/config';
import { criarEmailSmtp, problemaNaConfigSmtp, type ConfigSmtp, type EmailSender } from '../api/src/email';
import { criarRepositorioMemoria } from '../api/src/repositorioMemoria';
import { completarAdminDeDesenvolvimento, montarServidor } from '../api/src/servidor';

export interface EmailGuardado {
  quando: string;
  para: string;
  assunto: string;
  texto: string;
  /** O que aconteceu com ele: enviado, não enviado (e por quê) ou só guardado nesta tela. */
  situacao: string;
}

const MAXIMO_DE_EMAILS = 50;
const INTERVALO_DE_SALVAR_MS = 3000;
const emails: EmailGuardado[] = [];

/** Modelo do arquivo de configuração do envio de e-mail (o programa o cria na primeira vez que o menu é usado). */
export const MODELO_CONFIG_EMAIL = JSON.stringify(
  {
    host: 'PREENCHA: servidor SMTP, por exemplo smtp.gmail.com',
    porta: 465,
    seguro: true,
    usuario: 'PREENCHA: e-mail da conta que envia',
    senha: 'PREENCHA: senha da conta (ou senha de aplicativo)',
    de: 'Bolso Certo <PREENCHA: e-mail da conta que envia>',
  },
  null,
  2,
);

// Arquivo de configuração do e-mail (definido ao iniciar a API). É lido a CADA envio: editar o arquivo vale na hora,
// sem precisar reabrir o programa.
let arquivoConfigEmail: string | null = null;

function lerConfigEmail(): Partial<ConfigSmtp> | null {
  if (!arquivoConfigEmail) return null;
  try {
    return JSON.parse(fs.readFileSync(arquivoConfigEmail, 'utf8')) as Partial<ConfigSmtp>;
  } catch {
    return null; // arquivo que não existe ou com JSON quebrado: vale como "não configurado"
  }
}

/** Situação do envio de e-mail: configurado ou não (e o que falta). */
export function statusDoEmail(): { configurado: boolean; motivo: string | null; de: string | null; arquivo: string | null } {
  const config = lerConfigEmail();
  const motivo = problemaNaConfigSmtp(config);
  return { configurado: motivo === null, motivo, de: motivo === null ? (config as ConfigSmtp).de : null, arquivo: arquivoConfigEmail };
}

/** Envia pelo SMTP configurado ou lança erro (sem configuração, ou o servidor recusou). */
async function enviarPeloSmtp(para: string, assunto: string, texto: string): Promise<void> {
  const config = lerConfigEmail();
  const motivo = problemaNaConfigSmtp(config);
  if (motivo !== null) throw new Error(`O envio de e-mail não está configurado (${motivo})`);
  await criarEmailSmtp(config as ConfigSmtp).enviar(para, assunto, texto);
}

/**
 * O "enviador" que a API usa: guarda cada e-mail na lista (com a situação) e tenta enviar de verdade.
 * Se o envio falhar ele lança o erro; a API então responde que o e-mail não saiu, mas o cadastro já está feito
 * e o código continua visível na lista.
 */
const emailDoPrograma: EmailSender = {
  async enviar(para, assunto, texto) {
    const registro: EmailGuardado = { quando: new Date().toISOString(), para, assunto, texto, situacao: 'Enviando…' };
    emails.unshift(registro);
    if (emails.length > MAXIMO_DE_EMAILS) emails.length = MAXIMO_DE_EMAILS;
    try {
      await enviarPeloSmtp(para, assunto, texto);
      registro.situacao = 'Enviado por e-mail';
    } catch (e) {
      registro.situacao = `NÃO ENVIADO: ${e instanceof Error ? e.message : String(e)}`;
      throw e;
    }
  },
};

export function emailsRecentes(): EmailGuardado[] {
  return [...emails];
}

/** Manda uma mensagem de teste para conferir se o e-mail está funcionando. Nunca lança erro: devolve o resultado. */
export async function enviarEmailDeTeste(para: string): Promise<{ ok: boolean; mensagem: string }> {
  try {
    await enviarPeloSmtp(para, 'Bolso Certo - Mercado: teste de e-mail', 'Se você recebeu esta mensagem, o envio de e-mail está funcionando.');
    return { ok: true, mensagem: `E-mail de teste enviado para ${para}. Confira a caixa de entrada (e o spam).` };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

export interface OpcoesApi {
  porta: number;
  /** Planilhas que entram na primeira vez (ou depois de "apagar dados salvos"). */
  pastaDados: string;
  /** Pasta do usuário onde ficam o estado salvo e o segredo das sessões. */
  pastaSalvos: string;
  /** Arquivo onde o dono preenche os dados do servidor de e-mail (SMTP). */
  arquivoConfigEmail: string;
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
  arquivoConfigEmail = op.arquivoConfigEmail;
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
  const { app } = await montarServidor(config, { logger: false, email: emailDoPrograma, repo, instancia });
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
