import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { MSG_ACORDANDO, definirEsperasAcordando } from './api';
import { AVISO_ACORDANDO } from './componentes/AvisoSemConexao';
import { aba, abrirApp, simularApi, type RespostaFalsa } from './teste/ajudas';

// O servidor gratuito dorme sem uso e leva até ~1 minuto para ligar; nesse tempo responde 502/503/504.
// O app espera e repete sozinho (só consultas), avisando com uma faixa, em vez de mostrar erro.

const OFERTA = {
  mercadoId: 1, mercadoNome: 'Mercado Bom Preço', endereco: 'Rua A, 10', nomeNoMercado: 'Leite', preco: 5.99, quantidadeTexto: '1 L',
  precoPorUnidade: 5.99, unidade: 'L', atualizadoEm: '2026-11-06T10:00:00.000Z', diasDesdeAtualizacao: 1, desatualizado: false,
};
const LEITE = { codigoBarras: '7891000100103', nome: 'Leite Integral Piracanjuba 1L', ofertas: [OFERTA], foto: null };
const ACORDANDO: RespostaFalsa = { status: 503, corpo: { erro: 'O servidor está acordando. Tente de novo em alguns instantes.' } };

beforeEach(() => definirEsperasAcordando([15, 15, 15, 15]));
afterEach(() => definirEsperasAcordando([4000, 6000, 8000, 10000, 12000, 15000]));

describe('servidor acordando', () => {
  it('a lista inicial espera o servidor acordar, avisa com a faixa e mostra os produtos sem erro', async () => {
    let chamadas = 0;
    simularApi({
      'GET /produtos': () => (++chamadas <= 2 ? ACORDANDO : { status: 200, corpo: { grupos: [LEITE], total: 1 } }),
    });
    await abrirApp();

    expect(await screen.findByText(LEITE.nome, {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(chamadas).toBe(3); // duas respostas "acordando" e a terceira, boa
    expect(screen.queryByText(/Algo deu errado|acordando\. Isso/)).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('aviso-acordando')).not.toBeOnTheScreen()); // a faixa some quando acorda
  });

  it('enquanto espera, mostra a faixa "Acordando o servidor…"', async () => {
    definirEsperasAcordando([300, 300, 300]);
    let chamadas = 0;
    simularApi({ 'GET /produtos': () => (++chamadas <= 2 ? ACORDANDO : { status: 200, corpo: { grupos: [LEITE], total: 1 } }) });
    await abrirApp();

    expect(await screen.findByText(AVISO_ACORDANDO)).toBeOnTheScreen();
    expect(await screen.findByText(LEITE.nome, {}, { timeout: 4000 })).toBeOnTheScreen();
  });

  it('502 com página HTML (o servidor ainda ligando) também espera e repete', async () => {
    let chamadas = 0;
    simularApi({
      'GET /mercados': () => {
        if (++chamadas === 1) return { status: 502, corpo: undefined }; // sem JSON: a resposta não tem corpo legível
        return { status: 200, corpo: [{ id: 1, nome: 'Mercado Bom Preço', endereco: 'Rua A, 10', totalProdutos: 3 }] };
      },
    });
    const user = userEvent.setup();
    await abrirApp();
    await user.press(aba('Mercados'));
    expect(await screen.findByText('Mercado Bom Preço', {}, { timeout: 4000 })).toBeOnTheScreen();
  });

  it('se o servidor não acorda a tempo, mostra a mensagem de "acordando" (não "Algo deu errado") e dá para tentar de novo', async () => {
    simularApi({ 'GET /busca': ACORDANDO });
    const user = userEvent.setup();
    await abrirApp();
    await user.type(screen.getByLabelText('Buscar produto'), 'leite');

    expect(await screen.findByText('O servidor está acordando. Tente de novo em alguns instantes.', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
    expect(screen.queryByText(/Algo deu errado/)).toBeNull();
  });

  it('502 sem mensagem do servidor vira o texto de "acordando" do app', async () => {
    simularApi({ 'GET /busca': { status: 502 } });
    const user = userEvent.setup();
    await abrirApp();
    await user.type(screen.getByLabelText('Buscar produto'), 'leite');
    expect(await screen.findByText(MSG_ACORDANDO, {}, { timeout: 4000 })).toBeOnTheScreen();
  });

  it('envio (login) NÃO é repetido sozinho: mostra o aviso uma vez e a pessoa tenta de novo', async () => {
    const api = simularApi({ 'POST /auth/login': { status: 503 } });
    const user = userEvent.setup();
    await abrirApp('Entrar');
    await user.type(await screen.findByLabelText('E-mail'), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Senha'), '12345678');
    await user.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(MSG_ACORDANDO)).toBeOnTheScreen();
    expect(api.chamadas.filter((c) => c.caminho === '/auth/login')).toHaveLength(1);
  });

  it('sem rede (e não só servidor ligando) não espera: cai na hora na cópia salva, como antes', async () => {
    const api = simularApi({}, { semPadroes: true }); // toda rota falha como falta de rede
    await abrirApp();
    await waitFor(() => expect(api.chamadas.length).toBeGreaterThan(0));
    // Uma única tentativa por consulta: nada de esperar até 1 minuto quando não há rede.
    expect(api.chamadas.filter((c) => c.caminho === '/produtos')).toHaveLength(1);
  });
});
