import { describe, expect, it } from 'vitest';
import {
  ErroEmailJaExiste,
  ErroMercadoDuplicado,
  type FotoProduto,
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

const novaFoto = (codigoBarras = '7891000100103', parcial: Partial<FotoProduto> = {}): FotoProduto => ({
  codigoBarras,
  origem: 'openfoodfacts',
  url: `https://images.openfoodfacts.org/images/products/${codigoBarras}/front_pt.200.jpg`,
  imagem: null,
  mercadoId: null,
  atualizadaEm: new Date('2026-11-07T12:00:00.000Z'),
  ...parcial,
});

const AGORA = new Date('2026-11-04T00:00:00Z');
const AMANHA = new Date('2026-11-05T00:00:00Z');

export interface OpcoesContrato {
  /**
   * true (padrão, versão em memória): uma leitura feita fora da transação espera ela terminar (fila única).
   * false (banco de dados): a leitura não espera, mas também não pode ver dados ainda não confirmados.
   */
  leituraEsperaTransacao?: boolean;
}

export function testarRepositorio(nome: string, criar: () => Promise<Repositorio>, { leituraEsperaTransacao = true }: OpcoesContrato = {}): void {
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
      it('reativarMercadosVencidos devolve ao ar só quem está sem acesso com prazo vencido', async () => {
        const repo = await criar();
        const vencido = await repo.criarMercado(novoMercado('Vencido', 'Rua 1'));
        const aindaNoPrazo = await repo.criarMercado(novoMercado('No prazo', 'Rua 2'));
        const permanente = await repo.criarMercado(novoMercado('Permanente', 'Rua 3'));
        const ativo = await repo.criarMercado(novoMercado('Ativo', 'Rua 4'));
        await repo.atualizarMercado(vencido.id, { status: 'removido', removidoAte: new Date('2026-11-01T00:00:00Z') });
        await repo.atualizarMercado(aindaNoPrazo.id, { status: 'removido', removidoAte: new Date('2026-12-01T00:00:00Z') });
        await repo.atualizarMercado(permanente.id, { status: 'removido', removidoAte: null });
        expect((await repo.acharMercado(aindaNoPrazo.id))?.removidoAte?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
        expect(await repo.reativarMercadosVencidos(new Date('2026-11-09T00:00:00Z'))).toBe(1);
        expect(await repo.reativarMercadosVencidos(new Date('2026-11-09T00:00:00Z'))).toBe(0);
        expect(await repo.acharMercado(vencido.id)).toMatchObject({ status: 'ativo' });
        expect((await repo.acharMercado(vencido.id))?.removidoAte ?? null).toBeNull();
        expect((await repo.acharMercado(aindaNoPrazo.id))?.status).toBe('removido');
        expect((await repo.acharMercado(permanente.id))?.status).toBe('removido');
        expect((await repo.acharMercado(ativo.id))?.status).toBe('ativo');
      });

      it('apagarMercado apaga o mercado e as ofertas dele, e só as dele', async () => {
        const repo = await criar();
        const a = await repo.criarMercado(novoMercado('A', 'Rua 1'));
        const b = await repo.criarMercado(novoMercado('B', 'Rua 2'));
        await repo.salvarOferta(novaOferta(a.id));
        await repo.salvarOferta(novaOferta(b.id));
        await repo.salvarFoto({ codigoBarras: '7891000100103', origem: 'mercado', url: null, imagem: 'data:image/jpeg;base64,AAAA', mercadoId: a.id, atualizadaEm: new Date() });
        expect(await repo.apagarMercado(a.id)).toBe(true);
        expect(await repo.apagarMercado(a.id)).toBe(false);
        expect(await repo.acharMercado(a.id)).toBeNull();
        expect(await repo.listarOfertasDoMercado(a.id)).toEqual([]);
        expect(await repo.listarOfertasDoMercado(b.id)).toHaveLength(1);
        expect((await repo.listarMercados()).map((m) => m.id)).toEqual([b.id]);
        expect(await repo.acharFoto('7891000100103')).toMatchObject({ mercadoId: null }); // a foto fica, sem dono
      });

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

      it('um usuário pode ter vários mercados: listarMercadosDoUsuario devolve todos, por id', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        const outro = await repo.criarUsuario({ ...novoUsuario(), email: 'outro@exemplo.com' });
        const a = await repo.criarMercado({ ...novoMercado(), usuarioId: u.id });
        const b = await repo.criarMercado({ ...novoMercado(), nome: 'Segundo', nomeNorm: 'segundo', usuarioId: u.id });
        await repo.criarMercado({ ...novoMercado(), nome: 'De outro', nomeNorm: 'de outro', usuarioId: outro.id });
        expect(await repo.listarMercadosDoUsuario(u.id)).toEqual([a, b]);
        expect(await repo.acharMercadoDoUsuario(u.id)).toEqual(a); // o primeiro
        expect(await repo.listarMercadosDoUsuario(u.id + 100)).toEqual([]);
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

      it('salvarOfertas grava muitas de uma vez: atualiza as que existem, insere as novas na ordem e aceita lotes grandes', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        await repo.salvarOferta({ ...novaOferta(m.id, '7891000100103'), preco: 1 });
        const muitas = Array.from({ length: 1203 }, (_, i) => ({ ...novaOferta(m.id, String(7890000000000 + i)), nome: `Produto ${i}`, preco: 2 + (i % 7) }));
        await repo.salvarOfertas([{ ...novaOferta(m.id, '7891000100103'), preco: 9.9, promocaoPreco: 8.5, promocaoInicio: new Date('2026-11-01T00:00:00Z'), promocaoFim: new Date('2026-11-30T00:00:00Z') }, ...muitas]);
        const lista = await repo.listarOfertasDoMercado(m.id);
        expect(lista).toHaveLength(1204);
        expect(lista[0]!.codigoBarras).toBe('7891000100103'); // já existia: continua na primeira posição
        expect(lista[0]).toMatchObject({ preco: 9.9, promocaoPreco: 8.5 });
        expect(lista[0]!.promocaoFim?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
        expect(lista.slice(1).map((o) => o.codigoBarras)).toEqual(muitas.map((o) => o.codigoBarras)); // as novas, na ordem em que vieram
        expect((await repo.acharOferta(m.id, '7890000000010'))?.nome).toBe('Produto 10');
        await repo.salvarOfertas([]); // lista vazia não faz nada
        expect(await repo.listarOfertasDoMercado(m.id)).toHaveLength(1204);
      });

      it('salvarFotosDoMercado: vira a foto de todos só onde não há foto de verdade; onde já há, a do mercado fica só para ele', async () => {
        const repo = await criar();
        const a = await repo.criarMercado(novoMercado('A', 'Rua 1'));
        const b = await repo.criarMercado(novoMercado('B', 'Rua 2'));
        const em = new Date('2026-11-05T00:00:00Z');
        const IMG = (x: string) => `data:image/jpeg;base64,${x}`;
        // 1 não tem foto; 2 tem ilustrativa; 3 tem foto achada no banco aberto; 4 já tem foto enviada por B; 5 tem "procurou e não achou"
        await repo.salvarFoto({ codigoBarras: '7890000000002', origem: 'ilustrativa', url: null, imagem: IMG('ILU'), mercadoId: null, atualizadaEm: em });
        await repo.salvarFoto({ codigoBarras: '7890000000003', origem: 'openfoodfacts', url: 'https://off.exemplo.com/3.jpg', imagem: IMG('OFF'), mercadoId: null, atualizadaEm: em });
        await repo.salvarFoto({ codigoBarras: '7890000000004', origem: 'mercado', url: null, imagem: IMG('DOB'), mercadoId: b.id, atualizadaEm: em });
        await repo.salvarFoto({ codigoBarras: '7890000000005', origem: 'openfoodfacts', url: null, imagem: null, mercadoId: null, atualizadaEm: em });
        const depois = new Date('2026-11-09T00:00:00Z');
        await repo.salvarFotosDoMercado(
          a.id,
          ['7890000000001', '7890000000002', '7890000000003', '7890000000004', '7890000000005'].map((c) => ({ codigoBarras: c, imagem: IMG(`A${c.slice(-1)}`) })),
          depois,
        );
        // vira de todos: sem foto, ilustrativa e "não achou"
        for (const c of ['1', '2', '5']) expect(await repo.acharFoto(`789000000000${c}`)).toMatchObject({ origem: 'mercado', imagem: IMG(`A${c}`), mercadoId: a.id });
        // já existiam de verdade: a compartilhada fica como estava e a de A fica só de A
        expect(await repo.acharFoto('7890000000003')).toMatchObject({ origem: 'openfoodfacts', imagem: IMG('OFF') });
        expect(await repo.acharFoto('7890000000004')).toMatchObject({ origem: 'mercado', imagem: IMG('DOB'), mercadoId: b.id });
        expect(await repo.acharFotoDoMercado(a.id, '7890000000003')).toMatchObject({ imagem: IMG('A3') });
        expect(await repo.acharFotoDoMercado(a.id, '7890000000004')).toMatchObject({ imagem: IMG('A4') });
        expect(await repo.acharFotoDoMercado(a.id, '7890000000001')).toBeNull(); // virou a compartilhada: não precisa de própria
        expect(await repo.acharFotoDoMercado(b.id, '7890000000003')).toBeNull(); // dos outros mercados: nada
        expect(await repo.listarCodigosComFotoDoMercado(a.id, ['7890000000001', '7890000000003', '7890000000004'])).toEqual(['7890000000003', '7890000000004']);
        expect(await repo.listarCodigosComFotoDoMercado(b.id, ['7890000000003'])).toEqual([]);

        // enviar de novo troca a própria; o dono da compartilhada pode trocar a compartilhada
        await repo.salvarFotosDoMercado(a.id, [{ codigoBarras: '7890000000003', imagem: IMG('A3NOVA') }, { codigoBarras: '7890000000001', imagem: IMG('A1NOVA') }], depois);
        expect((await repo.acharFotoDoMercado(a.id, '7890000000003'))?.imagem).toBe(IMG('A3NOVA'));
        expect((await repo.acharFoto('7890000000001'))?.imagem).toBe(IMG('A1NOVA'));
        // apagar a própria
        expect(await repo.removerFotoDoMercado(a.id, '7890000000003')).toBe(true);
        expect(await repo.removerFotoDoMercado(a.id, '7890000000003')).toBe(false);
      });

      it('salvarFotosDoMercado com links: link vira própria onde já há foto de verdade, fica pendente até baixar, e não refaz link igual nem troca imagem do próprio mercado', async () => {
        const repo = await criar();
        const a = await repo.criarMercado(novoMercado('A', 'Rua 1'));
        const b = await repo.criarMercado(novoMercado('B', 'Rua 2'));
        const em = new Date('2026-11-05T00:00:00Z');
        await repo.salvarFoto({ codigoBarras: '7890000000003', origem: 'openfoodfacts', url: 'https://off.exemplo.com/3.jpg', imagem: 'data:image/jpeg;base64,OFF', mercadoId: null, atualizadaEm: em });
        await repo.salvarFotosDoMercado(
          a.id,
          [{ codigoBarras: '7890000000001', url: 'https://l.exemplo.com/1.jpg' }, { codigoBarras: '7890000000003', url: 'https://l.exemplo.com/3.jpg' }],
          em,
        );
        // sem foto antes: o link vira a compartilhada (pendente); com foto de verdade: o link fica só de A (pendente)
        expect(await repo.acharFoto('7890000000001')).toMatchObject({ origem: 'planilha', url: 'https://l.exemplo.com/1.jpg', imagem: null, mercadoId: a.id });
        expect(await repo.acharFotoDoMercado(a.id, '7890000000003')).toMatchObject({ url: 'https://l.exemplo.com/3.jpg', imagem: null });
        expect(await repo.acharFoto('7890000000003')).toMatchObject({ origem: 'openfoodfacts', imagem: 'data:image/jpeg;base64,OFF' });
        expect(await repo.listarCodigosComFotoDoMercado(a.id, ['7890000000003'])).toEqual([]); // ainda sem imagem
        expect(await repo.listarFotosDoMercadoParaBaixar(10)).toEqual([{ mercadoId: a.id, codigoBarras: '7890000000003', url: 'https://l.exemplo.com/3.jpg' }]);

        await repo.guardarImagemDaFotoDoMercado(a.id, '7890000000003', 'https://outro.exemplo.com/x.jpg', 'data:image/jpeg;base64,ERRADA', em); // link já mudou: ignora
        expect((await repo.acharFotoDoMercado(a.id, '7890000000003'))?.imagem).toBeNull();
        await repo.guardarImagemDaFotoDoMercado(a.id, '7890000000003', 'https://l.exemplo.com/3.jpg', 'data:image/jpeg;base64,BAIXADA', em);
        expect((await repo.acharFotoDoMercado(a.id, '7890000000003'))?.imagem).toBe('data:image/jpeg;base64,BAIXADA');
        expect(await repo.listarFotosDoMercadoParaBaixar(10)).toEqual([]);

        // o mesmo link de novo não refaz; outro link do mesmo mercado não troca a imagem já guardada de um envio à mão
        await repo.salvarFotosDoMercado(a.id, [{ codigoBarras: '7890000000003', url: 'https://l.exemplo.com/3.jpg' }, { codigoBarras: '7890000000003', url: 'https://l.exemplo.com/NOVO.jpg' }], em);
        expect((await repo.acharFotoDoMercado(a.id, '7890000000003'))?.imagem).toBe('data:image/jpeg;base64,BAIXADA');
        // B também tem foto própria do produto 3, sem mexer na de A
        await repo.salvarFotosDoMercado(b.id, [{ codigoBarras: '7890000000003', imagem: 'data:image/jpeg;base64,DOB' }], em);
        expect((await repo.acharFotoDoMercado(b.id, '7890000000003'))?.imagem).toBe('data:image/jpeg;base64,DOB');
        expect((await repo.acharFotoDoMercado(a.id, '7890000000003'))?.imagem).toBe('data:image/jpeg;base64,BAIXADA');
        // link de quem é o dono da compartilhada não troca a imagem que ele mesmo enviou
        await repo.salvarFotosDoMercado(a.id, [{ codigoBarras: '7890000000009', imagem: 'data:image/jpeg;base64,MINHA' }], em);
        await repo.salvarFotosDoMercado(a.id, [{ codigoBarras: '7890000000009', url: 'https://l.exemplo.com/9.jpg' }], em);
        expect(await repo.acharFoto('7890000000009')).toMatchObject({ origem: 'mercado', imagem: 'data:image/jpeg;base64,MINHA' });
      });

      it('apagarMercado leva junto as fotos próprias dele', async () => {
        const repo = await criar();
        const a = await repo.criarMercado(novoMercado('A', 'Rua 1'));
        await repo.salvarFoto({ codigoBarras: '7890000000003', origem: 'openfoodfacts', url: null, imagem: 'data:image/jpeg;base64,OFF', mercadoId: null, atualizadaEm: new Date() });
        await repo.salvarFotosDoMercado(a.id, [{ codigoBarras: '7890000000003', imagem: 'data:image/jpeg;base64,A3' }], new Date());
        expect(await repo.apagarMercado(a.id)).toBe(true);
        expect(await repo.acharFotoDoMercado(a.id, '7890000000003')).toBeNull();
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

      if (leituraEsperaTransacao) {
        // Comportamento da implementação em memória (fila única), não exigência do contrato.
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
      } else {
        // Banco de dados: a leitura de fora não espera, mas nunca vê o que a transação ainda não confirmou.
        it('leitura feita fora da transação não vê dados ainda não confirmados', async () => {
          const repo = await criar();
          let visto = -1;
          await repo.transacao(async (r) => {
            await r.criarMercado(novoMercado());
            visto = (await repo.listarMercados()).length;
          });
          expect(visto).toBe(0);
          expect(await repo.listarMercados()).toHaveLength(1);
        });
      }

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

      // Exigência de projeto (vale para qualquer implementação): no PostgreSQL, as leituras que
      // antecedem uma escrita dentro da transação precisam de trava (`SELECT ... FOR UPDATE`) ou
      // lock equivalente; sem isso as duas transações leriam 0 e o resultado seria 1.
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

      it('uma transacao que falha deixa intactas as buscas registradas antes (R32)', async () => {
        const repo = await criar();
        const u = await repo.criarUsuario(novoUsuario());
        await repo.registrarBusca({ usuarioId: u.id, termo: 'arroz', resultados: 1, mercadosDistintos: 1 });
        await repo.registrarBusca({ usuarioId: null, termo: 'feijão', resultados: 0, mercadosDistintos: 0 });
        await expect(
          repo.transacao(async (r) => {
            await r.registrarBusca({ usuarioId: null, termo: 'dentro', resultados: 0, mercadosDistintos: 0 });
            await r.excluirUsuario(u.id);
            throw new Error('falhou');
          }),
        ).rejects.toThrow('falhou');
        expect(await repo.acharUsuario(u.id)).not.toBeNull();
        expect(await repo.listarBuscas()).toEqual([
          { usuarioId: u.id, termo: 'arroz', resultados: 1, mercadosDistintos: 1 },
          { usuarioId: null, termo: 'feijão', resultados: 0, mercadosDistintos: 0 },
        ]);
      });

      it('busca registrada numa transacao que dá certo fica', async () => {
        const repo = await criar();
        await repo.transacao(async (r) => {
          await r.registrarBusca({ usuarioId: null, termo: 'leite', resultados: 2, mercadosDistintos: 1 });
        });
        expect(await repo.listarBuscas()).toHaveLength(1);
      });
    });

    describe('configurações (chave/valor)', () => {
      it('guarda e acha; chave que não existe é null; salvar de novo troca o valor', async () => {
        const repo = await criar();
        expect(await repo.acharConfiguracao('ilustrativa:leite')).toBeNull();
        await repo.salvarConfiguracao('ilustrativa:leite', 'data:image/jpeg;base64,AAAA');
        expect(await repo.acharConfiguracao('ilustrativa:leite')).toBe('data:image/jpeg;base64,AAAA');
        await repo.salvarConfiguracao('ilustrativa:leite', 'novo');
        expect(await repo.acharConfiguracao('ilustrativa:leite')).toBe('novo');
      });

      it('lista só as de um prefixo, em ordem de chave (e o "%" do prefixo não vira curinga)', async () => {
        const repo = await criar();
        await repo.salvarConfiguracao('ilustrativa:arroz', 'A');
        await repo.salvarConfiguracao('ilustrativa:leite', 'L');
        await repo.salvarConfiguracao('outra:coisa', 'X');
        expect(await repo.listarConfiguracoes('ilustrativa:')).toEqual([
          { chave: 'ilustrativa:arroz', valor: 'A' },
          { chave: 'ilustrativa:leite', valor: 'L' },
        ]);
        expect(await repo.listarConfiguracoes('%')).toEqual([]);
        expect(await repo.listarConfiguracoes('nada:')).toEqual([]);
      });
    });

    describe('fotos dos produtos', () => {
      it('grava e acha a foto pelo código de barras; sem foto, null', async () => {
        const repo = await criar();
        expect(await repo.acharFoto('7891000100103')).toBeNull();
        await repo.salvarFoto(novaFoto());
        expect(await repo.acharFoto('7891000100103')).toEqual(novaFoto());
      });

      it('guarda a imagem enviada por um mercado, com o mercado que enviou', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        const imagem = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
        await repo.salvarFoto(novaFoto('7891000100103', { origem: 'mercado', url: null, imagem, mercadoId: m.id }));
        expect(await repo.acharFoto('7891000100103')).toMatchObject({ origem: 'mercado', url: null, imagem, mercadoId: m.id });
      });

      it('uma foto só por código: salvar de novo substitui a anterior', async () => {
        const repo = await criar();
        await repo.salvarFoto(novaFoto());
        await repo.salvarFoto(novaFoto('7891000100103', { url: 'https://exemplo.com/nova.jpg' }));
        expect((await repo.acharFoto('7891000100103'))?.url).toBe('https://exemplo.com/nova.jpg');
        expect(await repo.listarCodigosComFoto()).toEqual(['7891000100103']);
      });

      it('removerFoto apaga e diz se havia', async () => {
        const repo = await criar();
        await repo.salvarFoto(novaFoto());
        expect(await repo.removerFoto('7891000100103')).toBe(true);
        expect(await repo.acharFoto('7891000100103')).toBeNull();
        expect(await repo.removerFoto('7891000100103')).toBe(false);
      });

      it('listarCodigosComFoto só traz os que têm foto de verdade (não os "procurou e não achou")', async () => {
        const repo = await criar();
        await repo.salvarFoto(novaFoto('7890000000002'));
        await repo.salvarFoto(novaFoto('7890000000001', { url: null }));
        await repo.salvarFoto(novaFoto('7890000000003', { origem: 'mercado', url: null, imagem: 'data:image/jpeg;base64,AAAA' }));
        expect(await repo.listarCodigosComFoto()).toEqual(['7890000000002', '7890000000003']);
      });

      it('listarResumoDeFotos: só dos códigos pedidos que têm foto de verdade, com a origem e sem a imagem', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        await repo.salvarFoto(novaFoto('7890000000001')); // automática
        await repo.salvarFoto(novaFoto('7890000000002', { origem: 'mercado', url: null, imagem: 'data:image/jpeg;base64,AAAA', mercadoId: m.id }));
        await repo.salvarFoto(novaFoto('7890000000003', { url: null })); // procurou e não achou
        await repo.salvarFoto(novaFoto('7890000000004')); // não foi pedido
        const resumo = await repo.listarResumoDeFotos(['7890000000003', '7890000000002', '7890000000001', '7890000000009']);
        expect(resumo).toEqual([
          { codigoBarras: '7890000000001', origem: 'openfoodfacts' },
          { codigoBarras: '7890000000002', origem: 'mercado' },
        ]);
        expect(await repo.listarResumoDeFotos([])).toEqual([]);
      });

      it('foto ilustrativa conta como pronta, aparece na lista das ilustrativas e é procurada de novo depois do prazo', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        await repo.salvarOferta(novaOferta(m.id, '7890000000001'));
        await repo.salvarOferta(novaOferta(m.id, '7890000000002'));
        await repo.salvarFoto(novaFoto('7890000000001', { origem: 'ilustrativa', url: null, imagem: 'data:image/jpeg;base64,AAAA', atualizadaEm: new Date('2026-11-01T00:00:00Z') }));
        await repo.salvarFoto(novaFoto('7890000000002')); // foto específica
        expect(await repo.listarCodigosComFoto()).toEqual(['7890000000001', '7890000000002']);
        expect(await repo.listarCodigosComFotoIlustrativa()).toEqual(['7890000000001']);
        expect(await repo.listarResumoDeFotos(['7890000000001'])).toEqual([{ codigoBarras: '7890000000001', origem: 'ilustrativa' }]);
        // antes do prazo não procura de novo; depois do prazo, sim (a foto específica pode ter aparecido) — e só a ilustrativa volta
        expect(await repo.listarCodigosSemFoto(10, new Date('2026-10-20T00:00:00Z'))).toEqual([]);
        expect(await repo.listarCodigosSemFoto(10, new Date('2026-11-05T00:00:00Z'))).toEqual(['7890000000001']);
      });

      it('foto "na fila" (link da planilha sem imagem ainda) não conta como pronta; depois de baixada, conta', async () => {
        const repo = await criar();
        await repo.salvarFoto(novaFoto('7890000000001', { origem: 'planilha', url: 'https://loja.exemplo.com/a.jpg' }));
        expect(await repo.listarCodigosComFoto()).toEqual([]);
        expect(await repo.listarResumoDeFotos(['7890000000001'])).toEqual([]);
        await repo.salvarFoto(novaFoto('7890000000001', { origem: 'planilha', url: 'https://loja.exemplo.com/a.jpg', imagem: 'data:image/jpeg;base64,AAAA' }));
        expect(await repo.listarCodigosComFoto()).toEqual(['7890000000001']);
        expect(await repo.listarResumoDeFotos(['7890000000001'])).toEqual([{ codigoBarras: '7890000000001', origem: 'planilha' }]);
      });

      it('acharNomeDoProduto: o nome mais comprido entre os mercados; null se ninguém vende', async () => {
        const repo = await criar();
        const a = await repo.criarMercado(novoMercado('Mercado A', 'Rua 1'));
        const b = await repo.criarMercado(novoMercado('Mercado B', 'Rua 2'));
        await repo.salvarOferta({ ...novaOferta(a.id, '7890000000001'), nome: 'Leite 1L' });
        await repo.salvarOferta({ ...novaOferta(b.id, '7890000000001'), nome: 'Leite Integral Piracanjuba 1L' });
        expect(await repo.acharNomeDoProduto('7890000000001')).toBe('Leite Integral Piracanjuba 1L');
        expect(await repo.acharNomeDoProduto('7899999999999')).toBeNull();
      });

      it('listarFotosParaBaixar: só as que têm o link e ainda não a imagem, em ordem, até o limite', async () => {
        const repo = await criar();
        await repo.salvarFoto(novaFoto('7890000000003', { origem: 'planilha', url: 'https://loja.exemplo.com/c.jpg' })); // falta baixar
        await repo.salvarFoto(novaFoto('7890000000001', { origem: 'planilha', url: 'https://loja.exemplo.com/a.jpg' })); // falta baixar
        await repo.salvarFoto(novaFoto('7890000000002', { origem: 'planilha', url: 'https://loja.exemplo.com/b.jpg', imagem: 'data:image/jpeg;base64,AAAA' })); // já baixada
        await repo.salvarFoto(novaFoto('7890000000004', { url: null })); // "não achou"
        expect(await repo.listarFotosParaBaixar(10)).toEqual([
          { codigoBarras: '7890000000001', url: 'https://loja.exemplo.com/a.jpg' },
          { codigoBarras: '7890000000003', url: 'https://loja.exemplo.com/c.jpg' },
        ]);
        expect(await repo.listarFotosParaBaixar(1)).toHaveLength(1);
        expect(await repo.listarFotosParaBaixar(0)).toEqual([]);
      });

      it('aceita a origem "planilha"', async () => {
        const repo = await criar();
        await repo.salvarFoto(novaFoto('7890000000001', { origem: 'planilha', url: 'https://loja.exemplo.com/a.jpg' }));
        expect((await repo.acharFoto('7890000000001'))?.origem).toBe('planilha');
      });

      it('listarCodigosSemFoto: o que nunca foi procurado e o "não achou" antigo, só de produtos que têm oferta', async () => {
        const repo = await criar();
        const m = await repo.criarMercado(novoMercado());
        for (const c of ['7890000000001', '7890000000002', '7890000000003', '7890000000004']) await repo.salvarOferta(novaOferta(m.id, c));
        await repo.salvarFoto(novaFoto('7890000000001')); // tem foto
        await repo.salvarFoto(novaFoto('7890000000002', { url: null, atualizadaEm: new Date('2026-11-06T00:00:00Z') })); // não achou ontem
        // 7890000000003 e 7890000000004: nunca procurados. Uma foto de produto que ninguém vende não conta:
        await repo.salvarFoto(novaFoto('7899999999999', { url: null }));

        const corte = new Date('2026-11-05T00:00:00Z'); // "não achou" depois do corte ainda não vale tentar de novo
        expect(await repo.listarCodigosSemFoto(10, corte)).toEqual(['7890000000003', '7890000000004']);
        const corteNovo = new Date('2026-11-07T00:00:00Z'); // agora o "não achou" de ontem é antigo
        expect(await repo.listarCodigosSemFoto(10, corteNovo)).toEqual(['7890000000002', '7890000000003', '7890000000004']);
        expect(await repo.listarCodigosSemFoto(2, corteNovo)).toEqual(['7890000000002', '7890000000003']);
        expect(await repo.listarCodigosSemFoto(0, corteNovo)).toEqual([]);
      });

      it('o mesmo código vendido em vários mercados aparece uma vez', async () => {
        const repo = await criar();
        const a = await repo.criarMercado(novoMercado('Mercado A', 'Rua 1'));
        const b = await repo.criarMercado(novoMercado('Mercado B', 'Rua 2'));
        await repo.salvarOferta(novaOferta(a.id, '7890000000001'));
        await repo.salvarOferta(novaOferta(b.id, '7890000000001'));
        expect(await repo.listarCodigosSemFoto(10, AGORA)).toEqual(['7890000000001']);
      });

      it('devolve cópias: alterar o que veio não altera o guardado', async () => {
        const repo = await criar();
        await repo.salvarFoto(novaFoto());
        const f = (await repo.acharFoto('7891000100103'))!;
        f.url = 'https://alterado';
        expect((await repo.acharFoto('7891000100103'))?.url).not.toBe('https://alterado');
      });

      it('uma transação que falha desfaz a foto gravada nela', async () => {
        const repo = await criar();
        await expect(
          repo.transacao(async (r) => {
            await r.salvarFoto(novaFoto());
            throw new Error('falhou');
          }),
        ).rejects.toThrow('falhou');
        expect(await repo.acharFoto('7891000100103')).toBeNull();
      });
    });
  });
}
