import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exigirPapel } from '../auth/guardas';
import { hashSenha } from '../auth/senha';
import { ErroEmailJaExiste, type Repositorio } from '../repositorio';

const MSG_EMAIL = 'E-mail inválido';
const emailSchema = z
  .object({ email: z.string({ error: MSG_EMAIL }).trim().toLowerCase().pipe(z.email({ error: MSG_EMAIL })) }, { error: MSG_EMAIL });

/** 12 caracteres URL-safe (72 bits) gerados com o CSPRNG do sistema. */
const gerarSenhaTemporaria = () => randomBytes(9).toString('base64url');

const idDe = (bruto: string): number | null => (/^\d+$/.test(bruto) ? Number(bruto) : null);

type ResultadoAcesso = { ok: true } | { ok: false; status: 404 | 409; erro: string };

export function rotasAdmin({ repo }: { repo: Repositorio }): FastifyPluginAsync {
  return async (app) => {
    app.get('/admin/mercados', { preHandler: exigirPapel('admin') }, async () => {
      const mercados = (await repo.listarMercados()).sort((a, b) => a.id - b.id);
      return Promise.all(
        mercados.map(async (m) => ({
          id: m.id,
          nome: m.nome,
          endereco: m.endereco,
          status: m.status,
          totalProdutos: (await repo.listarOfertasDoMercado(m.id)).length,
          temLogin: m.usuarioId !== null,
        })),
      );
    });

    app.post<{ Params: { id: string } }>(
      '/admin/mercados/:id/acesso',
      { preHandler: exigirPapel('admin') },
      async (req, reply) => {
        const dados = emailSchema.safeParse(req.body);
        if (!dados.success) return reply.code(400).send({ erro: dados.error.issues[0]?.message ?? MSG_EMAIL });
        const { email } = dados.data;
        const mercadoId = idDe(req.params.id);
        const naoAchou = () => reply.code(404).send({ erro: 'Mercado não encontrado' });
        if (mercadoId === null) return naoAchou();

        const senhaTemporaria = gerarSenhaTemporaria();
        const senhaHash = await hashSenha(senhaTemporaria);
        let resultado: ResultadoAcesso;
        try {
          resultado = await repo.transacao(async (r): Promise<ResultadoAcesso> => {
            const mercado = await r.acharMercado(mercadoId);
            if (!mercado) return { ok: false, status: 404, erro: 'Mercado não encontrado' };
            if (mercado.status === 'removido') {
              return { ok: false, status: 409, erro: 'Este mercado foi removido e não pode ter acesso' };
            }
            if (mercado.usuarioId !== null) return { ok: false, status: 409, erro: 'Este mercado já tem acesso' };
            if (await r.acharUsuarioPorEmail(email)) {
              return { ok: false, status: 409, erro: 'Esse e-mail já está cadastrado' };
            }
            const usuario = await r.criarUsuario({ email, senhaHash, papel: 'mercado', emailVerificado: true });
            await r.atualizarMercado(mercado.id, { usuarioId: usuario.id });
            return { ok: true };
          });
        } catch (e) {
          if (e instanceof ErroEmailJaExiste) {
            return reply.code(409).send({ erro: 'Esse e-mail já está cadastrado' });
          }
          throw e;
        }
        if (!resultado.ok) return reply.code(resultado.status).send({ erro: resultado.erro });
        return reply.code(201).send({ senhaTemporaria });
      },
    );

    app.post<{ Params: { id: string } }>(
      '/admin/mercados/:id/remover',
      { preHandler: exigirPapel('admin') },
      async (req, reply) => {
        const mercadoId = idDe(req.params.id);
        const mercado = mercadoId === null ? null : await repo.acharMercado(mercadoId);
        if (!mercado) return reply.code(404).send({ erro: 'Mercado não encontrado' });
        if (mercado.status !== 'removido') await repo.atualizarMercado(mercado.id, { status: 'removido' });
        return reply.code(204).send();
      },
    );
  };
}
