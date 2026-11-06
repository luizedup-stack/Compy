// Envio de e-mails (códigos de confirmação de conta e de redefinição de senha).
// A API só conhece a interface `EmailSender`; quem monta a API escolhe a implementação:
//  - criarEmailConsole: só escreve no log (desenvolvimento, nada é enviado);
//  - criarEmailMemoria: guarda numa lista (testes);
//  - criarEmailSmtp: envia de verdade por um servidor SMTP (Gmail, Outlook, Brevo, SendGrid, Amazon SES...).
import nodemailer, { type Transporter } from 'nodemailer';

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

/** Dados do servidor de e-mail (SMTP) que vai enviar as mensagens. */
export interface ConfigSmtp {
  /** Ex.: smtp.gmail.com */
  host: string;
  /** Ex.: 465 (conexão segura direta) ou 587 (começa aberta e passa a segura). */
  porta: number;
  /** true para a porta 465; false para 587 (o STARTTLS é usado automaticamente). */
  seguro: boolean;
  usuario: string;
  /** A senha (ou "senha de aplicativo") da conta que envia. */
  senha: string;
  /** Remetente que aparece para quem recebe. Ex.: "Bolso Certo <conta@gmail.com>". */
  de: string;
}

/** Confere se a configuração tem tudo o que é preciso. Devolve o motivo do problema, ou null se está completa. */
export function problemaNaConfigSmtp(c: Partial<ConfigSmtp> | null | undefined): string | null {
  if (!c) return 'Configuração de e-mail ausente';
  if (!c.host || typeof c.host !== 'string' || c.host.includes('PREENCHA')) return 'Falta o servidor (host)';
  if (!Number.isInteger(c.porta) || (c.porta as number) < 1 || (c.porta as number) > 65535) return 'Porta inválida';
  if (!c.usuario || c.usuario.includes('PREENCHA')) return 'Falta o usuário';
  if (!c.senha || c.senha.includes('PREENCHA')) return 'Falta a senha';
  if (!c.de || c.de.includes('PREENCHA')) return 'Falta o remetente (de)';
  return null;
}

/**
 * Envia por SMTP de verdade. `criarTransporte` existe para os testes trocarem o envio por um falso;
 * por padrão usa o nodemailer com os dados informados. Se o envio falhar, `enviar` lança o erro.
 */
export function criarEmailSmtp(
  config: ConfigSmtp,
  criarTransporte: (c: ConfigSmtp) => Pick<Transporter, 'sendMail'> = (c) =>
    nodemailer.createTransport({
      host: c.host,
      port: c.porta,
      secure: c.seguro,
      auth: { user: c.usuario, pass: c.senha },
      // Tempos curtos: um servidor de e-mail fora do ar não pode segurar o cadastro por minutos.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    }),
): EmailSender {
  return {
    async enviar(para, assunto, texto) {
      await criarTransporte(config).sendMail({ from: config.de, to: para, subject: assunto, text: texto });
    },
  };
}
