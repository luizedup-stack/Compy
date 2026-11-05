import {
  ErroApi,
  URL_API,
  cadastrar,
  definirAoExpirar,
  definirToken,
  entrar,
  excluirConta,
  pedirAutenticado,
  reenviarVerificacao,
} from './api';
import { simularApi } from './teste/ajudas';

afterEach(() => {
  definirToken(null);
  definirAoExpirar(null);
});

describe('api', () => {
  it('usa localhost:3000 quando EXPO_PUBLIC_API_URL não está definida', () => {
    expect(URL_API).toBe('http://localhost:3000');
  });

  it('entrar devolve token, papel e emailVerificado', async () => {
    simularApi({ 'POST /auth/login': { status: 200, corpo: { token: 't', papel: 'cliente', emailVerificado: false } } });
    await expect(entrar('a@b.com', 'x')).resolves.toEqual({ token: 't', papel: 'cliente', emailVerificado: false });
  });

  it('lança ErroApi com a mensagem { erro } e o status', async () => {
    simularApi({ 'POST /auth/login': { status: 401, corpo: { erro: 'E-mail ou senha incorretos' } } });
    const erro = await entrar('a@b.com', 'x').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 401, message: 'E-mail ou senha incorretos' });
  });

  it('cadastrar traduz o 409 para a mensagem do app', async () => {
    simularApi({ 'POST /auth/cadastro': { status: 409, corpo: { erro: 'E-mail já cadastrado' } } });
    await expect(cadastrar('a@b.com', '12345678')).rejects.toMatchObject({
      status: 409,
      message: 'Esse e-mail já está cadastrado',
    });
  });

  it('falha de rede vira ErroApi de status 0', async () => {
    simularApi({});
    await expect(entrar('a@b.com', 'x')).rejects.toMatchObject({
      status: 0,
      message: 'Não foi possível falar com o servidor',
    });
  });

  it('resposta de erro sem JSON usa uma mensagem genérica', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    })) as unknown as typeof fetch;
    await expect(entrar('a@b.com', 'x')).rejects.toMatchObject({ status: 502, message: 'Algo deu errado. Tente novamente.' });
  });

  it('pedirAutenticado manda o Bearer, o JSON e aceita 204 sem corpo', async () => {
    const api = simularApi({ 'POST /auth/reenviar-verificacao': { status: 204 } });
    definirToken('tok-9');
    await expect(reenviarVerificacao()).resolves.toBeUndefined();
    expect(api.chamadas[0]).toMatchObject({ metodo: 'POST', autorizacao: 'Bearer tok-9' });
  });

  it('pedirAutenticado devolve o JSON das respostas 200', async () => {
    simularApi({ 'GET /algo': { status: 200, corpo: { ok: 1 } } });
    definirToken('tok-9');
    await expect(pedirAutenticado<{ ok: number }>('/algo')).resolves.toEqual({ ok: 1 });
  });

  it('excluirConta usa DELETE /conta com o token', async () => {
    const api = simularApi({ 'DELETE /conta': { status: 204 } });
    definirToken('tok-9');
    await excluirConta();
    expect(api.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: '/conta', autorizacao: 'Bearer tok-9' });
  });

  it('um 401 autenticado chama o callback de expiração; um 401 de login não', async () => {
    const aoExpirar = jest.fn();
    definirAoExpirar(aoExpirar);
    simularApi({
      'POST /auth/login': { status: 401, corpo: { erro: 'E-mail ou senha incorretos' } },
      'GET /algo': { status: 401, corpo: { erro: 'Não autenticado' } },
    });
    await entrar('a@b.com', 'x').catch(() => undefined);
    expect(aoExpirar).not.toHaveBeenCalled();

    definirToken('tok-9');
    await expect(pedirAutenticado('/algo')).rejects.toMatchObject({ status: 401 });
    expect(aoExpirar).toHaveBeenCalledTimes(1);
  });
});
