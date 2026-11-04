import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { criarEmailMemoria } from '../email';
import { construirApp } from '../app';
import { hashSenha } from '../auth/senha';
import type { Papel, Repositorio } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';

/** Apoio dos testes das rotas (não é um arquivo de teste). */
export const PASTA_DADOS = path.resolve(__dirname, '../../../../dados-de-teste');
export const lerPlanilha = (nome: string): Buffer => readFileSync(path.join(PASTA_DADOS, nome));
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface Ambiente {
  repo: Repositorio;
  app: FastifyInstance;
  criarComPapel(papel: Papel, email?: string): Promise<{ id: number; token: string }>;
}

export async function criarAmbiente(): Promise<Ambiente> {
  const repo = criarRepositorioMemoria();
  const app = await construirApp({ repo, email: criarEmailMemoria(), jwtSecret: 'segredo-de-teste' });
  return {
    repo,
    app,
    async criarComPapel(papel, email = `${papel}@exemplo.com`) {
      const u = await repo.criarUsuario({
        email,
        senhaHash: await hashSenha('senha-boa-123'),
        papel,
        emailVerificado: true,
      });
      return { id: u.id, token: app.jwt.sign({ id: u.id, papel: u.papel }) };
    },
  };
}

/** Monta um corpo multipart/form-data com um único arquivo. */
export function corpoMultipart(
  campo: string,
  arquivo: Buffer,
  nomeArquivo = 'planilha.xlsx',
): { payload: Buffer; headers: Record<string, string> } {
  const limite = '----BolsoCertoTeste7f3a';
  const cabeca = Buffer.from(
    `--${limite}\r\nContent-Disposition: form-data; name="${campo}"; filename="${nomeArquivo}"\r\n` +
      `Content-Type: ${TIPO_XLSX}\r\n\r\n`,
  );
  const cauda = Buffer.from(`\r\n--${limite}--\r\n`);
  return {
    payload: Buffer.concat([cabeca, arquivo, cauda]),
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
  };
}

export const comToken = (token: string) => ({ authorization: `Bearer ${token}` });

export async function enviarPlanilha(
  app: FastifyInstance,
  token: string | null,
  arquivo: Buffer,
  campo = 'arquivo',
) {
  const { payload, headers } = corpoMultipart(campo, arquivo);
  return app.inject({
    method: 'POST',
    url: '/planilhas',
    payload,
    headers: token ? { ...headers, ...comToken(token) } : headers,
  });
}
