import { caminhoDaFoto, normalizarTexto, parsePreco, parseQuantidade, validarCodigoBarras, type ProdutoPainel } from '@mercado/shared';
import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import { lerImagem } from '../fotos/imagem';
import { ErroMercadoDuplicado, type Mercado, type OfertaArmazenada, type OrigemFoto, type Repositorio } from '../repositorio';
import { lerEdicaoMercado } from '../painel/dadosDoMercado';
import { MSG_SEM_MERCADO, mercadoEscolhidoDoUsuario } from '../painel/mercadoEscolhido';
import { precoDesatualizado } from '../tempo';

const POR_PAGINA = 50;
const MSG_ESCOLHA_MERCADO = 'Escolha o mercado (mercadoId)';
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

/** De onde veio a foto de cada código (só os que têm foto). */
type OrigensDeFoto = Map<string, OrigemFoto>;

const aProdutoPainel = (o: OfertaArmazenada, agora: Date, fotos: OrigensDeFoto = new Map()): ProdutoPainel => ({
  codigoBarras: o.codigoBarras,
  nome: o.nome,
  preco: o.preco,
  quantidadeTexto: o.quantidadeTexto,
  categoria: o.categoria,
  disponivel: o.disponivel,
  atualizadoEm: o.precoAtualizadoEm.toISOString(),
  desatualizado: precoDesatualizado(o.precoAtualizadoEm, agora),
  foto: fotos.has(o.codigoBarras) ? caminhoDaFoto(o.codigoBarras) : null,
  fotoOrigem: fotos.has(o.codigoBarras) ? (fotos.get(o.codigoBarras) === 'mercado' ? 'mercado' : fotos.get(o.codigoBarras) === 'ilustrativa' ? 'ilustrativa' : 'automatica') : null,
});

/** A origem da foto de cada código dado (só dos que têm foto). */
const fotosDe = async (r: Repositorio, codigos: string[]): Promise<OrigensDeFoto> =>
  new Map((await r.listarResumoDeFotos(codigos)).map((f) => [f.codigoBarras, f.origem]));

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Texto aparado e não vazio, ou `undefined`. */
const textoNaoVazio = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
};

type Edicao = { ok: true; parcial: Partial<OfertaArmazenada>; renovaPreco: boolean } | { ok: false; erro: string };

/** Valida o corpo do PATCH de produto e monta só os campos que mudam. */
function lerEdicaoProduto(corpo: unknown): Edicao {
  if (corpo === undefined || corpo === null) return { ok: false, erro: MSG_NADA };
  if (!ehObjeto(corpo)) return { ok: false, erro: 'Corpo inválido' };
  const chaves = Object.keys(corpo);
  if (chaves.length === 0) return { ok: false, erro: MSG_NADA };

  const parcial: Partial<OfertaArmazenada> = {};
  let renovaPreco = false;
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
        renovaPreco = true; // R20: só enviar o preço renova a data (mesmo igual ao atual: confirma o preço)
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
  return { ok: true, parcial, renovaPreco };
}

type Novo = { ok: true; oferta: Omit<OfertaArmazenada, 'mercadoId' | 'precoAtualizadoEm'> } | { ok: false; erro: string };

/** Valida o corpo do POST de produto novo (código de barras, nome e preço são obrigatórios). */
function lerNovoProduto(corpo: unknown): Novo {
  if (!ehObjeto(corpo)) return { ok: false, erro: 'Corpo inválido' };
  const permitidos = ['codigoBarras', 'nome', 'preco', 'quantidade', 'categoria', 'disponivel'];
  for (const chave of Object.keys(corpo)) {
    if (!permitidos.includes(chave)) return { ok: false, erro: `Campo não permitido: ${chave}` };
  }
  const bruto = corpo.codigoBarras;
  if (typeof bruto !== 'string' && typeof bruto !== 'number') return { ok: false, erro: 'Código de barras obrigatório' };
  const barras = validarCodigoBarras(bruto);
  if (!barras.ok) return { ok: false, erro: barras.motivo };
  const nome = textoNaoVazio(corpo.nome);
  if (nome === undefined) return { ok: false, erro: 'Nome inválido' };
  const preco = typeof corpo.preco === 'number' || typeof corpo.preco === 'string' ? parsePreco(corpo.preco) : null;
  if (preco === null) return { ok: false, erro: 'Preço inválido' };

  const q = corpo.quantidade;
  if (q !== undefined && q !== null && typeof q !== 'string') return { ok: false, erro: 'Quantidade inválida' };
  const textoQuantidade = typeof q === 'string' ? q.trim() : '';
  const parseada = textoQuantidade === '' ? null : parseQuantidade(textoQuantidade);

  const c = corpo.categoria;
  if (c !== undefined && c !== null && typeof c !== 'string') return { ok: false, erro: 'Categoria inválida' };
  const d = corpo.disponivel;
  if (d !== undefined && typeof d !== 'boolean') return { ok: false, erro: 'Disponível inválido' };

  return {
    ok: true,
    oferta: {
      codigoBarras: barras.codigo,
      nome,
      nomeNorm: normalizarTexto(nome),
      preco,
      quantidadeTexto: textoQuantidade === '' ? null : textoQuantidade,
      quantidadeValor: parseada?.valor ?? null,
      quantidadeUnidade: parseada?.unidade ?? null,
      categoria: typeof c === 'string' ? (textoNaoVazio(c) ?? null) : null,
      disponivel: d ?? true,
      promocaoPreco: null,
      promocaoInicio: null,
      promocaoFim: null,
    },
  };
}

export function rotasPainel({ repo, aoMudarProdutos }: { repo: Repositorio; aoMudarProdutos?: () => void }): FastifyPluginAsync {
  return async (app) => {
    app.decorateRequest('mercadoDoPainel', null as never);

    const papelPainel = exigirPapel('mercado', 'admin');
    /**
     * R19: papel `mercado` + mercado próprio existente e ativo. O administrador também entra, mas precisa dizer
     * qual mercado quer ver/editar (`?mercadoId=`). Deixa o mercado em `req.mercadoDoPainel`.
     */
    const exigirMercadoAtivo: preHandlerAsyncHookHandler = async (req, reply) => {
      await papelPainel.call(app, req, reply);
      if (reply.sent) return reply;
      let mercado: Mercado | null;
      if (req.usuario.papel === 'admin') {
        const bruto = (req.query as { mercadoId?: unknown }).mercadoId;
        const id = typeof bruto === 'string' && /^\d+$/.test(bruto) ? Number(bruto) : null;
        if (id === null || !Number.isSafeInteger(id)) return reply.code(400).send({ erro: MSG_ESCOLHA_MERCADO });
        mercado = await repo.acharMercado(id);
      } else {
        // Papel mercado: um dos mercados DELE (o primeiro, ou o escolhido com ?mercadoId=); nunca o de outra pessoa.
        const escolha = await mercadoEscolhidoDoUsuario(repo, req.usuario.id, (req.query as { mercadoId?: unknown }).mercadoId);
        if (!escolha.ok) return reply.code(escolha.status).send({ erro: escolha.erro });
        mercado = escolha.mercado;
      }
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
        telefone: m.telefone ?? null,
        detalhes: m.detalhes ?? null,
        perfilCompleto: Boolean(m.detalhes && m.telefone),
        totalProdutos: ofertas.length,
        produtosDesatualizados: ofertas.filter((o) => precoDesatualizado(o.precoAtualizadoEm, agora)).length,
      };
    }

    app.get('/painel/mercado', opcoes, async (req) => resumoDoMercado(req.mercadoDoPainel));

    // Editar o "Meu mercado": nome, endereço completo (por partes) e telefone. O resultado precisa ficar completo.
    app.patch('/painel/mercado', opcoes, async (req, reply) => {
      const mercado = req.mercadoDoPainel;
      const edicao = lerEdicaoMercado(req.body, mercado);
      if (!edicao.ok) return reply.code(400).send({ erro: edicao.erro });
      try {
        await repo.atualizarMercado(mercado.id, edicao.valor);
      } catch (e) {
        if (e instanceof ErroMercadoDuplicado) {
          return reply.code(409).send({ erro: 'Já existe um mercado com esse nome e endereço' });
        }
        throw e;
      }
      return resumoDoMercado({ ...mercado, ...edicao.valor });
    });

    app.get<{ Querystring: { pagina?: unknown; q?: unknown } }>('/painel/produtos', opcoes, async (req, reply) => {
      const bruto = req.query.pagina;
      let pagina = 1;
      if (bruto !== undefined) {
        pagina = typeof bruto === 'string' && /^\d+$/.test(bruto) ? Number(bruto) : 0;
        if (!Number.isSafeInteger(pagina) || pagina < 1) return reply.code(400).send({ erro: 'Página inválida' });
      }
      // `q` filtra por parte do nome (sem acento/maiúscula) ou do código de barras.
      const busca = typeof req.query.q === 'string' ? normalizarTexto(req.query.q) : '';
      const ofertas = (await repo.listarOfertasDoMercado(req.mercadoDoPainel.id))
        .filter((o) => busca === '' || o.nomeNorm.includes(busca) || o.codigoBarras.includes(busca))
        .sort((a, b) => comparar(a.nomeNorm, b.nomeNorm) || comparar(a.codigoBarras, b.codigoBarras));
      const agora = new Date();
      const inicio = (pagina - 1) * POR_PAGINA;
      const daPagina = ofertas.slice(inicio, inicio + POR_PAGINA);
      const fotos = await fotosDe(repo, daPagina.map((o) => o.codigoBarras));
      return { itens: daPagina.map((o) => aProdutoPainel(o, agora, fotos)), total: ofertas.length };
    });

    // Produto novo cadastrado à mão (além da planilha). Vale para o mercado do usuário logado.
    app.post('/painel/produtos', opcoes, async (req, reply) => {
      const novo = lerNovoProduto(req.body);
      if (!novo.ok) return reply.code(400).send({ erro: novo.erro });
      const mercadoId = req.mercadoDoPainel.id;
      const resultado = await repo.transacao(async (r) => {
        if (await r.acharOferta(mercadoId, novo.oferta.codigoBarras)) return null;
        const agora = new Date();
        const oferta: OfertaArmazenada = { ...novo.oferta, mercadoId, precoAtualizadoEm: agora };
        await r.salvarOferta(oferta);
        return aProdutoPainel(oferta, agora, await fotosDe(r, [oferta.codigoBarras])); // o código pode já ter foto (de outro mercado ou achada)
      });
      if (!resultado) return reply.code(409).send({ erro: 'Já existe um produto com esse código de barras neste mercado' });
      aoMudarProdutos?.(); // produto novo: procura a foto dele
      return reply.code(201).send(resultado);
    });

    app.patch<{ Params: { codigo: string } }>('/painel/produtos/:codigo', opcoes, async (req, reply) => {
      // Valida o corpo antes de abrir a transação: dentro dela só vai o que precisa ser atômico.
      const edicao = lerEdicaoProduto(req.body);
      if (!edicao.ok) return reply.code(400).send({ erro: edicao.erro });

      // Achar, mesclar e salvar numa só transação (R22), só com o `r` recebido: uma importação ou outra
      // chamada não pode entrar no meio (nem a planilha perder para um valor velho, nem um DELETE ser desfeito).
      const mercadoId = req.mercadoDoPainel.id;
      const resultado = await repo.transacao(async (r) => {
        const atual = await r.acharOferta(mercadoId, req.params.codigo);
        if (!atual) return null;
        const agora = new Date();
        // salvarOferta troca a oferta inteira; parte do que está gravado e do mercado do usuário.
        const nova: OfertaArmazenada = {
          ...atual,
          ...edicao.parcial,
          ...(edicao.renovaPreco ? { precoAtualizadoEm: agora } : {}),
          mercadoId: atual.mercadoId,
        };
        await r.salvarOferta(nova);
        // A resposta substitui a linha na tela: tem de trazer também a foto, senão ela some ao confirmar o preço ou editar.
        return aProdutoPainel(nova, agora, await fotosDe(r, [nova.codigoBarras]));
      });
      if (!resultado) return reply.code(404).send({ erro: MSG_NAO_ACHOU });
      return resultado;
    });

    app.delete<{ Params: { codigo: string } }>('/painel/produtos/:codigo', opcoes, async (req, reply) => {
      const removida = await repo.removerOferta(req.mercadoDoPainel.id, req.params.codigo);
      if (!removida) return reply.code(404).send({ erro: MSG_NAO_ACHOU });
      return reply.code(204).send();
    });

    // Foto do produto enviada pelo mercado (o painel reduz a imagem antes). A foto é do código de barras: vale para todos os
    // mercados que vendem o produto e passa na frente da achada sozinha. Só quem vende o produto pode enviá-la.
    app.put<{ Params: { codigo: string } }>('/painel/produtos/:codigo/foto', opcoes, async (req, reply) => {
      const corpo = ehObjeto(req.body) ? req.body : {};
      const lida = lerImagem(corpo.imagem);
      if (!lida.ok) return reply.code(400).send({ erro: lida.erro });
      const oferta = await repo.acharOferta(req.mercadoDoPainel.id, req.params.codigo);
      if (!oferta) return reply.code(404).send({ erro: MSG_NAO_ACHOU });
      await repo.salvarFoto({
        codigoBarras: oferta.codigoBarras,
        origem: 'mercado',
        url: null,
        imagem: corpo.imagem as string,
        mercadoId: req.mercadoDoPainel.id,
        atualizadaEm: new Date(),
      });
      return { foto: caminhoDaFoto(oferta.codigoBarras), fotoOrigem: 'mercado' as const };
    });

    // Remove a foto enviada por um mercado (a do próprio mercado; o administrador remove qualquer uma). A foto achada
    // sozinha não se remove: para trocá-la, é só enviar uma foto nova.
    app.delete<{ Params: { codigo: string } }>('/painel/produtos/:codigo/foto', opcoes, async (req, reply) => {
      const oferta = await repo.acharOferta(req.mercadoDoPainel.id, req.params.codigo);
      if (!oferta) return reply.code(404).send({ erro: MSG_NAO_ACHOU });
      const foto = await repo.acharFoto(oferta.codigoBarras);
      if (!foto || (foto.url === null && foto.imagem === null)) return reply.code(404).send({ erro: 'Este produto não tem foto' });
      if (foto.origem !== 'mercado') {
        return reply.code(409).send({ erro: 'Esta foto veio do banco aberto de produtos. Para trocá-la, envie uma foto sua.' });
      }
      if (req.usuario.papel !== 'admin' && foto.mercadoId !== req.mercadoDoPainel.id) {
        return reply.code(403).send({ erro: 'Esta foto foi enviada por outro mercado' });
      }
      await repo.removerFoto(oferta.codigoBarras);
      aoMudarProdutos?.(); // sem foto de novo: a busca automática volta a procurar
      return reply.code(204).send();
    });

    app.get('/painel/cobranca', opcoes, async (req) => {
      const situacao = req.mercadoDoPainel.contaSituacao;
      return { situacao, mensagem: MENSAGEM_COBRANCA[situacao] };
    });
  };
}
