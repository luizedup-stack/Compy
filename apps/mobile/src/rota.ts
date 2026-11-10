// "Como chegar": abre o Google Maps ou o Waze com o endereço do mercado. Usa os endereços web dos dois (https), que abrem o
// aplicativo se ele estiver instalado e, se não estiver, o navegador; assim não é preciso saber quais apps a pessoa tem.
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

export interface Destino {
  nome: string;
  endereco: string;
}

/** Nome e endereço juntos: ajuda o mapa a achar o estabelecimento certo, e não só a rua. */
const consulta = (d: Destino): string => `${d.nome}, ${d.endereco}`;

export function urlGoogleMaps(d: Destino): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(consulta(d))}&travelmode=driving`;
}

export function urlWaze(d: Destino): string {
  return `https://waze.com/ul?q=${encodeURIComponent(consulta(d))}&navigate=yes`;
}

export const MSG_NAO_ABRIU = 'Não foi possível abrir o mapa. Confira se o Google Maps ou o Waze está instalado e tente de novo.';

async function abrir(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Não foi possível abrir', MSG_NAO_ABRIU);
  }
}

/** Pergunta se a pessoa quer ir até o mercado e, se quiser, abre o trajeto no Google Maps ou no Waze. */
export function perguntarSeQuerIr(destino: Destino): void {
  Alert.alert('Ir até o estabelecimento?', `${destino.nome}\n${destino.endereco}`, [
    { text: 'Google Maps', onPress: () => void abrir(urlGoogleMaps(destino)) },
    { text: 'Waze', onPress: () => void abrir(urlWaze(destino)) },
    { text: 'Agora não', style: 'cancel' },
  ]);
}
