import type { Repositorio } from '../repositorio';
import { hashSenha } from './senha';

/** Cria o administrador (já com e-mail verificado) se ainda não existe usuário com esse e-mail. */
export async function garantirAdmin(repo: Repositorio, email: string, senha: string): Promise<void> {
  const emailNorm = email.trim().toLowerCase();
  if (await repo.acharUsuarioPorEmail(emailNorm)) return;
  await repo.criarUsuario({
    email: emailNorm,
    senhaHash: await hashSenha(senha),
    papel: 'admin',
    emailVerificado: true,
  });
}
