import { StyleSheet, Text, View } from 'react-native';

// Marcador da Tarefa 15: esta tela será substituída pela busca de produtos.
export function Busca() {
  return (
    <View style={estilos.tela}>
      <Text style={estilos.texto}>Buscar</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  texto: { fontSize: 18 },
});
