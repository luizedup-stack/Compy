import type { Repositorio } from '../repositorio';
import { conferirSenha, hashSenha } from './senha';

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

/**
 * Faz a senha do administrador existente valer a que foi configurada agora (a configuração manda).
 * Serve ao programa de computador: os dados salvos de uma abertura anterior podem trazer a senha antiga, e uma senha
 * trocada não pode continuar valendo. Só mexe numa conta de papel "admin" com esse e-mail; não cria conta.
 * Devolve true se a senha foi trocada.
 */
export async function sincronizarSenhaDoAdmin(repo: Repositorio, email: string, senha: string): Promise<boolean> {
  const admin = await repo.acharUsuarioPorEmail(email.trim().toLowerCase());
  if (!admin || admin.papel !== 'admin') return false;
  if (await conferirSenha(senha, admin.senhaHash)) return false;
  await repo.atualizarUsuario(admin.id, { senhaHash: await hashSenha(senha) });
  return true;
}
