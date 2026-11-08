import type { FastifyPluginAsync } from 'fastify';
import { lerImagem } from '../fotos/imagem';
import type { Repositorio } from '../repositorio';

const CODIGO = /^\d{8,14}$/;

/**
 * Foto de um produto, pelo código de barras (rota PÚBLICA: o app a usa sem login). Foto enviada por um mercado é entregue
 * daqui mesmo; foto achada no banco aberto de produtos leva (redirecionamento) para a imagem lá. Sem foto: 404.
 */
export function rotasFotos({ repo }: { repo: Repositorio }): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { codigo: string } }>('/fotos/:codigo', async (req, reply) => {
      const { codigo } = req.params;
      if (!CODIGO.test(codigo)) return reply.code(404).send({ erro: 'Sem foto' });
      const foto = await repo.acharFoto(codigo);
      if (!foto) return reply.code(404).send({ erro: 'Sem foto' });

      reply.header('Cache-Control', 'public, max-age=86400');
      if (foto.imagem) {
        const lida = lerImagem(foto.imagem);
        if (!lida.ok) return reply.code(404).send({ erro: 'Sem foto' });
        return reply.header('X-Content-Type-Options', 'nosniff').type(lida.tipo).send(lida.bytes);
      }
      // Só o link do banco aberto (que o buscador já validou) vira redirecionamento. Link de planilha, que vem de fora, nunca: o servidor
      // não vira um "redirecionador" para qualquer endereço; enquanto a imagem não foi baixada, não há foto.
      if (foto.url && foto.origem === 'openfoodfacts') return reply.redirect(foto.url, 302);
      return reply.code(404).send({ erro: 'Sem foto' }); // procurou e não achou
    });
  };
}
