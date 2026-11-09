import type { FastifyPluginAsync } from 'fastify';
import { lerImagem } from '../fotos/imagem';
import type { FotosEmbutidas } from '../fotos/embutidas';
import type { Repositorio } from '../repositorio';

const CODIGO = /^\d{8,14}$/;

/**
 * Foto de um produto, pelo código de barras (rota PÚBLICA: o app a usa sem login). Foto enviada por um mercado é entregue
 * daqui mesmo; foto achada no banco aberto de produtos leva (redirecionamento) para a imagem lá. Sem foto: 404.
 */
export function rotasFotos({ repo, embutidas }: { repo: Repositorio; embutidas?: FotosEmbutidas }): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { codigo: string } }>('/fotos/:codigo', async (req, reply) => {
      const { codigo } = req.params;
      if (!CODIGO.test(codigo)) return reply.code(404).send({ erro: 'Sem foto' });
      const foto = await repo.acharFoto(codigo);
      const entregar = (imagem: string) => {
        const lida = lerImagem(imagem);
        if (!lida.ok) return reply.code(404).send({ erro: 'Sem foto' });
        return reply.header('X-Content-Type-Options', 'nosniff').type(lida.tipo).send(lida.bytes);
      };

      reply.header('Cache-Control', 'public, max-age=86400');
      // ?mercadoId=N: a foto PRÓPRIA desse mercado, se ele tem (quando o produto já tinha foto de outro, a do mercado fica só para ele).
      const textoMercado = (req.query as { mercadoId?: unknown }).mercadoId;
      if (typeof textoMercado === 'string' && /^\d{1,9}$/.test(textoMercado)) {
        const propria = await repo.acharFotoDoMercado(Number(textoMercado), codigo);
        if (propria?.imagem) return entregar(propria.imagem);
      }
      if (foto?.imagem) return entregar(foto.imagem);
      // Sem foto guardada (nem link do banco aberto a seguir): a ilustrativa do tipo, do banco de fotos do sistema.
      if (embutidas && !(foto?.url && foto.origem === 'openfoodfacts')) {
        const nome = await repo.acharNomeDoProduto(codigo);
        const doTipo = nome ? embutidas.imagemDoNome(nome) : null;
        if (doTipo) return entregar(doTipo);
      }
      if (!foto) return reply.code(404).send({ erro: 'Sem foto' });
      // Só o link do banco aberto (que o buscador já validou) vira redirecionamento. Link de planilha, que vem de fora, nunca: o servidor
      // não vira um "redirecionador" para qualquer endereço; enquanto a imagem não foi baixada, não há foto.
      if (foto.url && foto.origem === 'openfoodfacts') return reply.redirect(foto.url, 302);
      return reply.code(404).send({ erro: 'Sem foto' }); // procurou e não achou
    });
  };
}
