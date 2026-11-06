import { describe, expect, it } from 'vitest';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { garantirAdmin, sincronizarSenhaDoAdmin } from './admin';
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

describe('sincronizarSenhaDoAdmin', () => {
  it('troca a senha do administrador quando a configurada é outra', async () => {
    const repo = criarRepositorioMemoria();
    await garantirAdmin(repo, 'admin@exemplo.com', 'senha-antiga-1');
    expect(await sincronizarSenhaDoAdmin(repo, 'Admin@Exemplo.com', 'senha-nova-2')).toBe(true);
    const admin = await repo.acharUsuarioPorEmail('admin@exemplo.com');
    expect(await conferirSenha('senha-nova-2', admin!.senhaHash)).toBe(true);
    expect(await conferirSenha('senha-antiga-1', admin!.senhaHash)).toBe(false);
  });

  it('não faz nada quando a senha já é a configurada', async () => {
    const repo = criarRepositorioMemoria();
    await garantirAdmin(repo, 'admin@exemplo.com', 'senha-igual-1');
    const antes = await repo.acharUsuarioPorEmail('admin@exemplo.com');
    expect(await sincronizarSenhaDoAdmin(repo, 'admin@exemplo.com', 'senha-igual-1')).toBe(false);
    expect(await repo.acharUsuarioPorEmail('admin@exemplo.com')).toEqual(antes);
  });

  it('não cria conta e não mexe em quem não é administrador', async () => {
    const repo = criarRepositorioMemoria();
    expect(await sincronizarSenhaDoAdmin(repo, 'admin@exemplo.com', 'qualquer-senha-1')).toBe(false);
    expect(await repo.acharUsuarioPorEmail('admin@exemplo.com')).toBeNull();
    const cliente = await repo.criarUsuario({ email: 'admin@exemplo.com', senhaHash: await hashSenha('senha-do-cliente'), papel: 'cliente', emailVerificado: false });
    expect(await sincronizarSenhaDoAdmin(repo, 'admin@exemplo.com', 'qualquer-senha-1')).toBe(false);
    expect(await repo.acharUsuario(cliente.id)).toEqual(cliente);
  });
});
