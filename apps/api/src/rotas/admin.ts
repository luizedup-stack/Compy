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

/** Quanto tempo um mercado pode ficar sem acesso quando o prazo é escolhido (um limite razoável, para evitar datas absurdas). */
const MAXIMO_POR_UNIDADE = { dias: 3650, meses: 120, anos: 10 } as const;
const prazoSchema = z.union([
  z.object({ tipo: z.literal('permanente') }),
  z.object({
    tipo: z.literal('temporario'),
    quantidade: z.number({ error: 'Informe quantos dias, meses ou anos' }).int('Informe um número inteiro').min(1, 'O prazo precisa ser de pelo menos 1'),
    unidade: z.enum(['dias', 'meses', 'anos'], { error: 'Escolha dias, meses ou anos' }),
  }),
]);

/** A data em que o acesso volta, somando o prazo a `agora` (meses e anos pelo calendário). */
export function dataDeVolta(agora: Date, quantidade: number, unidade: 'dias' | 'meses' | 'anos'): Date {
  const d = new Date(agora);
  if (unidade === 'dias') d.setUTCDate(d.getUTCDate() + quantidade);
  else if (unidade === 'meses') d.setUTCMonth(d.getUTCMonth() + quantidade);
  else d.setUTCFullYear(d.getUTCFullYear() + quantidade);
  return d;
}

const idDe = (bruto: string): number | null => (/^\d+$/.test(bruto) ? Number(bruto) : null);

type ResultadoAcesso = { ok: true } | { ok: false; status: 404 | 409; erro: string };

export function rotasAdmin({ repo }: { repo: Repositorio }): FastifyPluginAsync {
  return async (app) => {
    app.get('/admin/mercados', { preHandler: exigirPapel('admin') }, async () => {
      await repo.reativarMercadosVencidos(new Date()); // quem estava com prazo vencido já aparece com acesso
      const mercados = (await repo.listarMercados()).sort((a, b) => a.id - b.id);
      return Promise.all(
        mercados.map(async (m) => ({
          id: m.id,
          nome: m.nome,
          endereco: m.endereco,
          status: m.status,
          totalProdutos: (await repo.listarOfertasDoMercado(m.id)).length,
          temLogin: m.usuarioId !== null,
          // Só para quem está sem acesso: até quando (null = sem acesso até alguém dar o acesso de novo).
          removidoAte: m.status === 'removido' ? (m.removidoAte?.toISOString() ?? null) : null,
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
        // A senha temporária só existe nesta resposta: nenhum cache (navegador, proxy) pode guardá-la.
        return reply.code(201).header('cache-control', 'no-store').send({ senhaTemporaria });
      },
    );

    // "Tirar acesso": o mercado deixa de aparecer no aplicativo e de aceitar planilhas. Sem corpo (ou tipo "permanente"), fica assim até
    // alguém dar o acesso de novo; com { tipo: 'temporario', quantidade, unidade }, volta sozinho na data calculada.
    app.post<{ Params: { id: string } }>(
      '/admin/mercados/:id/remover',
      { preHandler: exigirPapel('admin') },
      async (req, reply) => {
        const mercadoId = idDe(req.params.id);
        const mercado = mercadoId === null ? null : await repo.acharMercado(mercadoId);
        if (!mercado) return reply.code(404).send({ erro: 'Mercado não encontrado' });
        const prazo = req.body === undefined || req.body === null ? ({ tipo: 'permanente' } as const) : prazoSchema.safeParse(req.body);
        if ('success' in prazo && !prazo.success) return reply.code(400).send({ erro: prazo.error.issues[0]?.message ?? 'Prazo inválido' });
        const escolhido = 'success' in prazo ? prazo.data : prazo;
        let removidoAte: Date | null = null;
        if (escolhido.tipo === 'temporario') {
          if (escolhido.quantidade > MAXIMO_POR_UNIDADE[escolhido.unidade]) {
            return reply.code(400).send({ erro: `O prazo máximo é ${MAXIMO_POR_UNIDADE[escolhido.unidade]} ${escolhido.unidade}` });
          }
          removidoAte = dataDeVolta(new Date(), escolhido.quantidade, escolhido.unidade);
        }
        await repo.atualizarMercado(mercado.id, { status: 'removido', removidoAte });
        return reply.code(204).send();
      },
    );

    // "Dar acesso novamente": o mercado volta a aparecer e a aceitar planilhas.
    app.post<{ Params: { id: string } }>(
      '/admin/mercados/:id/reativar',
      { preHandler: exigirPapel('admin') },
      async (req, reply) => {
        const mercadoId = idDe(req.params.id);
        const mercado = mercadoId === null ? null : await repo.acharMercado(mercadoId);
        if (!mercado) return reply.code(404).send({ erro: 'Mercado não encontrado' });
        await repo.atualizarMercado(mercado.id, { status: 'ativo', removidoAte: null });
        return reply.code(204).send();
      },
    );

    // "Apagar": tira o mercado e todos os produtos dele do sistema, sem volta.
    app.delete<{ Params: { id: string } }>('/admin/mercados/:id', { preHandler: exigirPapel('admin') }, async (req, reply) => {
      const mercadoId = idDe(req.params.id);
      if (mercadoId === null || !(await repo.apagarMercado(mercadoId))) return reply.code(404).send({ erro: 'Mercado não encontrado' });
      return reply.code(204).send();
    });
  };
}
