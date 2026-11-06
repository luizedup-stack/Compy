// Perfil do cliente (tela "Conta" do aplicativo): ver e editar nome de usuário, foto, e-mail e senha.
// - GET   /conta        o perfil atual;
// - PATCH /conta        altera nome, foto e/ou e-mail (só os campos enviados mudam);
// - POST  /conta/senha  troca a senha (exige a senha atual).
// A exclusão da conta (DELETE /conta) está em auth/rotas.ts.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exigirPapel } from '../auth/guardas';
import { conferirSenha, hashSenha } from '../auth/senha';
import { ErroEmailJaExiste, type Repositorio, type Usuario } from '../repositorio';

const MSG_NOME = 'O nome deve ter de 2 a 50 caracteres';
const MSG_FOTO = 'Foto inválida (use uma imagem JPEG, PNG ou WebP pequena)';
const MSG_EMAIL = 'E-mail inválido';
const MSG_SENHA_CURTA = 'A senha deve ter pelo menos 8 caracteres';
const MSG_SENHA_ATUAL = 'Senha atual incorreta';

/**
 * Tamanho máximo da foto, em caracteres do texto (~225 KB de imagem). O aplicativo reduz a foto para algo como
 * 256x256 antes de enviar (poucas dezenas de KB), então o limite só barra abuso.
 */
export const LIMITE_FOTO = 300_000;
const FORMATO_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** O perfil como o aplicativo o vê (nunca inclui a senha). */
function perfil(u: Usuario) {
  return { id: u.id, email: u.email, nome: u.nome ?? null, foto: u.foto ?? null };
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function rotasConta({ repo }: { repo: Repositorio }): FastifyPluginAsync {
  return async (app) => {
    const opcoes = { preHandler: exigirPapel('cliente') };

    app.get('/conta', opcoes, async (req, reply) => {
      const u = await repo.acharUsuario(req.usuario.id);
      if (!u) return reply.code(401).send({ erro: 'Sessão inválida' });
      return perfil(u);
    });

    app.patch('/conta', opcoes, async (req, reply) => {
      const corpo = req.body;
      if (!ehObjeto(corpo) || Object.keys(corpo).length === 0) return reply.code(400).send({ erro: 'Nada para alterar' });
      const parcial: Partial<Pick<Usuario, 'nome' | 'foto' | 'email'>> = {};

      for (const [chave, valor] of Object.entries(corpo)) {
        if (chave === 'nome') {
          // Vazio ou null apaga o nome.
          if (valor === null || (typeof valor === 'string' && valor.trim() === '')) {
            parcial.nome = null;
          } else if (typeof valor === 'string' && valor.trim().length >= 2 && valor.trim().length <= 50) {
            parcial.nome = valor.trim();
          } else {
            return reply.code(400).send({ erro: MSG_NOME });
          }
        } else if (chave === 'foto') {
          if (valor === null) {
            parcial.foto = null;
          } else if (typeof valor === 'string' && valor.length <= LIMITE_FOTO && FORMATO_FOTO.test(valor)) {
            parcial.foto = valor;
          } else {
            return reply.code(400).send({ erro: MSG_FOTO });
          }
        } else if (chave === 'email') {
          const e = emailSchema.safeParse(valor);
          if (!e.success) return reply.code(400).send({ erro: MSG_EMAIL });
          parcial.email = e.data;
        } else {
          return reply.code(400).send({ erro: `Campo não pode ser alterado: ${chave}` });
        }
      }

      // Trocar o e-mail por um que já é de outra conta: 409 (o próprio e-mail atual é aceito).
      if (parcial.email !== undefined) {
        const dono = await repo.acharUsuarioPorEmail(parcial.email);
        if (dono && dono.id !== req.usuario.id) return reply.code(409).send({ erro: 'E-mail já cadastrado' });
      }
      try {
        await repo.atualizarUsuario(req.usuario.id, parcial);
      } catch (e) {
        if (e instanceof ErroEmailJaExiste) return reply.code(409).send({ erro: 'E-mail já cadastrado' });
        throw e;
      }
      const u = await repo.acharUsuario(req.usuario.id);
      return perfil(u!);
    });

    // Troca de senha. Senha atual errada é 400 (e não 401): um 401 faria o aplicativo achar que a sessão acabou e sair da conta.
    app.post('/conta/senha', opcoes, async (req, reply) => {
      const corpo = req.body;
      const atual = ehObjeto(corpo) ? corpo.senhaAtual : undefined;
      const nova = ehObjeto(corpo) ? corpo.senhaNova : undefined;
      if (typeof atual !== 'string' || atual === '') return reply.code(400).send({ erro: 'Informe a senha atual' });
      if (typeof nova !== 'string' || nova.length < 8) return reply.code(400).send({ erro: MSG_SENHA_CURTA });
      const u = await repo.acharUsuario(req.usuario.id);
      if (!u) return reply.code(401).send({ erro: 'Sessão inválida' });
      if (!(await conferirSenha(atual, u.senhaHash))) return reply.code(400).send({ erro: MSG_SENHA_ATUAL });
      await repo.atualizarUsuario(u.id, { senhaHash: await hashSenha(nova) });
      return reply.code(204).send();
    });
  };
}
