import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { normalizarTexto } from '@mercado/shared';
import { z } from 'zod';
import type { EmailSender } from '../email';
import { ErroEmailJaExiste, ErroMercadoDuplicado, type Repositorio, type TipoToken, type Usuario } from '../repositorio';
import { exigirPapel } from './guardas';
import { conferirSenha, hashSenha } from './senha';

const HORA = 60 * 60 * 1000;
const VALIDADE: Record<TipoToken, number> = {
  verificar_email: 24 * HORA,
  redefinir_senha: 1 * HORA,
};

const MSG_EMAIL = 'E-mail inválido';
const MSG_SENHA = 'Informe a senha';
const MSG_CODIGO = 'Informe o código';
const MSG_CORPO = 'Dados inválidos';

const emailSchema = z.string({ error: MSG_EMAIL }).trim().toLowerCase().pipe(z.email({ error: MSG_EMAIL }));
const senhaNovaSchema = z
  .string({ error: MSG_SENHA })
  .min(8, 'A senha deve ter pelo menos 8 caracteres');
const nomeMercadoSchema = z
  .string({ error: 'Informe o nome do mercado' })
  .trim()
  .min(2, 'Informe o nome do mercado')
  .max(100, 'O nome do mercado é longo demais');
const enderecoMercadoSchema = z
  .string({ error: 'Informe o endereço do mercado' })
  .trim()
  .min(5, 'Informe o endereço do mercado')
  .max(200, 'O endereço do mercado é longo demais');
const codigoSchema = z.string({ error: MSG_CODIGO }).trim().min(1, MSG_CODIGO);

// Corpo ausente ou que não é objeto cai na mensagem do próprio objeto.
const objeto = <T extends z.ZodRawShape>(forma: T) => z.object(forma, { error: MSG_CORPO });

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

/** Resposta única para e-mail inexistente e senha errada. */
const ERRO_LOGIN = 'E-mail ou senha incorretos';
// Hash sem dono, só para gastar o mesmo tempo quando o e-mail não existe.
const hashFalso = hashSenha('senha-que-ninguem-tem');

function lerCorpo<T extends z.ZodType>(schema: T, corpo: unknown, reply: FastifyReply): z.output<T> | null {
  const r = schema.safeParse(corpo);
  if (r.success) return r.data;
  void reply.code(400).send({ erro: r.error.issues[0]?.message ?? MSG_CORPO });
  return null;
}

export function rotasAuth({ repo, email }: { repo: Repositorio; email: EmailSender }): FastifyPluginAsync {
  async function emitirToken(usuarioId: number, tipo: TipoToken): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await repo.guardarToken({
      usuarioId,
      tipo,
      tokenHash: sha256(token),
      expiraEm: new Date(Date.now() + VALIDADE[tipo]),
    });
    return token;
  }

  async function enviarVerificacao(usuario: Usuario): Promise<void> {
    const token = await emitirToken(usuario.id, 'verificar_email');
    await email.enviar(
      usuario.email,
      'Bolso Certo: confirme seu e-mail',
      [
        'Olá!',
        '',
        'Para confirmar seu e-mail, copie o código abaixo. Use este código no aplicativo ou no painel do Bolso Certo.',
        'Ele vale por 24 horas.',
        '',
        token,
        '',
        'Se você não criou uma conta no Bolso Certo, ignore esta mensagem.',
        '',
      ].join('\n'),
    );
  }

  async function enviarRedefinicao(usuario: Usuario): Promise<void> {
    const token = await emitirToken(usuario.id, 'redefinir_senha');
    await email.enviar(
      usuario.email,
      'Bolso Certo: redefinição de senha',
      [
        'Olá!',
        '',
        'Recebemos um pedido para redefinir a senha da sua conta no Bolso Certo.',
        'Copie o código abaixo. Use este código no aplicativo ou no painel do Bolso Certo.',
        'Ele vale por 1 hora.',
        '',
        token,
        '',
        'Se não foi você, ignore esta mensagem: sua senha continua a mesma.',
        '',
      ].join('\n'),
    );
  }

  return async (app) => {
    app.post('/auth/cadastro', async (req, reply) => {
      const dados = lerCorpo(objeto({ email: emailSchema, senha: senhaNovaSchema }), req.body, reply);
      if (!dados) return reply;
      let usuario: Usuario;
      try {
        usuario = await repo.criarUsuario({
          email: dados.email,
          senhaHash: await hashSenha(dados.senha),
          papel: 'cliente',
          emailVerificado: false,
        });
      } catch (e) {
        if (e instanceof ErroEmailJaExiste) return reply.code(409).send({ erro: 'E-mail já cadastrado' });
        throw e;
      }
      await enviarVerificacao(usuario);
      return reply.code(201).send({ id: usuario.id, email: usuario.email, papel: usuario.papel });
    });

    // O próprio mercado se cadastra (software "Bolso Certo - Mercado"): cria a conta de acesso e o mercado, já ligados.
    // Daí em diante ele só enxerga e edita o que é dele (veja rotas/painel.ts).
    app.post('/auth/cadastro-mercado', async (req, reply) => {
      const schema = objeto({
        nome: nomeMercadoSchema,
        endereco: enderecoMercadoSchema,
        email: emailSchema,
        senha: senhaNovaSchema,
      });
      const dados = lerCorpo(schema, req.body, reply);
      if (!dados) return reply;
      const senhaHash = await hashSenha(dados.senha);
      let criado: { usuario: Usuario; mercadoId: number };
      try {
        criado = await repo.transacao(async (r) => {
          const usuario = await r.criarUsuario({ email: dados.email, senhaHash, papel: 'mercado', emailVerificado: false });
          const mercado = await r.criarMercado({
            nome: dados.nome,
            endereco: dados.endereco,
            nomeNorm: normalizarTexto(dados.nome),
            enderecoNorm: normalizarTexto(dados.endereco),
            status: 'ativo',
            contaSituacao: 'gratuita',
            usuarioId: usuario.id,
          });
          return { usuario, mercadoId: mercado.id };
        });
      } catch (e) {
        if (e instanceof ErroEmailJaExiste) return reply.code(409).send({ erro: 'E-mail já cadastrado' });
        if (e instanceof ErroMercadoDuplicado) {
          return reply.code(409).send({ erro: 'Já existe um mercado com esse nome e endereço' });
        }
        throw e;
      }
      await enviarVerificacao(criado.usuario);
      return reply
        .code(201)
        .send({ id: criado.usuario.id, email: criado.usuario.email, papel: criado.usuario.papel, mercadoId: criado.mercadoId });
    });

    app.post('/auth/login', async (req, reply) => {
      const schema = objeto({ email: emailSchema, senha: z.string({ error: MSG_SENHA }).min(1, MSG_SENHA) });
      const dados = lerCorpo(schema, req.body, reply);
      if (!dados) return reply;
      const usuario = await repo.acharUsuarioPorEmail(dados.email);
      const confere = await conferirSenha(dados.senha, usuario ? usuario.senhaHash : await hashFalso);
      if (!usuario || !confere) return reply.code(401).send({ erro: ERRO_LOGIN });
      const token = app.jwt.sign({ id: usuario.id, papel: usuario.papel, inst: app.instancia });
      return { token, papel: usuario.papel, emailVerificado: usuario.emailVerificado };
    });

    app.post('/auth/verificar-email', async (req, reply) => {
      const dados = lerCorpo(objeto({ token: codigoSchema }), req.body, reply);
      if (!dados) return reply;
      const usuarioId = await repo.consumirToken('verificar_email', sha256(dados.token), new Date());
      if (usuarioId === null) return reply.code(400).send({ erro: 'Código inválido ou expirado' });
      await repo.atualizarUsuario(usuarioId, { emailVerificado: true });
      return reply.code(204).send();
    });

    app.post(
      '/auth/reenviar-verificacao',
      { preHandler: exigirPapel('cliente', 'mercado', 'admin') },
      async (req, reply) => {
        const usuario = await repo.acharUsuario(req.usuario.id);
        if (!usuario) return reply.code(401).send({ erro: 'Não autenticado' });
        if (!usuario.emailVerificado) await enviarVerificacao(usuario);
        return reply.code(204).send();
      },
    );

    app.post('/auth/esqueci-senha', async (req, reply) => {
      const dados = lerCorpo(objeto({ email: emailSchema }), req.body, reply);
      if (!dados) return reply;
      const usuario = await repo.acharUsuarioPorEmail(dados.email);
      if (usuario) {
        try {
          await enviarRedefinicao(usuario);
        } catch (e) {
          // A resposta não pode revelar se o e-mail existe, nem pelo erro.
          app.log.error(e);
        }
      }
      return reply.code(204).send();
    });

    app.post('/auth/redefinir-senha', async (req, reply) => {
      const dados = lerCorpo(objeto({ token: codigoSchema, senha: senhaNovaSchema }), req.body, reply);
      if (!dados) return reply;
      const usuarioId = await repo.consumirToken('redefinir_senha', sha256(dados.token), new Date());
      if (usuarioId === null) return reply.code(400).send({ erro: 'Código inválido ou expirado' });
      await repo.atualizarUsuario(usuarioId, { senhaHash: await hashSenha(dados.senha) });
      return reply.code(204).send();
    });

    app.delete('/conta', { preHandler: exigirPapel('cliente') }, async (req, reply) => {
      await repo.excluirUsuario(req.usuario.id);
      return reply.code(204).send();
    });
  };
}
