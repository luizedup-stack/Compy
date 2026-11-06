// "Meus mercados": um usuário (papel "mercado") pode ter mais de um mercado.
// - GET  /painel/meus-mercados  lista os mercados ativos dele (o painel usa para o seletor);
// - POST /painel/meus-mercados  cadastra um mercado novo, com o endereço completo e o telefone.
// Não passam pelo guarda `exigirMercadoAtivo` (que exige já ter um mercado), por isso ficam num arquivo à parte.
import type { FastifyPluginAsync } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import { lerMercadoNovo, paraGravar } from '../painel/dadosDoMercado';
import { ErroMercadoDuplicado, type Mercado, type Repositorio } from '../repositorio';

/** Limite simples para evitar abuso (cadastro em massa de mercados falsos por uma conta só). */
export const MAXIMO_DE_MERCADOS_POR_CONTA = 20;

/** Um mercado como a lista do painel o mostra. `perfilCompleto`: já tem o endereço por partes e o telefone. */
function resumo(m: Mercado, totalProdutos: number) {
  return {
    id: m.id,
    nome: m.nome,
    endereco: m.endereco,
    totalProdutos,
    perfilCompleto: Boolean(m.detalhes && m.telefone),
  };
}

export function rotasMeusMercados({ repo }: { repo: Repositorio }): FastifyPluginAsync {
  return async (app) => {
    const opcoes = { preHandler: exigirPapel('mercado') };

    app.get('/painel/meus-mercados', opcoes, async (req) => {
      const ativos = (await repo.listarMercadosDoUsuario(req.usuario.id)).filter((m) => m.status === 'ativo');
      return Promise.all(ativos.map(async (m) => resumo(m, (await repo.listarOfertasDoMercado(m.id)).length)));
    });

    app.post('/painel/meus-mercados', opcoes, async (req, reply) => {
      const dados = lerMercadoNovo(req.body);
      if (!dados.ok) return reply.code(400).send({ erro: dados.erro });
      try {
        const criado = await repo.transacao(async (r) => {
          const ativos = (await r.listarMercadosDoUsuario(req.usuario.id)).filter((m) => m.status === 'ativo');
          if (ativos.length >= MAXIMO_DE_MERCADOS_POR_CONTA) return null;
          return r.criarMercado({
            ...paraGravar(dados.valor),
            status: 'ativo',
            contaSituacao: 'gratuita',
            usuarioId: req.usuario.id,
          });
        });
        if (!criado) {
          return reply.code(409).send({ erro: `Cada conta pode ter até ${MAXIMO_DE_MERCADOS_POR_CONTA} mercados` });
        }
        return reply.code(201).send(resumo(criado, 0));
      } catch (e) {
        if (e instanceof ErroMercadoDuplicado) {
          return reply.code(409).send({ erro: 'Já existe um mercado com esse nome e endereço' });
        }
        throw e;
      }
    });
  };
}
