// Rotas das promoções pagas:
//  - do COMÉRCIO (painel): ver os pedidos e o que pagar (valor + chave Pix), avisar "Já paguei" e cancelar;
//  - da ADMINISTRAÇÃO (a dona): ver tudo (quem pagou, quem deve, quantas promoções, valores), marcar como pago (isso aplica a planilha
//    retida), cancelar e mudar o valor por promoção e a chave Pix.
// A regra completa está em promocoes/pedidos.ts e em docs/superpowers/specs/2026-11-10-produtos-descontos-design.md.
import type { FastifyPluginAsync } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import { mercadoEscolhidoDoUsuario } from '../painel/mercadoEscolhido';
import {
  CHAVE_PIX,
  CHAVE_VALOR_PROMOCAO,
  aplicarPlanilha,
  chavePix,
  lerChavePix,
  valorPorPromocaoCentavos,
  type PlanilhaRetida,
} from '../promocoes/pedidos';
import type { PedidoPromocao, Repositorio } from '../repositorio';

const MSG_NAO_ACHOU = 'Pedido não encontrado';
const MSG_JA_FECHADO = 'Este pedido já foi pago ou cancelado';
/** Teto do valor por promoção (R$ 10.000,00): só para um erro de digitação não virar um valor absurdo. */
const MAX_VALOR_CENTAVOS = 1_000_000;

const idDe = (bruto: string): number | null => (/^\d{1,9}$/.test(bruto) ? Number(bruto) : null);

type PedidoLeve = Omit<PedidoPromocao, 'planilha'>;

/** O pedido como a tela mostra (datas em texto). */
const paraTela = (p: PedidoLeve, mercadoNome?: string) => ({
  id: p.id,
  mercadoId: p.mercadoId,
  ...(mercadoNome !== undefined ? { mercadoNome } : {}),
  criadoEm: p.criadoEm.toISOString(),
  situacao: p.situacao,
  quantidade: p.quantidade,
  valorUnitarioCentavos: p.valorUnitarioCentavos,
  totalCentavos: p.totalCentavos,
  avisouPagamentoEm: p.avisouPagamentoEm?.toISOString() ?? null,
  pagoEm: p.pagoEm?.toISOString() ?? null,
});

const semPlanilha = ({ planilha: _planilha, ...resto }: PedidoPromocao): PedidoLeve => resto;

export function rotasPromocoes({ repo, aoMudarProdutos }: { repo: Repositorio; aoMudarProdutos?: () => void }): FastifyPluginAsync {
  return async (app) => {
    // -------------------------------------------------------------------------------------------------------------
    // Comércio

    /** O comércio do usuário (o escolhido com ?mercadoId= ou o primeiro dele), ou responde o erro. */
    async function comercioDoUsuario(req: { usuario: { id: number }; query: unknown }) {
      return mercadoEscolhidoDoUsuario(repo, req.usuario.id, (req.query as { mercadoId?: unknown }).mercadoId);
    }

    app.get('/painel/promocoes', { preHandler: exigirPapel('mercado') }, async (req, reply) => {
      const escolha = await comercioDoUsuario(req);
      if (!escolha.ok) return reply.code(escolha.status).send({ erro: escolha.erro });
      const pedidos = await repo.listarPedidosPromocao({ mercadoId: escolha.mercado.id });
      return {
        config: { valorCentavos: await valorPorPromocaoCentavos(repo), pixChave: await chavePix(repo) },
        pedidos: pedidos.map((p) => paraTela(p)),
      };
    });

    /** Acha o pedido PENDENTE do comércio do usuário, ou responde o erro. */
    async function pedidoPendenteDoComercio(req: { usuario: { id: number }; query: unknown; params: unknown }, reply: { code(n: number): { send(b: unknown): unknown } }) {
      const escolha = await comercioDoUsuario(req);
      if (!escolha.ok) {
        reply.code(escolha.status).send({ erro: escolha.erro });
        return null;
      }
      const id = idDe((req.params as { id: string }).id);
      const pedido = id === null ? null : await repo.acharPedidoPromocao(id);
      if (!pedido || pedido.mercadoId !== escolha.mercado.id) {
        reply.code(404).send({ erro: MSG_NAO_ACHOU });
        return null;
      }
      if (pedido.situacao !== 'aguardando') {
        reply.code(409).send({ erro: MSG_JA_FECHADO });
        return null;
      }
      return pedido;
    }

    // "Já paguei": só avisa a dona (quem libera é ela, depois de conferir o Pix).
    app.post<{ Params: { id: string } }>('/painel/promocoes/:id/avisar', { preHandler: exigirPapel('mercado') }, async (req, reply) => {
      const pedido = await pedidoPendenteDoComercio(req, reply);
      if (!pedido) return reply;
      await repo.atualizarPedidoPromocao(pedido.id, { avisouPagamentoEm: new Date() });
      return paraTela(semPlanilha({ ...pedido, avisouPagamentoEm: new Date() }));
    });

    app.post<{ Params: { id: string } }>('/painel/promocoes/:id/cancelar', { preHandler: exigirPapel('mercado') }, async (req, reply) => {
      const pedido = await pedidoPendenteDoComercio(req, reply);
      if (!pedido) return reply;
      await repo.atualizarPedidoPromocao(pedido.id, { situacao: 'cancelado', planilha: '' });
      return paraTela(semPlanilha({ ...pedido, situacao: 'cancelado', planilha: '' }));
    });

    // -------------------------------------------------------------------------------------------------------------
    // Administração (a dona)

    const admin = { preHandler: exigirPapel('admin') };

    app.get('/admin/promocoes', admin, async () => {
      const [pedidos, mercados] = await Promise.all([repo.listarPedidosPromocao(), repo.listarMercados()]);
      const nomes = new Map(mercados.map((m) => [m.id, m.nome]));

      const resumo = { pagas: 0, aguardando: 0, canceladas: 0, promocoesPagas: 0, promocoesAguardando: 0, recebidoCentavos: 0, aReceberCentavos: 0 };
      const porComercio = new Map<number, { mercadoId: number; nome: string; pagas: number; aguardando: number; recebidoCentavos: number; devidoCentavos: number }>();
      for (const p of pedidos) {
        const c = porComercio.get(p.mercadoId) ?? { mercadoId: p.mercadoId, nome: nomes.get(p.mercadoId) ?? `Comércio ${p.mercadoId}`, pagas: 0, aguardando: 0, recebidoCentavos: 0, devidoCentavos: 0 };
        porComercio.set(p.mercadoId, c);
        if (p.situacao === 'pago') {
          resumo.pagas += 1;
          resumo.promocoesPagas += p.quantidade;
          resumo.recebidoCentavos += p.totalCentavos;
          c.pagas += 1;
          c.recebidoCentavos += p.totalCentavos;
        } else if (p.situacao === 'aguardando') {
          resumo.aguardando += 1;
          resumo.promocoesAguardando += p.quantidade;
          resumo.aReceberCentavos += p.totalCentavos;
          c.aguardando += 1;
          c.devidoCentavos += p.totalCentavos;
        } else resumo.canceladas += 1;
      }
      return {
        config: { valorCentavos: await valorPorPromocaoCentavos(repo), pixChave: await chavePix(repo) },
        resumo,
        porComercio: [...porComercio.values()].sort((a, b) => b.devidoCentavos - a.devidoCentavos || a.nome.localeCompare(b.nome, 'pt-BR')),
        pedidos: pedidos.map((p) => paraTela(p, nomes.get(p.mercadoId) ?? `Comércio ${p.mercadoId}`)),
      };
    });

    // Marcar como PAGO aplica a planilha retida (produtos, fotos e promoções) no comércio. Tudo na mesma transação:
    // ou entra tudo e o pedido fica pago, ou nada muda (e pagar duas vezes não duplica nada).
    app.post<{ Params: { id: string } }>('/admin/promocoes/:id/pagar', admin, async (req, reply) => {
      const id = idDe(req.params.id);
      if (id === null) return reply.code(404).send({ erro: MSG_NAO_ACHOU });
      const resultado = await repo.transacao(async (r) => {
        const pedido = await r.acharPedidoPromocao(id);
        if (!pedido) return { status: 404 as const, erro: MSG_NAO_ACHOU };
        if (pedido.situacao !== 'aguardando') return { status: 409 as const, erro: MSG_JA_FECHADO };
        const mercado = await r.acharMercado(pedido.mercadoId);
        if (!mercado || mercado.status !== 'ativo') return { status: 409 as const, erro: 'O comércio está sem acesso: dê o acesso de volta antes de liberar' };
        const agora = new Date();
        const aplicada = await aplicarPlanilha(r, pedido.mercadoId, JSON.parse(pedido.planilha) as PlanilhaRetida, agora);
        await r.atualizarPedidoPromocao(id, { situacao: 'pago', pagoEm: agora, planilha: '' });
        return { status: 200 as const, pedido: semPlanilha({ ...pedido, situacao: 'pago', pagoEm: agora, planilha: '' }), aplicada };
      });
      if (resultado.status !== 200) return reply.code(resultado.status).send({ erro: resultado.erro });
      aoMudarProdutos?.(); // produtos novos: procura a foto deles
      return { pedido: paraTela(resultado.pedido), ...resultado.aplicada };
    });

    app.post<{ Params: { id: string } }>('/admin/promocoes/:id/cancelar', admin, async (req, reply) => {
      const id = idDe(req.params.id);
      const pedido = id === null ? null : await repo.acharPedidoPromocao(id);
      if (!pedido) return reply.code(404).send({ erro: MSG_NAO_ACHOU });
      if (pedido.situacao !== 'aguardando') return reply.code(409).send({ erro: MSG_JA_FECHADO });
      await repo.atualizarPedidoPromocao(pedido.id, { situacao: 'cancelado', planilha: '' });
      return paraTela(semPlanilha({ ...pedido, situacao: 'cancelado', planilha: '' }));
    });

    // O valor por promoção (em centavos) e a chave Pix. O valor novo vale só para os pedidos que ainda vão ser criados.
    app.put('/admin/promocoes/config', admin, async (req, reply) => {
      const corpo = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as { valorCentavos?: unknown; pixChave?: unknown };
      if (corpo.valorCentavos !== undefined) {
        const v = corpo.valorCentavos;
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_VALOR_CENTAVOS) {
          return reply.code(400).send({ erro: 'Informe o valor por promoção em centavos (um número inteiro, de 0 a 1.000.000)' });
        }
        await repo.salvarConfiguracao(CHAVE_VALOR_PROMOCAO, String(v));
      }
      if (corpo.pixChave !== undefined) {
        const chave = lerChavePix(corpo.pixChave);
        if (chave === undefined) return reply.code(400).send({ erro: 'Chave Pix inválida (no máximo 140 caracteres)' });
        await repo.salvarConfiguracao(CHAVE_PIX, chave ?? '');
      }
      return { valorCentavos: await valorPorPromocaoCentavos(repo), pixChave: await chavePix(repo) };
    });
  };
}
