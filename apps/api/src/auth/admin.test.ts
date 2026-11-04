import { describe, expect, it } from 'vitest';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { garantirAdmin } from './admin';
import { conferirSenha, hashSenha } from './senha';

describe('garantirAdmin', () => {
  it('cria um administrador já verificado quando o e-mail não existe', async () => {
    const repo = criarRepositorioMemoria();
    await garantirAdmin(repo, 'Admin@Exemplo.com', 'senha-do-admin');
    const admin = await repo.acharUsuarioPorEmail('admin@exemplo.com');
    expect(admin).toMatchObject({ papel: 'admin', emailVerificado: true, email: 'admin@exemplo.com' });
    expect(await conferirSenha('senha-do-admin', admin!.senhaHash)).toBe(true);
  });

  it('é idempotente: a segunda chamada não altera nada', async () => {
    const repo = criarRepositorioMemoria();
    await garantirAdmin(repo, 'admin@exemplo.com', 'senha-do-admin');
    const antes = await repo.acharUsuarioPorEmail('admin@exemplo.com');
    await garantirAdmin(repo, 'admin@exemplo.com', 'outra-senha-qualquer');
    const depois = await repo.acharUsuarioPorEmail('admin@exemplo.com');
    expect(depois).toEqual(antes);
  });

  it('não mexe em um usuário que já usa o e-mail', async () => {
    const repo = criarRepositorioMemoria();
    const existente = await repo.criarUsuario({
      email: 'admin@exemplo.com',
      senhaHash: await hashSenha('senha-antiga'),
      papel: 'cliente',
      emailVerificado: false,
    });
    await garantirAdmin(repo, 'ADMIN@exemplo.com', 'senha-do-admin');
    expect(await repo.acharUsuario(existente.id)).toEqual(existente);
  });
});
