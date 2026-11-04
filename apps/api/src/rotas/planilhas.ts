import type { FastifyPluginAsync } from 'fastify';
import { exigirPapel } from '../auth/guardas';
import { ErroPlanilha, importarPlanilha, type Ator } from '../planilha/importar';
import { gerarModelo } from '../planilha/modelo';
import type { Repositorio } from '../repositorio';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MSG_SEM_ARQUIVO = "Envie a planilha no campo 'arquivo'";
const MSG_GRANDE = 'Planilha grande demais para ser importada';

export function rotasPlanilhas({ repo }: { repo: Repositorio }): FastifyPluginAsync {
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
        const mercado = await repo.acharMercadoDoUsuario(req.usuario.id);
        if (!mercado) return reply.code(403).send({ erro: 'Sua conta não está ligada a um mercado' });
        ator = { papel: 'mercado', mercadoId: mercado.id };
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
        return await importarPlanilha(repo, arquivo, ator);
      } catch (e) {
        if (e instanceof ErroPlanilha) return reply.code(422).send({ erro: e.message });
        throw e;
      }
    });
  };
}
