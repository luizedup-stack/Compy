// Rotas das promoções pagas:
//  - do COMÉRCIO (painel): ver os pedidos e o que pagar (valor + chave Pix), avisar "Já paguei" e cancelar;
//  - da ADMINISTRAÇÃO (a dona): ver tudo (quem pagou, quem deve, quantas promoções, valores), marcar como pago (isso aplica a planilha
//    retida), cancelar e mudar o valor por promoção e a chave Pix.
// A regra completa está em promocoes/pedidos.ts e em docs/superpowers/specs/2026-11-10-produtos-descontos-design.md.
import type { FastifyPluginAsync } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import type { EmailSender } from '../email';
import { mercadoEscolhidoDoUsuario } from '../painel/mercadoEscolhido';
import {
  CHAVE_PIX,
  CHAVE_VALOR_PROMOCAO,
  aplicarPlanilha,
  chavePix,
  lerChavePix,
  lerLinhaDeDesconto,
  reais,
  valorPorPromocaoCentavos,
  type PlanilhaRetida,
} from '../promocoes/pedidos';
import type { PedidoPromocao, Repositorio } from '../repositorio';

const MSG_NAO_ACHOU = 'Pedido não encontrado';
const MSG_JA_FECHADO = 'Este pedido já foi pago ou cancelado';
const MSG_PRODUTO_NAO_ACHOU = 'Produto não encontrado';
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

export function rotasPromocoes({
  repo,
  aoMudarProdutos,
  email,
}: {
  repo: Repositorio;
  aoMudarProdutos?: () => void;
  /** Avisa por e-mail o dono do comércio quando a promoção dele é aprovada. Sem isso, só a tela mostra a situação. */
  email?: EmailSender;
}): FastifyPluginAsync {
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
        avisarPorEmail: escolha.mercado.avisarPromocaoEmail !== false,
        pedidos: pedidos.map((p) => paraTela(p)),
      };
    });

    // Liga/desliga o aviso por e-mail de quando uma promoção é aprovada (o comércio escolhe; o padrão é avisar).
    app.put('/painel/promocoes/aviso', { preHandler: exigirPapel('mercado') }, async (req, reply) => {
      const escolha = await comercioDoUsuario(req);
      if (!escolha.ok) return reply.code(escolha.status).send({ erro: escolha.erro });
      const corpo = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as { avisar?: unknown };
      if (typeof corpo.avisar !== 'boolean') return reply.code(400).send({ erro: 'Informe "avisar" como verdadeiro ou falso' });
      await repo.atualizarMercado(escolha.mercado.id, { avisarPromocaoEmail: corpo.avisar });
      return { avisarPorEmail: corpo.avisar };
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

    // Colocar (ou trocar) a promoção de UM produto já cadastrado, direto no painel — sem precisar de planilha.
    // Mesma regra de sempre: o preço promocional só vale de verdade depois que a administração aprova o pagamento
    // (ou na hora, se o valor por promoção estiver em R$ 0). Funciona tanto para um produto que acabou de ser
    // cadastrado (POST /painel/produtos) quanto para um já existente: o painel chama esta rota logo em seguida.
    app.post<{ Params: { codigo: string } }>('/painel/produtos/:codigo/promocao', { preHandler: exigirPapel('mercado') }, async (req, reply) => {
      const escolha = await comercioDoUsuario(req);
      if (!escolha.ok) return reply.code(escolha.status).send({ erro: escolha.erro });
      const mercadoId = escolha.mercado.id;

      const oferta = await repo.acharOferta(mercadoId, req.params.codigo);
      if (!oferta) return reply.code(404).send({ erro: MSG_PRODUTO_NAO_ACHOU });

      const corpo = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as {
        precoPromocional?: unknown;
        validoDe?: unknown;
        validoAte?: unknown;
      };
      const comoPrimitivo = (v: unknown): string | number | null => (typeof v === 'string' || typeof v === 'number' ? v : null);
      const lida = lerLinhaDeDesconto(
        1,
        { codigo: oferta.codigoBarras, preco: comoPrimitivo(corpo.precoPromocional), de: comoPrimitivo(corpo.validoDe), ate: comoPrimitivo(corpo.validoAte) },
        new Date(),
      );
      if (!lida.ok) return reply.code(400).send({ erro: lida.motivo });
      if (!(lida.desconto.precoPromocional < oferta.preco)) {
        return reply.code(400).send({ erro: `O preço promocional precisa ser menor que o preço normal (${oferta.preco})` });
      }

      const planilha: PlanilhaRetida = { ofertas: [], fotos: [], imagens: [], descontos: [lida.desconto] };
      const valorUnitario = await valorPorPromocaoCentavos(repo);
      if (valorUnitario === 0) {
        // Sem custo: aplica na hora, como se fosse a administração.
        const aplicada = await repo.transacao((r) => aplicarPlanilha(r, mercadoId, planilha, new Date()));
        return { retida: false, ...aplicada };
      }
      const pedido = await repo.criarPedidoPromocao({
        mercadoId,
        criadoEm: new Date(),
        situacao: 'aguardando',
        quantidade: 1,
        valorUnitarioCentavos: valorUnitario,
        totalCentavos: valorUnitario,
        avisouPagamentoEm: null,
        pagoEm: null,
        planilha: JSON.stringify(planilha),
      });
      return reply.code(202).send({
        retida: true,
        pedido: { id: pedido.id, quantidade: pedido.quantidade, valorUnitarioCentavos: pedido.valorUnitarioCentavos, totalCentavos: pedido.totalCentavos },
      });
    });

    // -------------------------------------------------------------------------------------------------------------
    // Administração (a dona)

    /**
     * Avisa por e-mail o dono do comércio que a promoção foi aprovada. Nunca derruba a rota: se o e-mail não sair
     * (sem `email`, mercado sem dono, provedor fora do ar), a aprovação já aconteceu de qualquer jeito.
     */
    async function avisarPorEmail(pedido: PedidoLeve): Promise<void> {
      if (!email) return;
      try {
        const mercado = await repo.acharMercado(pedido.mercadoId);
        if (!mercado?.usuarioId) return;
        if (mercado.avisarPromocaoEmail === false) return; // o comércio desligou o aviso em "Meu comércio"
        const usuario = await repo.acharUsuario(mercado.usuarioId);
        if (!usuario) return;
        await email.enviar(
          usuario.email,
          'Sua promoção foi aprovada',
          `Boas notícias! O pagamento da sua promoção em "${mercado.nome}" foi confirmado.\n\n` +
            `${pedido.quantidade} ${pedido.quantidade === 1 ? 'produto já está' : 'produtos já estão'} em destaque no app, com o preço promocional, até a data de cada um.\n\n` +
            `Valor pago: ${reais(pedido.totalCentavos)}.`,
        );
      } catch {
        // Falha de envio não desfaz a aprovação; a tela de Promoções já mostra "Pago" normalmente.
      }
    }

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
      await avisarPorEmail(resultado.pedido);
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
