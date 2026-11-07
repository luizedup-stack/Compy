import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

import { MSG_NAO_ABRIU, perguntarSeQuerIr, urlGoogleMaps, urlWaze } from './rota';

const MERCADO = { nome: 'Atacarejo Econômico', endereco: 'Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP' };
const DESTINO = encodeURIComponent('Atacarejo Econômico, Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP');

describe('endereços de mapa', () => {
  it('Google Maps: trajeto até o nome e o endereço do mercado, de carro', () => {
    expect(urlGoogleMaps(MERCADO)).toBe(`https://www.google.com/maps/dir/?api=1&destination=${DESTINO}&travelmode=driving`);
  });

  it('Waze: navegar até o nome e o endereço do mercado', () => {
    expect(urlWaze(MERCADO)).toBe(`https://waze.com/ul?q=${DESTINO}&navigate=yes`);
  });

  it('codifica caracteres que quebrariam o endereço (&, #, espaços, acentos)', () => {
    const url = urlGoogleMaps({ nome: 'Mercado A&B #1', endereco: 'Rua São João, 5' });
    expect(url).not.toMatch(/ |#1/);
    expect(url).toContain('Mercado%20A%26B%20%231');
    expect(new URL(url).searchParams.get('destination')).toBe('Mercado A&B #1, Rua São João, 5');
  });
});

describe('perguntarSeQuerIr', () => {
  const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const abrir = Linking.openURL as jest.Mock;
  const botoes = () => alerta.mock.calls[0]![2]!;

  it('pergunta com o nome e o endereço e oferece Google Maps, Waze e "Agora não"', () => {
    perguntarSeQuerIr(MERCADO);
    expect(alerta).toHaveBeenCalledTimes(1);
    expect(alerta.mock.calls[0]![0]).toBe('Ir até o mercado?');
    expect(alerta.mock.calls[0]![1]).toBe(`${MERCADO.nome}\n${MERCADO.endereco}`);
    expect(botoes().map((b) => b.text)).toEqual(['Google Maps', 'Waze', 'Agora não']);
    expect(botoes()[2]!.style).toBe('cancel');
    expect(abrir).not.toHaveBeenCalled(); // só pergunta: nada abre sozinho
  });

  it('"Google Maps" abre o trajeto no Google Maps', () => {
    perguntarSeQuerIr(MERCADO);
    botoes()[0]!.onPress!();
    expect(abrir).toHaveBeenCalledWith(urlGoogleMaps(MERCADO));
  });

  it('"Waze" abre o trajeto no Waze', () => {
    perguntarSeQuerIr(MERCADO);
    botoes()[1]!.onPress!();
    expect(abrir).toHaveBeenCalledWith(urlWaze(MERCADO));
  });

  it('se o link não abre, avisa em vez de falhar em silêncio', async () => {
    abrir.mockRejectedValueOnce(new Error('sem app'));
    perguntarSeQuerIr(MERCADO);
    botoes()[0]!.onPress!();
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(alerta).toHaveBeenLastCalledWith('Não foi possível abrir', MSG_NAO_ABRIU);
  });
});
