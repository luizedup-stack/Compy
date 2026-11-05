import { StyleSheet, Text, View } from 'react-native';

import { useSemConexaoDesde } from '../conexao';
import { cores } from '../tema';

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** "05/11 15:40": sem `Intl`, para ser igual no celular e nos testes. */
export function textoDataHora(milissegundos: number): string {
  const d = new Date(milissegundos);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** Faixa que aparece quando o servidor não responde e o app mostra os dados salvos no celular. */
export function AvisoSemConexao() {
  const desde = useSemConexaoDesde();
  if (desde === null) return null;
  return (
    <View style={estilos.faixa} accessibilityRole="alert">
      <Text style={estilos.texto}>
        Sem conexão com o servidor. Mostrando os dados salvos no celular ({textoDataHora(desde)}).
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  faixa: { backgroundColor: cores.fundoAviso, borderBottomWidth: 1, borderBottomColor: cores.bordaAviso, padding: 10 },
  texto: { color: '#3D2F00', fontSize: 13 },
});
