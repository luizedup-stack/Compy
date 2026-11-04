import { describe, expect, it } from 'vitest';
import {
  ErroEmailJaExiste,
  ErroMercadoDuplicado,
  type Mercado,
  type OfertaArmazenada,
  type Repositorio,
  type Usuario,
} from './repositorio';

const novoUsuario = (email = 'ana@exemplo.com'): Omit<Usuario, 'id'> => ({
  email,
  senhaHash: 'hash',
  papel: 'cliente',
  emailVerificado: false,
});

const novoMercado = (
  nome = 'Mercado Central',
  endereco = 'Rua A, 10',
): Omit<Mercado, 'id'> => ({
  nome,
  endereco,
  nomeNorm: nome.toLowerCase(),
  enderecoNorm: endereco.toLowerCase(),
  status: 'ativo',
  contaSituacao: 'gratuita',
  usuarioId: null,
});

const novaOferta = (mercadoId: number, codigoBarras = '7891000100103'): OfertaArmazenada => ({
  mercadoId,
  codigoBarras,
  nome: 'Leite Integral 1L',
  nomeNorm: 'leite integral 1l',
  preco: 5.99,
  quantidadeTexto: '1 L',
  quantidadeValor: 1,
  quantidadeUnidade: 'L',
  categoria: 'Laticínios',
  disponivel: true,
  precoAtualizadoEm: new Date('2026-11-01T10:00:00Z'),
  promocaoPreco: null,
  promocaoInicio: null,
  promocaoFim: null,
});

const AGORA = new Date('2026-11-04T00:00:00Z');
const AMANHA = new Date('2026-11-05T00:00:00Z');

export function testarRepositorio(nome: string, criar: () => Promise<Repositorio>): void {
  describe(`contrato do repositório: ${nome}`, () => {
    describe('usuários', () => {
      it('cria e acha usuário por id e por e-mail', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        expect(u.id).toBeTypeOf('number');
        expect(await repo.acharUsuario(u.id)).toEqual(u);
        expect(await repo.acharUsuarioPorEmail('ana@exemplo.com')).toEqual(u);
        expect(await repo.acharUsuario(u.id + 100)).toBeNull();
        expect(await repo.acharUsuarioPorEmail('outra@exemplo.com')).toBeNull();
      });

      it('rejeita e-mail repetido em caixa diferente', async () => {
        const repo = await criar();
        await repo.criarUsuario(novoUsuario('Ana@Exemplo.com'));
        await expect(repo.criarUsuario(novoUsuario('ana@exemplo.COM'))).rejects.toBeInstanceOf(
          ErroEmailJaExiste,
        );
      });

      it('acha por e-mail sem diferenciar maiúsculas e devolve o e-mail como foi gravado', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario('Ana@Exemplo.com'));
        const achado = await repo.acharUsuarioPorEmail('ANA@exemplo.com');
        expect(achado?.id).toBe(u.id);
        expect(achado?.email).toBe('Ana@Exemplo.com');
      });

      it('atualiza usuário', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        await repo.atualizarUsuario(u.id, { emailVerificado: true, papel: 'mercado' });
        expect(await repo.acharUsuario(u.id)).toEqual({ ...u, emailVerificado: true, papel: 'mercado' });
      });
    });

    describe('usuários (e-mail em atualização)', () => {
      it('atualizarUsuario para o e-mail de outro usuário lança ErroEmailJaExiste', async () => {
        const repo = await criar();
        await repo.criarUsuario(novoUsuario('ana@exemplo.com'));
        const b = await repo.criarUsuario(novoUsuario('bia@exemplo.com'));
        await expect(repo.atualizarUsuario(b.id, { email: 'ANA@exemplo.com' })).rejects.toBeInstanceOf(
          ErroEmailJaExiste,
        );
        expect((await repo.acharUsuario(b.id))?.email).toBe('bia@exemplo.com');
        await repo.atualizarUsuario(b.id, { email: 'Bia@Exemplo.com' });
        expect((await repo.acharUsuario(b.id))?.email).toBe('Bia@Exemplo.com');
      });
    });

    describe('tokens', () => {
      it('consumirToken devolve o usuarioId uma vez e depois null', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        await repo.guardarToken({ usuarioId: u.id, tipo: 'verificar_email', tokenHash: 'abc', expiraEm: AMANHA });
        expect(await repo.consumirToken('verificar_email', 'abc', AGORA)).toBe(u.id);
        expect(await repo.consumirToken('verificar_email', 'abc', AGORA)).toBeNull();
      });

      it('token expirado devolve null', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        await repo.guardarToken({ usuarioId: u.id, tipo: 'redefinir_senha', tokenHash: 'abc', expiraEm: AGORA });
        expect(
          await repo.consumirToken('redefinir_senha', 'abc', new Date('2026-11-04T00:00:01Z')),
        ).toBeNull();
      });

      it('token inexistente ou de outro tipo devolve null', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        await repo.guardarToken({ usuarioId: u.id, tipo: 'verificar_email', tokenHash: 'abc', expiraEm: AMANHA });
        expect(await repo.consumirToken('verificar_email', 'zzz', AGORA)).toBeNull();
        expect(await repo.consumirToken('redefinir_senha', 'abc', AGORA)).toBeNull();
      });
    });

    describe('mercados', () => {
      it('cria e acha mercado por id, chave e usuário', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        const m = await repo.criarMercado({ ...novoMercado(), usuarioId: u.id });
        expect(await repo.acharMercado(m.id)).toEqual(m);
        expect(await repo.acharMercadoPorChave(m.nomeNorm, m.enderecoNorm)).toEqual(m);
        expect(await repo.acharMercadoDoUsuario(u.id)).toEqual(m);
        expect(await repo.acharMercado(m.id + 100)).toBeNull();
        expect(await repo.acharMercadoPorChave('x', 'y')).toBeNull();
        expect(await repo.acharMercadoDoUsuario(u.id + 100)).toBeNull();
        expect(await repo.listarMercados()).toEqual([m]);
      });

      it('criarMercado com a mesma chave lança ErroMercadoDuplicado', async () => {
        const repo = await criar();
        await repo.criarMercado(novoMercado());
        await expect(repo.criarMercado(novoMercado())).rejects.toBeInstanceOf(ErroMercadoDuplicado);
        expect(await repo.listarMercados()).toHaveLength(1);
      });

      it('atualizarMercado para a chave de outro mercado lança ErroMercadoDuplicado', async () => {
        const repo = await criar();
        const a = await repo.criarMercado(novoMercado('Mercado A', 'Rua 1'));
        const b = await repo.criarMercado(novoMercado('Mercado B', 'Rua 2'));
        await expect(
          repo.atualizarMercado(b.id, { nomeNorm: a.nomeNorm, enderecoNorm: a.enderecoNorm }),
        ).rejects.toBeInstanceOf(ErroMercadoDuplicado);
        expect(await repo.acharMercado(b.id)).toEqual(b);
      });

      it('atualizarMercado aplica mudanças sem colisão', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        await repo.atualizarMercado(m.id, { contaSituacao: 'ativa', nome: 'Novo Nome' });
        expect(await repo.acharMercado(m.id)).toEqual({ ...m, contaSituacao: 'ativa', nome: 'Novo Nome' });
        // manter a própria chave não é colisão
        await repo.atualizarMercado(m.id, { nomeNorm: m.nomeNorm, enderecoNorm: m.enderecoNorm });
      });
    });

    describe('ofertas', () => {
      it('salvarOferta duas vezes com a mesma chave deixa 1 oferta (a última)', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        await repo.salvarOferta(novaOferta(m.id));
        await repo.salvarOferta({ ...novaOferta(m.id), preco: 4.5 });
        const lista = await repo.listarOfertasDoMercado(m.id);
        expect(lista).toHaveLength(1);
        expect(lista[0]!.preco).toBe(4.5);
        expect((await repo.acharOferta(m.id, '7891000100103'))?.preco).toBe(4.5);
      });

      it('acha e remove oferta', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        await repo.salvarOferta(novaOferta(m.id));
        expect(await repo.acharOferta(m.id, 'inexistente')).toBeNull();
        expect(await repo.removerOferta(m.id, '7891000100103')).toBe(true);
        expect(await repo.removerOferta(m.id, '7891000100103')).toBe(false);
        expect(await repo.acharOferta(m.id, '7891000100103')).toBeNull();
      });

      it('listarOfertasDoMercado só devolve as ofertas daquele mercado', async () => {
        const repo = await criar();
        const a = await repo.criarMercado(novoMercado('A', 'Rua 1'));
        const b = await repo.criarMercado(novoMercado('B', 'Rua 2'));
        await repo.salvarOferta(novaOferta(a.id));
        await repo.salvarOferta(novaOferta(b.id));
        expect((await repo.listarOfertasDoMercado(a.id)).map((o) => o.mercadoId)).toEqual([a.id]);
      });

      it('listarOfertasParaBusca não devolve oferta indisponível nem de mercado removido', async () => {
        const repo = await criar();
        const ativo = await repo.criarMercado(novoMercado('Ativo', 'Rua 1'));
        const removido = await repo.criarMercado({ ...novoMercado('Removido', 'Rua 2'), status: 'removido' });
        await repo.salvarOferta(novaOferta(ativo.id, '7891000100103'));
        await repo.salvarOferta({ ...novaOferta(ativo.id, '7891000100104'), disponivel: false });
        await repo.salvarOferta(novaOferta(removido.id, '7891000100103'));
        const itens = await repo.listarOfertasParaBusca();
        expect(itens).toHaveLength(1);
        expect(itens[0]!.oferta.codigoBarras).toBe('7891000100103');
        expect(itens[0]!.oferta.mercadoId).toBe(ativo.id);
        expect(itens[0]!.mercado).toEqual(ativo);
      });

      it('preserva datas como Date', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        await repo.salvarOferta({
          ...novaOferta(m.id),
          promocaoPreco: 4,
          promocaoInicio: new Date('2026-11-02T00:00:00Z'),
          promocaoFim: new Date('2026-11-09T00:00:00Z'),
        });
        const o = (await repo.acharOferta(m.id, '7891000100103'))!;
        expect(o.precoAtualizadoEm).toBeInstanceOf(Date);
        expect(o.promocaoInicio).toBeInstanceOf(Date);
        expect(o.promocaoFim).toBeInstanceOf(Date);
        expect(o.promocaoFim!.toISOString()).toBe('2026-11-09T00:00:00.000Z');
        const [item] = await repo.listarOfertasParaBusca();
        expect(item!.oferta.precoAtualizadoEm).toBeInstanceOf(Date);
      });
    });

    describe('buscas e exclusão de usuário', () => {
      it('registra e lista buscas', async () => {
        const repo = await criar();
        await repo.registrarBusca({ usuarioId: null, termo: 'leite', resultados: 3, mercadosDistintos: 2 });
        expect(await repo.listarBuscas()).toEqual([
          { usuarioId: null, termo: 'leite', resultados: 3, mercadosDistintos: 2 },
        ]);
      });

      it('excluirUsuario apaga tokens, solta mercado.usuarioId e anonimiza buscas', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        const outro = await repo.criarUsuario(novoUsuario('outro@exemplo.com'));
        const m = await repo.criarMercado({ ...novoMercado(), usuarioId: u.id });
        await repo.guardarToken({ usuarioId: u.id, tipo: 'verificar_email', tokenHash: 'abc', expiraEm: AMANHA });
        await repo.registrarBusca({ usuarioId: u.id, termo: 'arroz', resultados: 1, mercadosDistintos: 1 });
        await repo.registrarBusca({ usuarioId: outro.id, termo: 'feijão', resultados: 2, mercadosDistintos: 1 });

        await repo.excluirUsuario(u.id);

        expect(await repo.acharUsuario(u.id)).toBeNull();
        expect(await repo.acharUsuarioPorEmail('ana@exemplo.com')).toBeNull();
        expect(await repo.consumirToken('verificar_email', 'abc', AGORA)).toBeNull();
        expect((await repo.acharMercado(m.id))?.usuarioId).toBeNull();
        expect(await repo.acharMercadoDoUsuario(u.id)).toBeNull();
        expect(await repo.listarBuscas()).toEqual([
          { usuarioId: null, termo: 'arroz', resultados: 1, mercadosDistintos: 1 },
          { usuarioId: outro.id, termo: 'feijão', resultados: 2, mercadosDistintos: 1 },
        ]);
        // o e-mail pode ser reaproveitado
        await expect(repo.criarUsuario(novoUsuario())).resolves.toBeDefined();
      });
    });

    describe('cópias', () => {
      it('alterar objetos devolvidos não altera o armazenado', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        u.email = 'alterado@exemplo.com';
        (await repo.acharUsuario(u.id))!.papel = 'admin';
        expect((await repo.acharUsuario(u.id))?.email).toBe('ana@exemplo.com');
        expect((await repo.acharUsuario(u.id))?.papel).toBe('cliente');

        const m = await repo.criarMercado(novoMercado());
        m.nome = 'Alterado';
        (await repo.listarMercados())[0]!.status = 'removido';
        (await repo.acharMercado(m.id))!.endereco = 'Alterado';
        const guardado = (await repo.acharMercado(m.id))!;
        expect(guardado.nome).toBe('Mercado Central');
        expect(guardado.status).toBe('ativo');
        expect(guardado.endereco).toBe('Rua A, 10');

        const entrada = novaOferta(m.id);
        await repo.salvarOferta(entrada);
        entrada.preco = 999;
        entrada.precoAtualizadoEm.setFullYear(2000);
        const o = (await repo.acharOferta(m.id, entrada.codigoBarras))!;
        expect(o.preco).toBe(5.99);
        expect(o.precoAtualizadoEm.toISOString()).toBe('2026-11-01T10:00:00.000Z');
        o.preco = 1;
        o.precoAtualizadoEm.setFullYear(2000);
        (await repo.listarOfertasDoMercado(m.id))[0]!.preco = 2;
        const [item] = await repo.listarOfertasParaBusca();
        item!.oferta.preco = 3;
        item!.mercado.nome = 'Alterado';
        const relido = (await repo.acharOferta(m.id, entrada.codigoBarras))!;
        expect(relido.preco).toBe(5.99);
        expect(relido.precoAtualizadoEm.toISOString()).toBe('2026-11-01T10:00:00.000Z');
        expect((await repo.acharMercado(m.id))?.nome).toBe('Mercado Central');

        const busca = { usuarioId: null, termo: 'leite', resultados: 1, mercadosDistintos: 1 };
        await repo.registrarBusca(busca);
        busca.termo = 'alterado';
        (await repo.listarBuscas())[0]!.termo = 'alterado';
        expect((await repo.listarBuscas())[0]!.termo).toBe('leite');
      });
    });

    describe('transacao', () => {
      it('devolve o resultado de fn e mantém o que foi gravado', async () => {
        const repo = await criar();
        const id = await repo.transacao(async (r) => (await r.criarMercado(novoMercado())).id);
        expect((await repo.acharMercado(id))?.nome).toBe('Mercado Central');
      });

      it('desfaz tudo o que foi gravado quando fn lança erro', async () => {
        const repo = await criar();
        await expect(
          repo.transacao(async (r) => {
            await r.criarMercado(novoMercado());
            throw new Error('falhou');
          }),
        ).rejects.toThrow('falhou');
        expect(await repo.listarMercados()).toEqual([]);
      });

      it('escrita feita fora da transação enquanto ela roda espera e sobrevive ao rollback', async () => {
        const repo = await criar();
        const tx = repo.transacao(async (r) => {
          await r.criarMercado(novoMercado());
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error('falhou');
        });
        // chamada no repositório externo enquanto a transação está suspensa: deve esperar
        await new Promise((resolve) => setTimeout(resolve, 5));
        const fora = repo.criarUsuario(novoUsuario());
        const [resultadoTx, usuario] = await Promise.allSettled([tx, fora]);
        expect(resultadoTx.status).toBe('rejected');
        expect(usuario.status).toBe('fulfilled');
        const criado = (usuario as PromiseFulfilledResult<Usuario>).value;
        expect(await repo.acharUsuario(criado.id)).toEqual(criado);
        expect(await repo.acharUsuarioPorEmail('ana@exemplo.com')).toEqual(criado);
        expect(await repo.listarMercados()).toEqual([]);
      });

      it('leitura feita fora da transação só resolve depois que ela termina', async () => {
        const repo = await criar();
        const eventos: string[] = [];
        const tx = repo.transacao(async (r) => {
          await r.criarMercado(novoMercado());
          await new Promise((resolve) => setTimeout(resolve, 20));
          eventos.push('transacao terminou');
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const leitura = repo.listarMercados().then((mercados) => {
          eventos.push('leitura resolveu');
          return mercados;
        });
        await Promise.all([tx, leitura]);
        expect(eventos).toEqual(['transacao terminou', 'leitura resolveu']);
        expect(await leitura).toHaveLength(1);
      });

      it('o repositório recebido é reentrante: transacao interna roda inline', async () => {
        const repo = await criar();
        const id = await repo.transacao(async (r) =>
          r.transacao(async (r2) => (await r2.criarMercado(novoMercado())).id),
        );
        expect((await repo.acharMercado(id))?.id).toBe(id);
      });

      it('erro numa transacao interna que se propaga desfaz também a externa', async () => {
        const repo = await criar();
        await expect(
          repo.transacao(async (r) => {
            await r.criarMercado(novoMercado('A', 'Rua 1'));
            await r.transacao(async (r2) => {
              await r2.criarMercado(novoMercado('B', 'Rua 2'));
              throw new Error('interno');
            });
          }),
        ).rejects.toThrow('interno');
        expect(await repo.listarMercados()).toEqual([]);
      });

      it('duas transacoes simultâneas rodam uma depois da outra', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        const incrementar = () =>
          repo.transacao(async (r) => {
            const o = await r.acharOferta(m.id, '7891000100103');
            // cede o controle: sem serialização, a outra transação leria o mesmo valor
            await new Promise((resolve) => setTimeout(resolve, 5));
            await r.salvarOferta({ ...(o ?? novaOferta(m.id)), preco: (o?.preco ?? 0) + 1 });
          });
        await Promise.all([incrementar(), incrementar()]);
        expect((await repo.acharOferta(m.id, '7891000100103'))?.preco).toBe(2);
      });

      it('uma transacao que falha não impede a seguinte', async () => {
        const repo = await criar();
        const falha = repo.transacao(async () => {
          throw new Error('falhou');
        });
        const ok = repo.transacao(async (r) => (await r.criarMercado(novoMercado())).id);
        await expect(falha).rejects.toThrow('falhou');
        await expect(ok).resolves.toBeTypeOf('number');
      });
    });
  });
}
