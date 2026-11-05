import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { cores } from '../tema';

interface Props {
  titulo: string;
  aoPressionar: () => void;
  desabilitado?: boolean;
  ocupado?: boolean;
  /** "primario" é o botão verde cheio; "secundario" é o contornado. */
  tipo?: 'primario' | 'secundario';
}

export function Botao({ titulo, aoPressionar, desabilitado = false, ocupado = false, tipo = 'primario' }: Props) {
  const inativo = desabilitado || ocupado;
  const primario = tipo === 'primario';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: inativo, busy: ocupado }}
      disabled={inativo}
      onPress={aoPressionar}
      style={[
        estilos.botao,
        primario ? estilos.primario : estilos.secundario,
        desabilitado ? estilos.desabilitado : null,
      ]}
    >
      {ocupado ? (
        <ActivityIndicator color={primario ? cores.fundo : cores.marca} />
      ) : (
        <Text style={[estilos.texto, primario ? null : estilos.textoSecundario]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  botao: { minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primario: { backgroundColor: cores.marca },
  secundario: { borderWidth: 1, borderColor: cores.marca, backgroundColor: cores.fundo },
  desabilitado: { backgroundColor: cores.desabilitado, borderColor: cores.desabilitado },
  texto: { color: cores.fundo, fontSize: 16, fontWeight: '700' },
  textoSecundario: { color: cores.marca },
});
