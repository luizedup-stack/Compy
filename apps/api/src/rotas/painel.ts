import { normalizarTexto, parsePreco, parseQuantidade, type ProdutoPainel } from '@mercado/shared';
import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import { ErroMercadoDuplicado, type Mercado, type OfertaArmazenada, type Repositorio } from '../repositorio';
import { precoDesatualizado } from '../tempo';

const POR_PAGINA = 50;
const MSG_SEM_MERCADO = 'Sua conta não está ligada a um mercado ativo';
const MSG_NADA = 'Nada para alterar';
const MSG_NAO_ACHOU = 'Produto não encontrado';

const MENSAGEM_COBRANCA: Record<Mercado['contaSituacao'], string> = {
  gratuita: 'Gratuito por enquanto',
  ativa: 'Conta ativa',
  em_atraso: 'Pagamento em atraso',
};

declare module 'fastify' {
  interface FastifyRequest {
    /** O mercado do usuário logado (preenchido pelo preHandler de `/painel/*`; nunca vem do cliente). */
    mercadoDoPainel: Mercado;
  }
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const aProdutoPainel = (o: OfertaArmazenada, agora: Date): ProdutoPainel => ({
  codigoBarras: o.codigoBarras,
  nome: o.nome,
  preco: o.preco,
  quantidadeTexto: o.quantidadeTexto,
  categoria: o.categoria,
  disponivel: o.disponivel,
  atualizadoEm: o.precoAtualizadoEm.toISOString(),
  desatualizado: precoDesatualizado(o.precoAtualizadoEm, agora),
});

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Texto aparado e não vazio, ou `undefined`. */
const textoNaoVazio = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
};

type Edicao = { ok: true; parcial: Partial<OfertaArmazenada> } | { ok: false; erro: string };

/** Valida o corpo do PATCH de produto e monta só os campos que mudam. */
function lerEdicaoProduto(corpo: unknown, agora: Date): Edicao {
  if (corpo === undefined || corpo === null) return { ok: false, erro: MSG_NADA };
  if (!ehObjeto(corpo)) return { ok: false, erro: 'Corpo inválido' };
  const chaves = Object.keys(corpo);
  if (chaves.length === 0) return { ok: false, erro: MSG_NADA };

  const parcial: Partial<OfertaArmazenada> = {};
  for (const chave of chaves) {
    const valor = corpo[chave];
    switch (chave) {
      case 'codigoBarras':
        return { ok: false, erro: 'O código de barras não pode ser alterado' };
      case 'nome': {
        const nome = textoNaoVazio(valor);
        if (nome === undefined) return { ok: false, erro: 'Nome inválido' };
        parcial.nome = nome;
        parcial.nomeNorm = normalizarTexto(nome);
        break;
      }
      case 'preco': {
        const preco = typeof valor === 'number' || typeof valor === 'string' ? parsePreco(valor) : null;
        if (preco === null) return { ok: false, erro: 'Preço inválido' };
        parcial.preco = preco;
        parcial.precoAtualizadoEm = agora; // R20: só mexer no preço renova a data
        break;
      }
      case 'quantidade': {
        if (valor !== null && typeof valor !== 'string') return { ok: false, erro: 'Quantidade inválida' };
        const texto = valor === null ? '' : valor.trim();
        const q = texto === '' ? null : parseQuantidade(texto);
        parcial.quantidadeTexto = texto === '' ? null : texto;
        parcial.quantidadeValor = q?.valor ?? null;
        parcial.quantidadeUnidade = q?.unidade ?? null;
        break;
      }
      case 'categoria': {
        if (valor !== null && typeof valor !== 'string') return { ok: false, erro: 'Categoria inválida' };
        parcial.categoria = valor === null ? null : (textoNaoVazio(valor) ?? null);
        break;
      }
      case 'disponivel':
        if (typeof valor !== 'boolean') return { ok: false, erro: 'Disponível inválido' };
        parcial.disponivel = valor;
        break;
      default:
        return { ok: false, erro: `Campo não pode ser alterado: ${chave}` };
    }
  }
  return { ok: true, parcial };
}

export function rotasPainel({ repo }: { repo: Repositorio }): FastifyPluginAsync {
  return async (app) => {
    app.decorateRequest('mercadoDoPainel', null as never);

    const papelMercado = exigirPapel('mercado');
    /** R19: papel `mercado` + mercado próprio existente e ativo; deixa o mercado em `req.mercadoDoPainel`. */
    const exigirMercadoAtivo: preHandlerAsyncHookHandler = async (req, reply) => {
      await papelMercado.call(app, req, reply);
      if (reply.sent) return reply;
      const mercado = await repo.acharMercadoDoUsuario(req.usuario.id);
      if (!mercado || mercado.status !== 'ativo') return reply.code(403).send({ erro: MSG_SEM_MERCADO });
      req.mercadoDoPainel = mercado;
    };
    const opcoes = { preHandler: exigirMercadoAtivo };

    async function resumoDoMercado(m: Mercado) {
      const ofertas = await repo.listarOfertasDoMercado(m.id);
      const agora = new Date();
      return {
        id: m.id,
        nome: m.nome,
        endereco: m.endereco,
        totalProdutos: ofertas.length,
        produtosDesatualizados: ofertas.filter((o) => precoDesatualizado(o.precoAtualizadoEm, agora)).length,
      };
    }

    app.get('/painel/mercado', opcoes, async (req) => resumoDoMercado(req.mercadoDoPainel));

    app.patch('/painel/mercado', opcoes, async (req, reply) => {
      const corpo = req.body;
      if (corpo === undefined || corpo === null) return reply.code(400).send({ erro: MSG_NADA });
      if (!ehObjeto(corpo)) return reply.code(400).send({ erro: 'Corpo inválido' });
      const chaves = Object.keys(corpo);
      if (chaves.length === 0) return reply.code(400).send({ erro: MSG_NADA });

      const parcial: Partial<Pick<Mercado, 'nome' | 'endereco' | 'nomeNorm' | 'enderecoNorm'>> = {};
      for (const chave of chaves) {
        if (chave !== 'nome' && chave !== 'endereco') {
          return reply.code(400).send({ erro: `Campo não pode ser alterado: ${chave}` });
        }
        const texto = textoNaoVazio(corpo[chave]);
        if (texto === undefined) return reply.code(400).send({ erro: chave === 'nome' ? 'Nome inválido' : 'Endereço inválido' });
        if (chave === 'nome') {
          parcial.nome = texto;
          parcial.nomeNorm = normalizarTexto(texto);
        } else {
          parcial.endereco = texto;
          parcial.enderecoNorm = normalizarTexto(texto);
        }
      }

      const mercado = req.mercadoDoPainel;
      try {
        await repo.atualizarMercado(mercado.id, parcial);
      } catch (e) {
        if (e instanceof ErroMercadoDuplicado) {
          return reply.code(409).send({ erro: 'Já existe um mercado com esse nome e endereço' });
        }
        throw e;
      }
      return resumoDoMercado({ ...mercado, ...parcial });
    });

    app.get<{ Querystring: { pagina?: unknown } }>('/painel/produtos', opcoes, async (req, reply) => {
      const bruto = req.query.pagina;
      let pagina = 1;
      if (bruto !== undefined) {
        pagina = typeof bruto === 'string' && /^\d+$/.test(bruto) ? Number(bruto) : 0;
        if (!Number.isSafeInteger(pagina) || pagina < 1) return reply.code(400).send({ erro: 'Página inválida' });
      }
      const ofertas = (await repo.listarOfertasDoMercado(req.mercadoDoPainel.id)).sort(
        (a, b) => comparar(a.nomeNorm, b.nomeNorm) || comparar(a.codigoBarras, b.codigoBarras),
      );
      const agora = new Date();
      const inicio = (pagina - 1) * POR_PAGINA;
      return {
        itens: ofertas.slice(inicio, inicio + POR_PAGINA).map((o) => aProdutoPainel(o, agora)),
        total: ofertas.length,
      };
    });

    app.patch<{ Params: { codigo: string } }>('/painel/produtos/:codigo', opcoes, async (req, reply) => {
      const agora = new Date();
      const edicao = lerEdicaoProduto(req.body, agora);
      if (!edicao.ok) return reply.code(400).send({ erro: edicao.erro });

      const atual = await repo.acharOferta(req.mercadoDoPainel.id, req.params.codigo);
      if (!atual) return reply.code(404).send({ erro: MSG_NAO_ACHOU });
      // salvarOferta troca a oferta inteira; parte do que está gravado e do mercado do usuário.
      const nova: OfertaArmazenada = { ...atual, ...edicao.parcial, mercadoId: atual.mercadoId };
      await repo.salvarOferta(nova);
      return aProdutoPainel(nova, agora);
    });

    app.delete<{ Params: { codigo: string } }>('/painel/produtos/:codigo', opcoes, async (req, reply) => {
      const removida = await repo.removerOferta(req.mercadoDoPainel.id, req.params.codigo);
      if (!removida) return reply.code(404).send({ erro: MSG_NAO_ACHOU });
      return reply.code(204).send();
    });

    app.get('/painel/cobranca', opcoes, async (req) => {
      const situacao = req.mercadoDoPainel.contaSituacao;
      return { situacao, mensagem: MENSAGEM_COBRANCA[situacao] };
    });
  };
}
