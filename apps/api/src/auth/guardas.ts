import type { preHandlerAsyncHookHandler } from 'fastify';
import type { Papel, Repositorio } from '../repositorio';

export interface UsuarioAutenticado {
  id: number;
  papel: Papel;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: UsuarioAutenticado;
    user: UsuarioAutenticado;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    repo: Repositorio;
  }
  interface FastifyRequest {
    usuario: UsuarioAutenticado;
  }
}

/**
 * 401 sem token válido ou se a conta não existe mais; 403 se o papel não está na lista.
 * O papel vem do repositório, não do token: conta apagada ou rebaixada perde o acesso na hora.
 */
export function exigirPapel(...papeis: Papel[]): preHandlerAsyncHookHandler {
  return async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ erro: 'Não autenticado' });
    }
    const usuario = await req.server.repo.acharUsuario(req.user.id);
    if (!usuario) return reply.code(401).send({ erro: 'Sessão inválida' });
    if (!papeis.includes(usuario.papel)) {
      return reply.code(403).send({ erro: 'Sem permissão para esta ação' });
    }
    req.usuario = { id: usuario.id, papel: usuario.papel };
  };
}
