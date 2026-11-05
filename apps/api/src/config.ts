import { randomBytes } from 'node:crypto';
import path from 'node:path';

export type Config = {
  porta: number;
  host: string;
  producao: boolean;
  jwtSecret: string;
  adminEmail: string | null;
  adminSenha: string | null;
  carregarDadosDeTeste: boolean;
  pastaDadosDeTeste: string;
  /** Limites de requisições por endereço (R32). Ligado sempre, a menos que LIMITAR_REQUISICOES=0. */
  limitarRequisicoes: boolean;
};

const PASTA_PADRAO = path.resolve(__dirname, '../../../dados-de-teste');
const MIN_SEGREDO = 32;
const MIN_SENHA_ADMIN = 8;

/** Variável vazia (ou só com espaços) vale como não informada. */
const ler = (env: NodeJS.ProcessEnv, nome: string): string | null => {
  const valor = env[nome]?.trim();
  return valor ? valor : null;
};

function lerPorta(env: NodeJS.ProcessEnv): number {
  const texto = ler(env, 'PORT');
  if (texto === null) return 3000;
  const porta = Number(texto);
  if (!/^\d+$/.test(texto) || porta < 1 || porta > 65535) {
    throw new Error(`PORT inválida: use um número de 1 a 65535 (recebido: "${texto}").`);
  }
  return porta;
}

/**
 * Só estes valores (sem diferença de caixa e de espaços); vazio vale como desenvolvimento (R33a).
 * Qualquer outro faz o servidor não subir: "Production" ou "prod" não podem virar desenvolvimento.
 */
function lerProducao(env: NodeJS.ProcessEnv): boolean {
  const bruto = env.NODE_ENV ?? '';
  const valor = bruto.trim().toLowerCase();
  if (valor === '' || valor === 'development' || valor === 'test') return false;
  if (valor === 'production') return true;
  throw new Error(`NODE_ENV inválido: use development, test ou production (recebido: "${bruto}").`);
}

/** Lê a configuração do ambiente. Em produção, o que falta ou é fraco faz o servidor não subir. */
export function lerConfig(env: NodeJS.ProcessEnv): Config {
  const producao = lerProducao(env);
  const segredo = ler(env, 'JWT_SECRET');
  const adminEmail = ler(env, 'ADMIN_EMAIL');
  const adminSenha = ler(env, 'ADMIN_SENHA');

  if (producao) {
    if (segredo === null) {
      throw new Error(`A variável JWT_SECRET é obrigatória em produção (mínimo de ${MIN_SEGREDO} caracteres).`);
    }
    if (segredo.length < MIN_SEGREDO) {
      throw new Error(`JWT_SECRET é curta demais: use pelo menos ${MIN_SEGREDO} caracteres (tem ${segredo.length}).`);
    }
    if (adminEmail === null) throw new Error('A variável ADMIN_EMAIL é obrigatória em produção.');
    if (adminSenha === null) throw new Error('A variável ADMIN_SENHA é obrigatória em produção.');
    if (adminSenha.length < MIN_SENHA_ADMIN) {
      throw new Error(`ADMIN_SENHA é curta demais: use pelo menos ${MIN_SENHA_ADMIN} caracteres.`);
    }
  }

  const completo = adminEmail !== null && adminSenha !== null;
  const flagDados = ler(env, 'CARREGAR_DADOS_DE_TESTE');
  return {
    porta: lerPorta(env),
    host: ler(env, 'HOST') ?? '0.0.0.0',
    producao,
    jwtSecret: segredo ?? randomBytes(32).toString('hex'),
    adminEmail: completo ? adminEmail : null,
    adminSenha: completo ? adminSenha : null,
    carregarDadosDeTeste: flagDados === null ? !producao : flagDados === '1',
    pastaDadosDeTeste: ler(env, 'PASTA_DADOS_DE_TESTE') ?? PASTA_PADRAO,
    limitarRequisicoes: ler(env, 'LIMITAR_REQUISICOES') !== '0',
  };
}
