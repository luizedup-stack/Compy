import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { cores } from '../tema';
import { chaveDeCampo } from '../validacao';

interface Props extends Omit<TextInputProps, 'style'> {
  rotulo: string;
  erro?: string | null;
}

/** Rótulo visível + campo de texto; o rótulo também vai como accessibilityLabel do campo. */
export function Campo({ rotulo, erro, ...resto }: Props) {
  const id = chaveDeCampo(rotulo);
  return (
    <View style={estilos.grupo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        {...resto}
        nativeID={id}
        testID={id}
        accessibilityLabel={rotulo}
        placeholderTextColor={cores.desabilitado}
        style={[estilos.campo, erro ? estilos.campoComErro : null]}
      />
      {erro ? (
        <Text style={estilos.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erro}
        </Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: 6 },
  rotulo: { fontSize: 14, fontWeight: '600', color: cores.texto },
  campo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: cores.texto,
    backgroundColor: cores.fundo,
  },
  campoComErro: { borderColor: cores.erro },
  erro: { color: cores.erro, fontSize: 14 },
});
