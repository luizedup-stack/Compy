import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { pedirAtualizacao, useAtualizacao } from '../atualizar';
import { cores } from '../tema';

/** Botão pequeno do cabeçalho, ao lado do nome do app: atualiza produtos, preços e mercados sem fechar o app. */
export function BotaoAtualizar() {
  const { atualizando } = useAtualizacao();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Atualizar produtos e preços"
      accessibilityState={{ busy: atualizando }}
      disabled={atualizando}
      onPress={() => void pedirAtualizacao()}
      hitSlop={10}
      style={estilos.botao}
    >
      {atualizando ? <ActivityIndicator size="small" color={cores.marca} /> : <Text style={estilos.icone}>↻</Text>}
      <Text style={estilos.texto}>{atualizando ? 'Atualizando' : 'Atualizar'}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  botao: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4 },
  icone: { color: cores.marca, fontSize: 18, fontWeight: '700' },
  texto: { color: cores.marca, fontSize: 13, fontWeight: '600' },
});
