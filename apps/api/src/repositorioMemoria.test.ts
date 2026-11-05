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

describe('repositório em memória: guardar e restaurar o estado', () => {
  async function repoComDados() {
    const repo = criarRepositorioMemoria();
    const u = await repo.criarUsuario({ email: 'ana@exemplo.com', senhaHash: 'h', papel: 'cliente', emailVerificado: true });
    const m = await repo.criarMercado({ nome: 'Mercado A', endereco: 'Rua 1', nomeNorm: 'mercado a', enderecoNorm: 'rua 1', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const quando = new Date('2026-05-01T12:00:00.000Z');
    await repo.salvarOferta({
      mercadoId: m.id, codigoBarras: '7891000100103', nome: 'Leite', nomeNorm: 'leite', preco: 5.5,
      quantidadeTexto: '1 L', quantidadeValor: 1, quantidadeUnidade: 'L', categoria: null, disponivel: true,
      precoAtualizadoEm: quando, promocaoPreco: null, promocaoInicio: null, promocaoFim: quando,
    });
    await repo.guardarToken({ usuarioId: u.id, tipo: 'verificar_email', tokenHash: 'abc', expiraEm: new Date(Date.now() + 3_600_000) });
    await repo.registrarBusca({ usuarioId: u.id, termo: 'leite', resultados: 1, mercadosDistintos: 1 });
    return { repo, m, quando };
  }

  it('restaura usuários, mercados, ofertas (com as datas), tokens, buscas e contadores de id', async () => {
    const { repo, m, quando } = await repoComDados();
    const texto = await repo.exportarEstado();

    const novo = criarRepositorioMemoria();
    novo.importarEstado(texto);

    expect((await novo.acharUsuarioPorEmail('ana@exemplo.com'))?.id).toBe(1);
    expect(await novo.listarMercados()).toHaveLength(1);
    const oferta = await novo.acharOferta(m.id, '7891000100103');
    expect(oferta?.precoAtualizadoEm).toEqual(quando);
    expect(oferta?.promocaoFim).toEqual(quando);
    expect(oferta?.promocaoInicio).toBeNull();
    expect(await novo.listarBuscas()).toHaveLength(1);
    expect(await novo.consumirToken('verificar_email', 'abc', new Date())).toBe(1);
    // Os próximos ids continuam de onde pararam.
    const outro = await novo.criarUsuario({ email: 'bia@exemplo.com', senhaHash: 'h', papel: 'cliente', emailVerificado: false });
    expect(outro.id).toBe(2);
  });

  it('recusa texto que não é um estado salvo', () => {
    const repo = criarRepositorioMemoria();
    expect(() => repo.importarEstado('isso não é json')).toThrow();
    expect(() => repo.importarEstado('{"versao":1,"dados":{}}')).toThrow('Estado salvo inválido');
    expect(() => repo.importarEstado('{"versao":2}')).toThrow('Estado salvo inválido');
  });
});
