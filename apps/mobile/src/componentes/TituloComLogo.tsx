import { Image, StyleSheet, Text, View } from 'react-native';

/**
 * Título do cabeçalho: a logo do app (o bolso com o "visto" e a moeda) ao lado do nome. O fundo da imagem tem o mesmo azul do
 * cabeçalho, por isso ela se mistura com a barra.
 */
export function TituloComLogo() {
  return (
    <View style={estilos.linha} accessibilityRole="header">
      <Image source={require('../../assets/icon.png')} style={estilos.logo} accessibilityLabel="Logo do Bolso Certo" />
      <Text style={estilos.nome}>Bolso Certo</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  nome: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
});
