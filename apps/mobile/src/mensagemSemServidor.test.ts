// A mensagem de "sem servidor" explica o motivo quando o app aponta para um endereço de rede local
// (que não é alcançável de longe), e continua simples nos demais casos.
import { MSG_SEM_SERVIDOR, definirUrlApi, mensagemSemServidor, cadastrar } from './api';
import { simularApi } from './teste/ajudas';

afterEach(() => definirUrlApi(null));

describe('mensagemSemServidor', () => {
  it.each(['http://192.168.0.10:3000', 'http://10.0.0.5:3000', 'http://172.16.16.114:3000', 'http://172.31.1.1:3000/api'])(
    'endereço de rede local %s: explica que só funciona perto do computador',
    (url) => {
      definirUrlApi(url);
      const msg = mensagemSemServidor();
      expect(msg.startsWith(MSG_SEM_SERVIDOR)).toBe(true);
      expect(msg).toContain('rede local');
      expect(msg).toContain(url);
      expect(msg).toContain('Configurar servidor');
    },
  );

  it.each(['http://localhost:3000', 'https://api.bolsocerto.com.br', 'http://172.32.0.1:3000', 'http://8.8.8.8:3000'])(
    'endereço %s: só a mensagem simples',
    (url) => {
      definirUrlApi(url);
      expect(mensagemSemServidor()).toBe(MSG_SEM_SERVIDOR);
    },
  );

  it('uma chamada que falha por falta de conexão leva a explicação para a tela', async () => {
    definirUrlApi('http://192.168.1.20:3000');
    simularApi({}); // qualquer rota falha como se não houvesse rede
    await expect(cadastrar('ana@exemplo.com', 'senha-boa-123')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('rede local'),
    });
  });
});
