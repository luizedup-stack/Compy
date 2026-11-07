import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Papel, Repositorio } from '../repositorio';

export interface UsuarioAutenticado {
  id: number;
  papel: Papel;
}

/** O que vai assinado no token: id, papel e a instância do servidor que o emitiu. */
export interface DadosToken extends UsuarioAutenticado {
  inst: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: DadosToken;
    user: DadosToken;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    repo: Repositorio;
    /** Identificador aleatório gerado a cada início do servidor (veja construirApp). */
    instancia: string;
  }
  interface FastifyRequest {
    usuario: UsuarioAutenticado;
  }
}

/**
 * 401 sem token válido ou se a conta não existe mais; 403 se o papel não está na lista.
 * O papel vem do repositório, não do token: conta apagada ou rebaixada perde o acesso na hora.
 * Token emitido por outro início do servidor (ou sem `inst`) também é 401 "Sessão inválida": no
 * repositório em memória os ids recomeçam em 1 a cada início, e um token antigo apontaria para a
 * conta de outra pessoa.
 */
export function exigirPapel(...papeis: Papel[]): preHandlerAsyncHookHandler {
  return async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ erro: 'Não autenticado' });
    }
    if (req.user.inst !== req.server.instancia) return reply.code(401).send({ erro: 'Sessão inválida' });
    const usuario = await req.server.repo.acharUsuario(req.user.id);
    if (!usuario) return reply.code(401).send({ erro: 'Sessão inválida' });
    if (!papeis.includes(usuario.papel)) {
      return reply.code(403).send({ erro: 'Sem permissão para esta ação' });
    }
    req.usuario = { id: usuario.id, papel: usuario.papel };
  };
}

/**
 * Para rotas públicas (busca, mercados, catálogo) que, havendo um login válido, o aproveitam: devolve o usuário se a
 * requisição traz um token válido deste servidor de uma conta que ainda existe, e `null` em qualquer outro caso
 * (sem token, token vencido, de outro servidor, conta apagada). Nunca responde 401: quem não entrou também usa o app.
 */
export async function usuarioOpcional(req: FastifyRequest): Promise<UsuarioAutenticado | null> {
  if (!req.headers.authorization) return null;
  try {
    await req.jwtVerify();
  } catch {
    return null;
  }
  if (req.user.inst !== req.server.instancia) return null;
  const usuario = await req.server.repo.acharUsuario(req.user.id);
  return usuario ? { id: usuario.id, papel: usuario.papel } : null;
}
