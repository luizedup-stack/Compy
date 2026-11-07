import * as SecureStore from 'expo-secure-store';

import { definirUrlApi, urlApi, URL_API } from './api';
import { CHAVE_SERVIDOR, carregarServidor, normalizarServidor, salvarServidor } from './servidor';

const cofre = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(() => {
  definirUrlApi(null);
});

describe('normalizarServidor', () => {
  it.each([
    ['http://192.168.0.10:3000', 'http://192.168.0.10:3000'],
    ['  http://192.168.0.10:3000/  ', 'http://192.168.0.10:3000'],
    ['192.168.0.10:3000', 'http://192.168.0.10:3000'],
    ['https://meu-servidor.com', 'https://meu-servidor.com'],
    // Sem "http(s)://": nome de site na internet é https; rede local, localhost e endereço com porta continuam http.
    ['bolso-certo.onrender.com', 'https://bolso-certo.onrender.com'],
    ['  Bolso-Certo.onrender.com/  ', 'https://Bolso-Certo.onrender.com'],
    ['localhost:3000', 'http://localhost:3000'],
    ['localhost', 'http://localhost'],
    ['meu-pc.local', 'http://meu-pc.local'],
    ['meu-pc.local:3000', 'http://meu-pc.local:3000'],
    ['bolso.onrender.com:8443', 'http://bolso.onrender.com:8443'],
    ['HTTPS://Meu-Servidor.com/api//', 'HTTPS://Meu-Servidor.com/api'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarServidor(entrada)).toBe(esperado);
  });

  it.each(['', '   ', 'http://', 'meu servidor', 'ftp://x.com', 'http://a b.com'])('rejeita %p', (entrada) => {
    expect(normalizarServidor(entrada)).toBeNull();
  });
});

describe('salvarServidor / carregarServidor', () => {
  it('salva um endereço válido no cofre e passa a usá-lo', async () => {
    expect(await salvarServidor('192.168.0.10:3000')).toBe(true);
    expect(urlApi()).toBe('http://192.168.0.10:3000');
    expect(cofre.setItemAsync).toHaveBeenCalledWith(CHAVE_SERVIDOR, 'http://192.168.0.10:3000');
  });

  it('endereço inválido não muda nada', async () => {
    expect(await salvarServidor('isso não é endereço')).toBe(false);
    expect(urlApi()).toBe(URL_API);
    expect(cofre.setItemAsync).not.toHaveBeenCalled();
  });

  it('texto vazio volta ao endereço de fábrica e apaga o guardado', async () => {
    await salvarServidor('http://10.0.0.5:3000');
    expect(await salvarServidor('  ')).toBe(true);
    expect(urlApi()).toBe(URL_API);
    expect(cofre.deleteItemAsync).toHaveBeenCalledWith(CHAVE_SERVIDOR);
  });

  it('ao abrir o app usa o endereço guardado', async () => {
    await SecureStore.setItemAsync(CHAVE_SERVIDOR, 'http://10.0.0.5:3000');
    jest.clearAllMocks();
    await carregarServidor();
    expect(urlApi()).toBe('http://10.0.0.5:3000');
  });

  it('endereço guardado estragado é ignorado, e falha do cofre não derruba o app', async () => {
    await SecureStore.setItemAsync(CHAVE_SERVIDOR, 'lixo lixo');
    await carregarServidor();
    expect(urlApi()).toBe(URL_API);

    cofre.getItemAsync.mockRejectedValue(new Error('cofre indisponível'));
    await expect(carregarServidor()).resolves.toBeUndefined();
    expect(urlApi()).toBe(URL_API);
  });
});
