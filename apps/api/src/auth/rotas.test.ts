import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEmailMemoria } from '../email';
import { construirApp } from '../app';
import type { Papel, Repositorio } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { hashSenha } from './senha';

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');
const HORA = 60 * 60 * 1000;

let repo: Repositorio;
let email: ReturnType<typeof criarEmailMemoria>;
let app: FastifyInstance;

beforeEach(async () => {
  repo = criarRepositorioMemoria();
  email = criarEmailMemoria();
  app = await construirApp({ repo, email, jwtSecret: 'segredo-de-teste' });
});

const tokenDoEmail = (indice = email.enviados.length - 1): string => {
  const linha = email.enviados[indice]!.texto.split('\n').find((l) => /^[0-9a-f]{64}$/.test(l));
  if (!linha) throw new Error('e-mail sem token em linha própria');
  return linha;
};

const cadastrar = (endereco = 'ana@exemplo.com', senha = 'senha-boa-123') =>
  app.inject({ method: 'POST', url: '/auth/cadastro', payload: { email: endereco, senha } });

const entrar = (endereco: string, senha: string) =>
  app.inject({ method: 'POST', url: '/auth/login', payload: { email: endereco, senha } });

async function criarComPapel(papel: Papel, endereco = `${papel}@exemplo.com`) {
  const u = await repo.criarUsuario({
    email: endereco,
    senhaHash: await hashSenha('senha-boa-123'),
    papel,
    emailVerificado: true,
  });
  return { usuario: u, token: app.jwt.sign({ id: u.id, papel: u.papel, inst: app.instancia }) };
}

describe('POST /auth/cadastro', () => {
  it('cria um cliente não verificado e envia 1 e-mail com o token', async () => {
    const res = await cadastrar('  Ana@Exemplo.COM ');
    expect(res.statusCode).toBe(201);
    const u = await repo.acharUsuarioPorEmail('ana@exemplo.com');
    expect(u).toMatchObject({ email: 'ana@exemplo.com', papel: 'cliente', emailVerificado: false });
    expect(u!.senhaHash).not.toBe('senha-boa-123');
    expect(email.enviados).toHaveLength(1);
    const enviado = email.enviados[0]!;
    expect(enviado.para).toBe('ana@exemplo.com');
    expect(enviado.assunto).toContain('Bolso Certo');
    expect(enviado.texto).toContain('Bolso Certo');
    expect(tokenDoEmail()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('guarda só o hash SHA-256 do token, válido por 24 h', async () => {
    await cadastrar();
    const u = (await repo.acharUsuarioPorEmail('ana@exemplo.com'))!;
    const token = tokenDoEmail();
    const agora = Date.now();
    expect(await repo.consumirToken('verificar_email', token, new Date(agora))).toBeNull();
    expect(await repo.consumirToken('verificar_email', sha256(token), new Date(agora + 25 * HORA))).toBeNull();
    expect(await repo.consumirToken('verificar_email', sha256(token), new Date(agora + 23 * HORA))).toBe(u.id);
  });

  it('e-mail repetido, mesmo com outra caixa, responde 409', async () => {
    await cadastrar('ana@exemplo.com');
    const res = await cadastrar('ANA@exemplo.com');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ erro: expect.any(String) });
    expect(email.enviados).toHaveLength(1);
  });

  it('senha com menos de 8 caracteres responde 400', async () => {
    const res = await cadastrar('ana@exemplo.com', '1234567');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'A senha deve ter pelo menos 8 caracteres' });
    expect(await repo.acharUsuarioPorEmail('ana@exemplo.com')).toBeNull();
  });

  it('e-mail inválido, senha ausente ou corpo ausente respondem 400 em português', async () => {
    const emailRuim = await cadastrar('nao-e-email');
    expect(emailRuim.statusCode).toBe(400);
    expect(emailRuim.json()).toEqual({ erro: 'E-mail inválido' });
    const semSenha = await app.inject({
      method: 'POST',
      url: '/auth/cadastro',
      payload: { email: 'ana@exemplo.com' },
    });
    expect(semSenha.statusCode).toBe(400);
    expect(semSenha.json()).toEqual({ erro: 'Informe a senha' });
    const semCorpo = await app.inject({ method: 'POST', url: '/auth/cadastro' });
    expect(semCorpo.statusCode).toBe(400);
    expect(semCorpo.json()).toEqual({ erro: 'Dados inválidos' });
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await cadastrar('ana@exemplo.com', 'senha-boa-123');
  });

  it('com dados certos devolve token (7 dias, id, papel e instância), papel e emailVerificado', async () => {
    const res = await entrar('ANA@exemplo.com', 'senha-boa-123');
    expect(res.statusCode).toBe(200);
    const corpo = res.json();
    expect(corpo).toMatchObject({ papel: 'cliente', emailVerificado: false });
    const u = (await repo.acharUsuarioPorEmail('ana@exemplo.com'))!;
    const payload = app.jwt.verify<{ id: number; papel: string; iat: number; exp: number }>(corpo.token);
    expect(payload).toMatchObject({ id: u.id, papel: 'cliente', inst: app.instancia });
    expect(payload.exp - payload.iat).toBe(7 * 24 * 3600);
  });

  it('senha errada e e-mail inexistente respondem 401 com a mesma mensagem', async () => {
    const senhaErrada = await entrar('ana@exemplo.com', 'senha-errada-1');
    const inexistente = await entrar('ninguem@exemplo.com', 'senha-boa-123');
    expect(senhaErrada.statusCode).toBe(401);
    expect(inexistente.statusCode).toBe(401);
    expect(senhaErrada.json()).toEqual(inexistente.json());
    expect(senhaErrada.json()).toEqual({ erro: expect.any(String) });
  });

  it('corpo inválido responde 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana@exemplo.com' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Informe a senha' });
  });
});

describe('POST /auth/verificar-email', () => {
  it('marca o e-mail como verificado e o mesmo token usado de novo responde 400', async () => {
    await cadastrar();
    const token = tokenDoEmail();
    const res = await app.inject({ method: 'POST', url: '/auth/verificar-email', payload: { token } });
    expect(res.statusCode).toBe(204);
    expect((await repo.acharUsuarioPorEmail('ana@exemplo.com'))!.emailVerificado).toBe(true);
    const deNovo = await app.inject({ method: 'POST', url: '/auth/verificar-email', payload: { token } });
    expect(deNovo.statusCode).toBe(400);
    expect(deNovo.json()).toEqual({ erro: expect.any(String) });
  });

  it('token desconhecido ou expirado responde 400 e não verifica ninguém', async () => {
    await cadastrar();
    const u = (await repo.acharUsuarioPorEmail('ana@exemplo.com'))!;
    await repo.guardarToken({
      usuarioId: u.id,
      tipo: 'verificar_email',
      tokenHash: sha256('expirado'),
      expiraEm: new Date(Date.now() - 1000),
    });
    for (const token of ['qualquer-coisa', 'expirado']) {
      const res = await app.inject({ method: 'POST', url: '/auth/verificar-email', payload: { token } });
      expect(res.statusCode).toBe(400);
    }
    expect((await repo.acharUsuarioPorEmail('ana@exemplo.com'))!.emailVerificado).toBe(false);
  });

  it('um token de redefinição de senha não serve para verificar e-mail', async () => {
    await cadastrar();
    await app.inject({ method: 'POST', url: '/auth/esqueci-senha', payload: { email: 'ana@exemplo.com' } });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verificar-email',
      payload: { token: tokenDoEmail() },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/reenviar-verificacao', () => {
  it('sem token responde 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/reenviar-verificacao' });
    expect(res.statusCode).toBe(401);
  });

  it('autenticado, envia novo e-mail com um token que funciona', async () => {
    await cadastrar();
    const login = (await entrar('ana@exemplo.com', 'senha-boa-123')).json();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reenviar-verificacao',
      headers: { authorization: `Bearer ${login.token}` },
    });
    expect(res.statusCode).toBe(204);
    expect(email.enviados).toHaveLength(2);
    expect(email.enviados[1]!.assunto).toContain('Bolso Certo');
    const verificar = await app.inject({
      method: 'POST',
      url: '/auth/verificar-email',
      payload: { token: tokenDoEmail() },
    });
    expect(verificar.statusCode).toBe(204);
  });

  it('se o e-mail já está verificado, não envia nada', async () => {
    const { token } = await criarComPapel('cliente');
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reenviar-verificacao',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);
    expect(email.enviados).toHaveLength(0);
  });
});

describe('POST /auth/esqueci-senha', () => {
  it('e-mail inexistente responde 204 e não envia e-mail', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/esqueci-senha',
      payload: { email: 'ninguem@exemplo.com' },
    });
    expect(res.statusCode).toBe(204);
    expect(email.enviados).toHaveLength(0);
  });

  it('e-mail existente responde 204 e envia o token, válido por 1 h', async () => {
    await cadastrar();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/esqueci-senha',
      payload: { email: 'ANA@exemplo.com' },
    });
    expect(res.statusCode).toBe(204);
    expect(email.enviados).toHaveLength(2);
    const enviado = email.enviados[1]!;
    expect(enviado.para).toBe('ana@exemplo.com');
    expect(enviado.assunto).toContain('Bolso Certo');
    expect(enviado.texto).toContain('Bolso Certo');
    const u = (await repo.acharUsuarioPorEmail('ana@exemplo.com'))!;
    const hash = sha256(tokenDoEmail());
    const agora = Date.now();
    expect(await repo.consumirToken('redefinir_senha', hash, new Date(agora + 2 * HORA))).toBeNull();
    expect(await repo.consumirToken('redefinir_senha', hash, new Date(agora + 0.5 * HORA))).toBe(u.id);
  });

  it('e-mail malformado responde 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/esqueci-senha', payload: { email: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'E-mail inválido' });
  });
});

describe('código ausente', () => {
  it.each(['/auth/verificar-email', '/auth/redefinir-senha'])(
    '%s sem token ou com token vazio responde 400 em português',
    async (url) => {
      const semToken = await app.inject({ method: 'POST', url, payload: { senha: 'senha-nova-456' } });
      expect(semToken.statusCode).toBe(400);
      expect(semToken.json()).toEqual({ erro: 'Informe o código' });
      const vazio = await app.inject({ method: 'POST', url, payload: { token: '  ', senha: 'senha-nova-456' } });
      expect(vazio.statusCode).toBe(400);
      expect(vazio.json()).toEqual({ erro: 'Informe o código' });
    },
  );
});

describe('POST /auth/redefinir-senha', () => {
  async function pedirRedefinicao() {
    await cadastrar('ana@exemplo.com', 'senha-antiga-1');
    await app.inject({ method: 'POST', url: '/auth/esqueci-senha', payload: { email: 'ana@exemplo.com' } });
    return tokenDoEmail();
  }

  it('troca a senha: a antiga deixa de funcionar e a nova funciona', async () => {
    const token = await pedirRedefinicao();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/redefinir-senha',
      payload: { token, senha: 'senha-nova-456' },
    });
    expect(res.statusCode).toBe(204);
    expect((await entrar('ana@exemplo.com', 'senha-antiga-1')).statusCode).toBe(401);
    expect((await entrar('ana@exemplo.com', 'senha-nova-456')).statusCode).toBe(200);
    const reuso = await app.inject({
      method: 'POST',
      url: '/auth/redefinir-senha',
      payload: { token, senha: 'senha-nova-789' },
    });
    expect(reuso.statusCode).toBe(400);
  });

  it('senha curta responde 400 e não gasta o token', async () => {
    const token = await pedirRedefinicao();
    const curta = await app.inject({
      method: 'POST',
      url: '/auth/redefinir-senha',
      payload: { token, senha: 'curta' },
    });
    expect(curta.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'POST',
      url: '/auth/redefinir-senha',
      payload: { token, senha: 'senha-nova-456' },
    });
    expect(ok.statusCode).toBe(204);
  });

  it('token expirado ou desconhecido responde 400 e não troca a senha', async () => {
    await cadastrar('ana@exemplo.com', 'senha-antiga-1');
    const u = (await repo.acharUsuarioPorEmail('ana@exemplo.com'))!;
    await repo.guardarToken({
      usuarioId: u.id,
      tipo: 'redefinir_senha',
      tokenHash: sha256('velho'),
      expiraEm: new Date(Date.now() - 1000),
    });
    for (const token of ['velho', 'nunca-existiu']) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/redefinir-senha',
        payload: { token, senha: 'senha-nova-456' },
      });
      expect(res.statusCode).toBe(400);
    }
    expect((await entrar('ana@exemplo.com', 'senha-antiga-1')).statusCode).toBe(200);
  });

  it('não altera o e-mail verificado nem o papel do usuário', async () => {
    const token = await pedirRedefinicao();
    await app.inject({ method: 'POST', url: '/auth/redefinir-senha', payload: { token, senha: 'senha-nova-456' } });
    expect(await repo.acharUsuarioPorEmail('ana@exemplo.com')).toMatchObject({
      email: 'ana@exemplo.com',
      papel: 'cliente',
      emailVerificado: false,
    });
  });
});

describe('DELETE /conta', () => {
  it('remove o cliente e as buscas dele ficam com usuarioId nulo', async () => {
    const { usuario, token } = await criarComPapel('cliente');
    await repo.registrarBusca({ usuarioId: usuario.id, termo: 'arroz', resultados: 3, mercadosDistintos: 2 });
    const res = await app.inject({ method: 'DELETE', url: '/conta', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(204);
    expect(await repo.acharUsuario(usuario.id)).toBeNull();
    expect(await repo.listarBuscas()).toEqual([
      { usuarioId: null, termo: 'arroz', resultados: 3, mercadosDistintos: 2 },
    ]);
  });

  it('sem token responde 401 e não apaga nada', async () => {
    const { usuario } = await criarComPapel('cliente');
    const res = await app.inject({ method: 'DELETE', url: '/conta' });
    expect(res.statusCode).toBe(401);
    expect(await repo.acharUsuario(usuario.id)).not.toBeNull();
  });

  it('token inválido responde 401', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/conta', headers: { authorization: 'Bearer lixo' } });
    expect(res.statusCode).toBe(401);
  });

  it.each(['mercado', 'admin'] as const)('papel %s responde 403 e não apaga a conta', async (papel) => {
    const { usuario, token } = await criarComPapel(papel);
    const res = await app.inject({ method: 'DELETE', url: '/conta', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ erro: expect.any(String) });
    expect(await repo.acharUsuario(usuario.id)).not.toBeNull();
  });
});

describe('formato de erro e CORS', () => {
  it('rota inexistente e JSON malformado respondem { erro }', async () => {
    const nada = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(nada.statusCode).toBe(404);
    expect(nada.json()).toEqual({ erro: expect.any(String) });
    const ruim = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{nao e json',
    });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.json()).toEqual({ erro: expect.any(String) });
  });

  it('libera CORS para qualquer origem, inclusive o método DELETE', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/conta',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toContain('DELETE');
  });
});

describe('log de erros', () => {
  it('o log do Fastify fica desligado por padrão e liga com logger: true', async () => {
    expect(app.log.level).not.toBe('info');
    const comLog = await construirApp({ repo, email, jwtSecret: 'segredo-de-teste', logger: true });
    expect(comLog.log.level).toBe('info');
  });

  it('falha ao enviar e-mail em esqueci-senha é registrada no log e a resposta segue 204', async () => {
    await cadastrar();
    const falha = new Error('provedor fora do ar');
    const emailQuebrado = { enviar: vi.fn().mockRejectedValue(falha) };
    const appQuebrado = await construirApp({ repo, email: emailQuebrado, jwtSecret: 'segredo-de-teste' });
    const log = vi.spyOn(appQuebrado.log, 'error');
    const res = await appQuebrado.inject({
      method: 'POST',
      url: '/auth/esqueci-senha',
      payload: { email: 'ana@exemplo.com' },
    });
    expect(res.statusCode).toBe(204);
    expect(emailQuebrado.enviar).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(falha);
  });

  it('erro inesperado é registrado no log e a resposta é um 500 genérico', async () => {
    const falha = new Error('detalhe interno secreto');
    app.get('/quebra', async () => {
      throw falha;
    });
    const log = vi.spyOn(app.log, 'error');
    const res = await app.inject({ method: 'GET', url: '/quebra' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ erro: 'Erro interno do servidor' });
    expect(log).toHaveBeenCalledWith(falha);
  });
});

describe('texto dos e-mails (R31)', () => {
  const NEUTRO = 'Use este código no aplicativo ou no painel do Bolso Certo';

  it('a confirmação de e-mail serve ao aplicativo e ao painel', async () => {
    await cadastrar();
    expect(email.enviados[0]!.texto).toContain(NEUTRO);
    expect(email.enviados[0]!.texto).not.toContain('cole no aplicativo');
  });

  it('a redefinição de senha serve ao aplicativo e ao painel', async () => {
    await criarComPapel('mercado', 'mercado@exemplo.com');
    await app.inject({ method: 'POST', url: '/auth/esqueci-senha', payload: { email: 'mercado@exemplo.com' } });
    expect(email.enviados).toHaveLength(1);
    expect(email.enviados[0]!.texto).toContain(NEUTRO);
    expect(email.enviados[0]!.texto).not.toContain('cole no aplicativo');
  });
});
