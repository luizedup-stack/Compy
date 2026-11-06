import { act, fireEvent, screen } from '@testing-library/react-native';

import { guardarCatalogoLocal } from '../catalogo';
import { abrirApp, aba, guardarSessao, simularApi } from '../teste/ajudas';
import { catalogoDeTeste } from '../teste/catalogo';

// O app sem internet: com a cópia dos produtos guardada no celular, as telas funcionam do mesmo jeito.
beforeEach(() => {
  jest.useFakeTimers();
  guardarSessao('tok-offline', true);
});

afterEach(() => {
  jest.useRealTimers();
});

async function avancar(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('app sem internet', () => {
  it('busca produtos na cópia guardada e mostra o aviso de que está sem conexão', async () => {
    await guardarCatalogoLocal(catalogoDeTeste(), new Date(2026, 10, 5, 15, 40).getTime());
    simularApi({}); // servidor fora do ar
    await abrirApp();

    await fireEvent.changeText(screen.getByLabelText('Buscar produto'), 'papel higienico');
    await avancar(400);

    expect(await screen.findByText(/Papel Hig/)).toBeOnTheScreen();
    expect(screen.getAllByTestId('oferta')).toHaveLength(2);
    expect(screen.getByText(/Sem conexão com o servidor\. Mostrando os dados salvos no celular \(05\/11 15:40\)\./)).toBeOnTheScreen();
  });

  it('a tela inicial já mostra a lista de produtos comparados, vinda da cópia guardada', async () => {
    await guardarCatalogoLocal(catalogoDeTeste(), new Date(2026, 10, 5, 15, 40).getTime());
    simularApi({}, { semPadroes: true }); // sem nenhuma rota: sem conexão
    await abrirApp();

    // O produto vendido nos 2 mercados (papel higiênico) vem primeiro, com o mais barato em destaque.
    expect(await screen.findByText(/Papel Hig/)).toBeOnTheScreen();
    expect(screen.getAllByTestId('oferta').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('mais barato')).toBeOnTheScreen();
    expect(screen.getByText('Leite Integral 1 L')).toBeOnTheScreen();
    expect(screen.getByText(/Sem conexão com o servidor/)).toBeOnTheScreen();
  });

  it('lista os mercados e abre os produtos de um deles, tudo da cópia guardada', async () => {
    await guardarCatalogoLocal(catalogoDeTeste());
    simularApi({});
    await abrirApp();

    await fireEvent.press(aba('Mercados'));
    expect(await screen.findByText('Atacarejo Econômico')).toBeOnTheScreen();
    expect(screen.getByText('2 produtos')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Atacarejo Econômico'));
    expect(await screen.findByText('Leite Integral 1 L')).toBeOnTheScreen();
    expect(screen.getByText(/Sem conexão com o servidor/)).toBeOnTheScreen();
  });

  it('sem internet e sem nenhuma cópia guardada, mostra o erro de sempre', async () => {
    simularApi({});
    await abrirApp();
    await fireEvent.press(aba('Mercados'));
    expect(await screen.findByText('Não foi possível falar com o servidor')).toBeOnTheScreen();
    expect(screen.queryByText(/Mostrando os dados salvos/)).not.toBeOnTheScreen();
  });
});
