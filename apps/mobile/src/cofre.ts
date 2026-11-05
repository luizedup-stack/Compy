import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Guarda pequenos textos no aparelho. No celular usa o cofre seguro (expo-secure-store).
 * No navegador (versão web, usada só para testar no computador) o cofre não existe: usa o localStorage.
 */
const naWeb = (): boolean => Platform.OS === 'web';

export async function lerDoCofre(chave: string): Promise<string | null> {
  if (naWeb()) return globalThis.localStorage?.getItem(chave) ?? null;
  return SecureStore.getItemAsync(chave);
}

export async function guardarNoCofre(chave: string, valor: string): Promise<void> {
  if (naWeb()) {
    globalThis.localStorage?.setItem(chave, valor);
    return;
  }
  await SecureStore.setItemAsync(chave, valor);
}

export async function apagarDoCofre(chave: string): Promise<void> {
  if (naWeb()) {
    globalThis.localStorage?.removeItem(chave);
    return;
  }
  await SecureStore.deleteItemAsync(chave);
}
