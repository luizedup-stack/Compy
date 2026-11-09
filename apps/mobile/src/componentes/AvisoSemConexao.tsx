import { StyleSheet, Text, View } from 'react-native';

import { useSemConexaoDesde, useServidorAcordando, useServidorLento } from '../conexao';
import { cores } from '../tema';

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** "05/11 15:40": sem `Intl`, para ser igual no celular e nos testes. */
export function textoDataHora(milissegundos: number): string {
  const d = new Date(milissegundos);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** Faixa que aparece quando o servidor não responde e o app mostra os dados salvos no celular. */
export const AVISO_ACORDANDO = 'Acordando o servidor… Na primeira vez do dia isso pode levar até 1 minuto. Aguarde, o app tenta sozinho.';

export function AvisoSemConexao() {
  const desde = useSemConexaoDesde();
  const acordando = useServidorAcordando();
  const lento = useServidorLento();
  if (acordando) {
    return (
      <View testID="aviso-acordando" style={estilos.faixa} accessibilityRole="alert">
        <Text style={estilos.texto}>{AVISO_ACORDANDO}</Text>
      </View>
    );
  }
  if (desde === null) return null;
  if (lento) {
    return (
      <View testID="aviso-lento" style={estilos.faixa} accessibilityRole="alert">
        <Text style={estilos.texto}>
          O servidor está demorando para responder (ele dorme quando ninguém usa e leva até 1 minuto para acordar). Mostrando os dados salvos no celular ({textoDataHora(desde)}); o app continua tentando.
        </Text>
      </View>
    );
  }
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
