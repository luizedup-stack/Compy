import {
  MSG_ACORDANDO,
  ErroApi,
  URL_API,
  buscar,
  cadastrar,
  definirAoExpirar,
  definirToken,
  entrar,
  excluirConta,
  atualizarPerfil,
  obterPerfil,
  pedirAutenticado,
  trocarSenha,
} from './api';
import { simularApi } from './teste/ajudas';

afterEach(() => {
  definirToken(null);
  definirAoExpirar(null);
});

describe('api', () => {
  it('usa localhost:3000 quando EXPO_PUBLIC_API_URL não está definida', () => {
    // Hermético: apaga a variável do ambiente e recarrega o módulo, qualquer que seja o shell de quem roda o teste.
    const anterior = process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_URL;
    try {
      jest.isolateModules(() => {
        const { URL_API: padrao } = jest.requireActual<typeof import('./api')>('./api');
        expect(padrao).toBe('http://localhost:3000');
      });
    } finally {
      if (anterior !== undefined) process.env.EXPO_PUBLIC_API_URL = anterior;
    }
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
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    })) as unknown as typeof fetch;
    await expect(entrar('a@b.com', 'x')).rejects.toMatchObject({ status: 500, message: 'Algo deu errado. Tente novamente.' });
  });

  it('502, 503 e 504 sem JSON (servidor ainda ligando) usam a mensagem de "acordando"', async () => {
    for (const status of [502, 503, 504]) {
      globalThis.fetch = jest.fn(async () => ({
        ok: false,
        status,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      })) as unknown as typeof fetch;
      await expect(entrar('a@b.com', 'x')).rejects.toMatchObject({ status, message: MSG_ACORDANDO });
    }
  });

  it('pedirAutenticado manda o Bearer, o JSON e aceita 204 sem corpo', async () => {
    const api = simularApi({ 'POST /conta/senha': { status: 204 } });
    definirToken('tok-9');
    await expect(trocarSenha('senha-atual-1', 'senha-nova-22')).resolves.toBeUndefined();
    expect(api.chamadas[0]).toMatchObject({ metodo: 'POST', autorizacao: 'Bearer tok-9', corpo: { senhaAtual: 'senha-atual-1', senhaNova: 'senha-nova-22' } });
  });

  it('pedirAutenticado devolve o JSON das respostas 200', async () => {
    simularApi({ 'GET /algo': { status: 200, corpo: { ok: 1 } } });
    definirToken('tok-9');
    await expect(pedirAutenticado<{ ok: number }>('/algo')).resolves.toEqual({ ok: 1 });
  });

  it('obterPerfil usa GET /conta e atualizarPerfil usa PATCH /conta só com os campos enviados', async () => {
    const perfil = { id: 3, email: 'ana@exemplo.com', nome: 'Ana', foto: null };
    const api = simularApi({ 'GET /conta': { status: 200, corpo: perfil }, 'PATCH /conta': { status: 200, corpo: { ...perfil, nome: 'Ana Maria' } } });
    definirToken('tok-9');
    await expect(obterPerfil()).resolves.toEqual(perfil);
    await expect(atualizarPerfil({ nome: 'Ana Maria' })).resolves.toMatchObject({ nome: 'Ana Maria' });
    expect(api.chamadas[1]).toMatchObject({ metodo: 'PATCH', corpo: { nome: 'Ana Maria' }, autorizacao: 'Bearer tok-9' });
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

  it('buscar chama GET /busca com q codificado, a ordem e o Bearer', async () => {
    const api = simularApi({ 'GET /busca': { status: 200, corpo: [] } });
    definirToken('tok-9');
    await expect(buscar('papel higiênico & cia', 'embalagem')).resolves.toEqual([]);
    expect(api.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = api.fetch.mock.calls[0];
    expect(url).toBe(`${URL_API}/busca?q=papel%20higi%C3%AAnico%20%26%20cia&ordem=embalagem`);
    expect(init?.method).toBe('GET');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok-9' });
  });

  it('buscar devolve os grupos como vieram da API, na mesma ordem', async () => {
    const grupos = [
      { codigoBarras: '2', nome: 'B', ofertas: [] },
      { codigoBarras: '1', nome: 'A', ofertas: [] },
    ];
    simularApi({ 'GET /busca': { status: 200, corpo: grupos } });
    definirToken('tok-9');
    await expect(buscar('arroz', 'unidade')).resolves.toEqual(grupos);
  });

  it('buscar repassa o erro da API (e o 401 chama o callback de expiração)', async () => {
    const aoExpirar = jest.fn();
    definirAoExpirar(aoExpirar);
    simularApi({ 'GET /busca': { status: 401, corpo: { erro: 'Não autenticado' } } });
    definirToken('tok-9');
    await expect(buscar('arroz', 'unidade')).rejects.toMatchObject({ status: 401, message: 'Não autenticado' });
    expect(aoExpirar).toHaveBeenCalledTimes(1);
  });
});
