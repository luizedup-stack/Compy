import type { Oferta } from '@mercado/shared';
import { render, screen, userEvent } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

import { CartaoOferta } from './CartaoOferta';

const OFERTA: Oferta = {
  mercadoId: 4,
  mercadoNome: 'Atacarejo Econômico',
  endereco: 'Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP',
  nomeNoMercado: 'Papel Higiênico Fox Folha Dupla',
  preco: 14.7,
  quantidadeTexto: '12 ROLOS',
  precoPorUnidade: 1.23,
  unidade: 'rolo',
  atualizadoEm: '2026-11-03T12:00:00.000Z',
  diasDesdeAtualizacao: 1,
  desatualizado: false,
};

describe('CartaoOferta', () => {
  it('mostra mercado, endereço, preço, quantidade, preço por unidade e idade', async () => {
    await render(<CartaoOferta oferta={OFERTA} />);
    expect(screen.getByText('Atacarejo Econômico')).toBeOnTheScreen();
    expect(screen.getByText('Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP')).toBeOnTheScreen();
    expect(screen.getByText('R$ 14,70')).toBeOnTheScreen();
    expect(screen.getByText('12 ROLOS')).toBeOnTheScreen();
    expect(screen.getByText('R$ 1,23 por rolo')).toBeOnTheScreen();
    expect(screen.getByText('atualizado há 1 dia')).toBeOnTheScreen();
    expect(screen.queryByText('mais barato')).not.toBeOnTheScreen();
    expect(screen.queryByText('Preço antigo')).not.toBeOnTheScreen();
    expect(screen.queryByText('sem quantidade informada')).not.toBeOnTheScreen();
  });

  it('a linha inteira tem um único rótulo falado com mercado, preço, preço por unidade e idade', async () => {
    await render(<CartaoOferta oferta={OFERTA} />);
    expect(
      screen.getByLabelText('Atacarejo Econômico, R$ 14,70, 12 ROLOS, R$ 1,23 por rolo, atualizado há 1 dia'),
    ).toBeOnTheScreen();
  });

  it('sem preço por unidade: mostra o aviso discreto, nenhuma linha de unidade, e o rótulo avisa', async () => {
    await render(
      <CartaoOferta oferta={{ ...OFERTA, quantidadeTexto: null, precoPorUnidade: null, unidade: null }} />,
    );
    expect(screen.getByText('sem quantidade informada')).toBeOnTheScreen();
    expect(screen.queryByText(/ por /)).not.toBeOnTheScreen(); // cartão sozinho: nenhum "por rolo/kg/..."
    expect(
      screen.getByLabelText('Atacarejo Econômico, R$ 14,70, sem quantidade informada, atualizado há 1 dia'),
    ).toBeOnTheScreen();
  });

  it('oferta desatualizada continua legível, com a etiqueta "Preço antigo"', async () => {
    await render(<CartaoOferta oferta={{ ...OFERTA, desatualizado: true, diasDesdeAtualizacao: 45 }} />);
    expect(screen.getByText('Preço antigo')).toBeOnTheScreen();
    expect(screen.getByText('R$ 14,70')).toBeOnTheScreen();
    expect(screen.getByText('atualizado há 45 dias')).toBeOnTheScreen();
    expect(screen.getByLabelText(/preço antigo/)).toBeOnTheScreen();
  });

  it('mostra a etiqueta "mais barato" só quando a propriedade vem ligada', async () => {
    await render(<CartaoOferta oferta={OFERTA} maisBarato />);
    expect(screen.getByText('mais barato')).toBeOnTheScreen();
    expect(screen.getByLabelText(/mais barato/)).toBeOnTheScreen();
  });

  it('tocar na oferta pergunta se quer ir até o mercado e abre o Google Maps ou o Waze', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await render(<CartaoOferta oferta={OFERTA} />);
    expect(screen.getByText('Como chegar')).toBeOnTheScreen();

    await user.press(screen.getByTestId('oferta'));
    expect(alerta).toHaveBeenCalledTimes(1);
    const [titulo, mensagem, botoes] = alerta.mock.calls[0]!;
    expect(titulo).toBe('Ir até o mercado?');
    expect(mensagem).toContain('Atacarejo Econômico');
    expect(mensagem).toContain('Rua Jacarandá, 410');
    botoes![0]!.onPress!();
    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('google.com/maps/dir'));
    botoes![1]!.onPress!();
    expect(Linking.openURL).toHaveBeenLastCalledWith(expect.stringContaining('waze.com/ul'));
  });
});
