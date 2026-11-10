import type { FastifyPluginAsync } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import { ErroPlanilha, importarPlanilha, type Ator } from '../planilha/importar';
import { mercadoEscolhidoDoUsuario } from '../painel/mercadoEscolhido';
import { gerarModelo } from '../planilha/modelo';
import type { Repositorio } from '../repositorio';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MSG_SEM_ARQUIVO = "Envie a planilha no campo 'arquivo'";
const MSG_GRANDE = 'Planilha grande demais para ser importada';

export function rotasPlanilhas({ repo, aoMudarProdutos }: { repo: Repositorio; aoMudarProdutos?: () => void }): FastifyPluginAsync {
  return async (app) => {
    app.get('/planilhas/modelo', { preHandler: exigirPapel('mercado', 'admin') }, async (_req, reply) => {
      const modelo = await gerarModelo();
      return reply
        .header('Content-Type', TIPO_XLSX)
        .header('Content-Disposition', 'attachment; filename="modelo-bolso-certo.xlsx"')
        .send(modelo);
    });

    app.post('/planilhas', { preHandler: exigirPapel('mercado', 'admin') }, async (req, reply) => {
      let ator: Ator;
      if (req.usuario.papel === 'admin') {
        ator = { papel: 'admin' };
      } else {
        // A planilha vai para um mercado DO usuário: o escolhido com ?mercadoId= ou o primeiro dele.
        const escolha = await mercadoEscolhidoDoUsuario(repo, req.usuario.id, (req.query as { mercadoId?: unknown }).mercadoId);
        if (!escolha.ok) return reply.code(escolha.status).send({ erro: escolha.erro });
        ator = { papel: 'mercado', mercadoId: escolha.mercado.id };
      }

      if (!req.isMultipart()) return reply.code(400).send({ erro: MSG_SEM_ARQUIVO });
      let arquivo: Buffer;
      try {
        const parte = await req.file();
        if (!parte || parte.fieldname !== 'arquivo') return reply.code(400).send({ erro: MSG_SEM_ARQUIVO });
        arquivo = await parte.toBuffer();
        if (parte.file.truncated) return reply.code(422).send({ erro: MSG_GRANDE });
      } catch (e) {
        const codigo = (e as { code?: string }).code;
        if (codigo === 'FST_REQ_FILE_TOO_LARGE') return reply.code(422).send({ erro: MSG_GRANDE });
        if (typeof codigo === 'string' && codigo.startsWith('FST_')) {
          return reply.code(400).send({ erro: MSG_SEM_ARQUIVO });
        }
        throw e;
      }

      try {
        const relatorio = await importarPlanilha(repo, arquivo, ator);
        // Planilha com promoções: ficou RETIDA até o pagamento (nada foi salvo). 202 = recebido, mas ainda não aplicado.
        if (relatorio.retida) return reply.code(202).send(relatorio);
        aoMudarProdutos?.(); // produtos novos: procura a foto deles
        return relatorio;
      } catch (e) {
        if (e instanceof ErroPlanilha) return reply.code(422).send({ erro: e.message });
        throw e;
      }
    });
  };
}
