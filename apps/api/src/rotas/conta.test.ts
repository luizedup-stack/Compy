// Testes do perfil do cliente (tela "Conta" do app): nome de usuário, foto, e-mail e senha.
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../app';
import { criarEmailMemoria } from '../email';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { LIMITE_FOTO } from './conta';
import { comToken } from './apoioTeste';

const SENHA = 'senha-boa-123';
// Uma imagem minúscula válida (1x1 pixel PNG) no formato que o app envia.
const FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let app: FastifyInstance;
let repo: ReturnType<typeof criarRepositorioMemoria>;

beforeEach(async () => {
  repo = criarRepositorioMemoria();
  app = await construirApp({ repo, email: criarEmailMemoria(), jwtSecret: 'segredo-de-teste' });
});

const chamar = (metodo: 'GET' | 'PATCH' | 'POST', url: string, token: string | null, corpo?: unknown) =>
  app.inject({ method: metodo, url, payload: corpo as object | undefined, headers: token ? comToken(token) : {} });

async function criarCliente(email = 'ana@exemplo.com') {
  await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { email, senha: SENHA } });
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, senha: SENHA } });
  return (login.json() as { token: string }).token;
}

describe('GET /conta', () => {
  it('devolve o perfil (sem a senha); conta nova não tem nome nem foto', async () => {
    const token = await criarCliente();
    const res = await chamar('GET', '/conta', token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: expect.any(Number), email: 'ana@exemplo.com', nome: null, foto: null });
  });

  it('exige login de cliente', async () => {
    expect((await chamar('GET', '/conta', null)).statusCode).toBe(401);
    const admin = await repo.criarUsuario({ email: 'a@a.com', senhaHash: 'x', papel: 'admin', emailVerificado: true });
    const tokenAdmin = app.jwt.sign({ id: admin.id, papel: admin.papel, inst: app.instancia });
    expect((await chamar('GET', '/conta', tokenAdmin)).statusCode).toBe(403);
  });
});

describe('PATCH /conta', () => {
  it('altera nome, foto e e-mail; devolve o perfil novo; o login passa a ser pelo e-mail novo', async () => {
    const token = await criarCliente();
    const res = await chamar('PATCH', '/conta', token, { nome: '  Ana Carolina ', foto: FOTO, email: 'Ana.Nova@Exemplo.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: 'ana.nova@exemplo.com', nome: 'Ana Carolina', foto: FOTO });
    expect((await chamar('GET', '/conta', token)).json()).toMatchObject({ nome: 'Ana Carolina', foto: FOTO });
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana.nova@exemplo.com', senha: SENHA } });
    expect(login.statusCode).toBe(200);
  });

  it('só os campos enviados mudam', async () => {
    const token = await criarCliente();
    await chamar('PATCH', '/conta', token, { nome: 'Ana', foto: FOTO });
    const res = await chamar('PATCH', '/conta', token, { nome: 'Ana Maria' });
    expect(res.json()).toMatchObject({ nome: 'Ana Maria', foto: FOTO, email: 'ana@exemplo.com' });
  });

  it('nome vazio ou null apaga o nome; foto null remove a foto', async () => {
    const token = await criarCliente();
    await chamar('PATCH', '/conta', token, { nome: 'Ana', foto: FOTO });
    expect((await chamar('PATCH', '/conta', token, { nome: '   ' })).json()).toMatchObject({ nome: null, foto: FOTO });
    expect((await chamar('PATCH', '/conta', token, { foto: null })).json()).toMatchObject({ nome: null, foto: null });
  });

  it.each([
    [{ nome: 'A' }, 'O nome deve ter de 2 a 50 caracteres'],
    [{ nome: 'x'.repeat(51) }, 'O nome deve ter de 2 a 50 caracteres'],
    [{ nome: 5 }, 'O nome deve ter de 2 a 50 caracteres'],
    [{ foto: 'http://exemplo.com/foto.png' }, 'Foto inválida (use uma imagem JPEG, PNG ou WebP pequena)'],
    [{ foto: 'data:text/html;base64,PGgxPg==' }, 'Foto inválida (use uma imagem JPEG, PNG ou WebP pequena)'],
    [{ foto: 'data:image/png;base64,não é base64!' }, 'Foto inválida (use uma imagem JPEG, PNG ou WebP pequena)'],
    [{ foto: 5 }, 'Foto inválida (use uma imagem JPEG, PNG ou WebP pequena)'],
    [{ email: 'sem-arroba' }, 'E-mail inválido'],
    [{ senha: 'x' }, 'Campo não pode ser alterado: senha'],
    [{ papel: 'admin' }, 'Campo não pode ser alterado: papel'],
    [{}, 'Nada para alterar'],
  ])('recusa %j', async (corpo, mensagem) => {
    const token = await criarCliente();
    const res = await chamar('PATCH', '/conta', token, corpo);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: mensagem });
  });

  it('foto grande demais é recusada', async () => {
    const token = await criarCliente();
    const grande = `data:image/jpeg;base64,${'A'.repeat(LIMITE_FOTO)}`;
    const res = await chamar('PATCH', '/conta', token, { foto: grande });
    expect(res.statusCode).toBe(400);
  });

  it('e-mail de outra conta: 409 e nada muda; o próprio e-mail é aceito', async () => {
    const token = await criarCliente('ana@exemplo.com');
    await criarCliente('bia@exemplo.com');
    const conflito = await chamar('PATCH', '/conta', token, { nome: 'Ana', email: 'BIA@exemplo.com' });
    expect(conflito.statusCode).toBe(409);
    expect(conflito.json()).toEqual({ erro: 'E-mail já cadastrado' });
    expect((await chamar('GET', '/conta', token)).json()).toMatchObject({ nome: null, email: 'ana@exemplo.com' });
    expect((await chamar('PATCH', '/conta', token, { email: 'ana@exemplo.com' })).statusCode).toBe(200);
  });

  it('cada pessoa só altera o próprio perfil', async () => {
    const a = await criarCliente('ana@exemplo.com');
    const b = await criarCliente('bia@exemplo.com');
    await chamar('PATCH', '/conta', a, { nome: 'Ana' });
    expect((await chamar('GET', '/conta', b)).json()).toMatchObject({ nome: null });
  });
});

describe('POST /conta/senha', () => {
  it('troca a senha: a antiga deixa de valer e a nova funciona', async () => {
    const token = await criarCliente();
    const res = await chamar('POST', '/conta/senha', token, { senhaAtual: SENHA, senhaNova: 'outra-senha-456' });
    expect(res.statusCode).toBe(204);
    const antiga = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana@exemplo.com', senha: SENHA } });
    const nova = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana@exemplo.com', senha: 'outra-senha-456' } });
    expect(antiga.statusCode).toBe(401);
    expect(nova.statusCode).toBe(200);
  });

  it('senha atual errada: 400 (não 401, para o app não sair da conta) e nada muda', async () => {
    const token = await criarCliente();
    const res = await chamar('POST', '/conta/senha', token, { senhaAtual: 'errada-123', senhaNova: 'outra-senha-456' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Senha atual incorreta' });
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ana@exemplo.com', senha: SENHA } });
    expect(login.statusCode).toBe(200);
  });

  it.each([
    [{ senhaNova: 'outra-senha-456' }, 'Informe a senha atual'],
    [{ senhaAtual: SENHA, senhaNova: 'curta' }, 'A senha deve ter pelo menos 8 caracteres'],
    [{ senhaAtual: SENHA }, 'A senha deve ter pelo menos 8 caracteres'],
  ])('recusa %j', async (corpo, mensagem) => {
    const token = await criarCliente();
    const res = await chamar('POST', '/conta/senha', token, corpo);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: mensagem });
  });
});
