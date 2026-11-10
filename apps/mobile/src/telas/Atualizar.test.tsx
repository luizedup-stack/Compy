import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import { aba, abrirApp, simularApi } from '../teste/ajudas';
import { MERCADOS } from '../teste/mercados';

// Botão "Atualizar" do topo: refaz a consulta da tela e renova a cópia dos produtos, sem fechar o app.
describe('botão Atualizar', () => {
  it('aparece perto do nome do app e, ao tocar, a aba Mercados consulta o servidor de novo', async () => {
    const api = simularApi({ 'GET /mercados': { status: 200, corpo: MERCADOS } });
    const user = userEvent.setup();
    await abrirApp();
    await user.press(aba('Estabelecimentos'));
    expect(await screen.findByText('Atacarejo Econômico')).toBeOnTheScreen();
    const antes = api.chamadas.filter((c) => c.caminho === '/mercados').length;

    await user.press(screen.getByLabelText('Atualizar produtos e preços'));

    await waitFor(() => expect(api.chamadas.filter((c) => c.caminho === '/mercados').length).toBe(antes + 1));
    // terminou: o botão volta ao normal (não fica "Atualizando" para sempre)
    await waitFor(() => expect(screen.getByText('Atualizar')).toBeOnTheScreen());
    await act(async () => undefined);
  });
});
