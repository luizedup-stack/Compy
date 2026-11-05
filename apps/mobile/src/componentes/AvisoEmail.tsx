import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { mensagemDoErro, reenviarVerificacao } from '../api';
import type { RootStackParamList } from '../rotas';
import { useSessao } from '../sessao';
import { cores } from '../tema';
import { Botao } from './Botao';

/** Faixa no topo das telas principais enquanto o e-mail não foi confirmado. Não bloqueia o uso do app. */
export function AvisoEmail() {
  const { sessao } = useSessao();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ erro: boolean; texto: string } | null>(null);

  if (!sessao || sessao.emailVerificado) return null;

  async function reenviar() {
    setOcupado(true);
    setResultado(null);
    try {
      await reenviarVerificacao();
      setResultado({ erro: false, texto: 'E-mail reenviado.' });
    } catch (e) {
      setResultado({ erro: true, texto: mensagemDoErro(e) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <View style={estilos.faixa} accessibilityRole="summary">
      <Text style={estilos.texto}>Confirme seu e-mail para garantir o acesso à sua conta.</Text>
      {resultado ? (
        <Text
          style={resultado.erro ? estilos.erro : estilos.sucesso}
          accessibilityRole={resultado.erro ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
        >
          {resultado.texto}
        </Text>
      ) : null}
      <View style={estilos.botoes}>
        <View style={estilos.botao}>
          <Botao titulo="Reenviar e-mail" tipo="secundario" ocupado={ocupado} aoPressionar={() => void reenviar()} />
        </View>
        <View style={estilos.botao}>
          <Botao titulo="Já tenho o código" tipo="secundario" aoPressionar={() => navigation.navigate('VerificarEmail')} />
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  faixa: {
    backgroundColor: cores.fundoAviso,
    borderBottomWidth: 1,
    borderBottomColor: cores.bordaAviso,
    padding: 12,
    gap: 8,
  },
  texto: { color: cores.texto, fontSize: 14 },
  sucesso: { color: cores.marcaEscura, fontSize: 14 },
  erro: { color: cores.erro, fontSize: 14 },
  botoes: { flexDirection: 'row', gap: 8 },
  botao: { flex: 1 },
});
