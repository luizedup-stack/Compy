import { describe, expect, it } from 'vitest';
import { testarRepositorio } from './repositorio.contrato';
import { criarRepositorioMemoria } from './repositorioMemoria';

testarRepositorio('repositório em memória', async () => criarRepositorioMemoria());

describe('repositório em memória: crescimento limitado (R32)', () => {
  it('o custo de uma transacao não cresce com o número de buscas registradas', async () => {
    const repo = criarRepositorioMemoria();
    for (let i = 0; i < 100_000; i++) {
      await repo.registrarBusca({ usuarioId: null, termo: `termo ${i}`, resultados: 0, mercadosDistintos: 0 });
    }
    const inicio = Date.now();
    for (let i = 0; i < 100; i++) await repo.transacao(async () => undefined);
    expect(Date.now() - inicio).toBeLessThan(1000);
    expect(await repo.listarBuscas()).toHaveLength(100_000);
  });

  it('guardarToken descarta os tokens já vencidos', async () => {
    const repo = criarRepositorioMemoria();
    const u = await repo.criarUsuario({ email: 'ana@exemplo.com', senhaHash: 'h', papel: 'cliente', emailVerificado: false });
    const agora = Date.now();
    await repo.guardarToken({ usuarioId: u.id, tipo: 'redefinir_senha', tokenHash: 'velho', expiraEm: new Date(agora - 60_000) });
    await repo.guardarToken({ usuarioId: u.id, tipo: 'redefinir_senha', tokenHash: 'novo', expiraEm: new Date(agora + 3_600_000) });
    // Com um "agora" no passado o token vencido ainda valeria, se tivesse sido guardado.
    expect(await repo.consumirToken('redefinir_senha', 'velho', new Date(agora - 120_000))).toBeNull();
    expect(await repo.consumirToken('redefinir_senha', 'novo', new Date(agora))).toBe(u.id);
  });
});
