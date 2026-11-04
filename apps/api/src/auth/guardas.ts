import type { preHandlerAsyncHookHandler } from 'fastify';
import type { Papel } from '../repositorio';

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
  interface FastifyRequest {
    usuario: UsuarioAutenticado;
  }
}

/** 401 sem token válido, 403 se o papel não está na lista; senão preenche `req.usuario`. */
export function exigirPapel(...papeis: Papel[]): preHandlerAsyncHookHandler {
  return async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ erro: 'Não autenticado' });
    }
    const { id, papel } = req.user;
    if (!papeis.includes(papel)) {
      return reply.code(403).send({ erro: 'Sem permissão para esta ação' });
    }
    req.usuario = { id, papel };
  };
}
