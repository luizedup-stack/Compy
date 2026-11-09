import { Image, StyleSheet, View } from 'react-native';

/**
 * Título do cabeçalho: o ícone do Compy (o "C" com a etiqueta laranja) ao lado do nome em letras brancas. O cabeçalho é azul-marinho,
 * como o fundo do ícone, por isso ele se mistura com a barra.
 */
export function TituloComLogo() {
  return (
    <View style={estilos.linha} accessibilityRole="header" accessibilityLabel="Compy">
      <Image source={require('../../assets/icon.png')} style={estilos.logo} accessibilityLabel="Logo do Compy" />
      <Image source={require('../../assets/marca-compy-branca.png')} style={estilos.nome} resizeMode="contain" accessibilityLabel="Compy" />
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  nome: { width: 92, height: 36 },
});
