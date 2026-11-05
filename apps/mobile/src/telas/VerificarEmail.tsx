import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Text } from 'react-native';

import { mensagemDoErro, verificarEmail } from '../api';
import { Botao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { Formulario } from '../componentes/Formulario';
import type { RootStackParamList } from '../rotas';
import { useSessao } from '../sessao';
import { estilos } from '../tema';
import { MSG_INFORME_CODIGO, limparCodigo } from '../validacao';

type Props = NativeStackScreenProps<RootStackParamList, 'VerificarEmail'>;

export function VerificarEmail({ navigation }: Props) {
  const { marcarEmailVerificado } = useSessao();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  async function confirmar() {
    const codigoLimpo = limparCodigo(codigo);
    if (codigoLimpo === '') {
      setErro(MSG_INFORME_CODIGO);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await verificarEmail(codigoLimpo);
      await marcarEmailVerificado();
      setConfirmado(true);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  if (confirmado) {
    return (
      <Formulario>
        <Text style={estilos.sucesso} accessibilityLiveRegion="polite">
          E-mail confirmado.
        </Text>
        <Botao titulo="Voltar" aoPressionar={() => navigation.goBack()} />
      </Formulario>
    );
  }

  return (
    <Formulario>
      <Text style={estilos.subtitulo}>Cole o código que enviamos para o seu e-mail.</Text>
      <Campo
        rotulo="Código recebido por e-mail"
        value={codigo}
        onChangeText={setCodigo}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
      {erro ? (
        <Text style={estilos.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erro}
        </Text>
      ) : null}
      <Botao titulo="Confirmar e-mail" ocupado={enviando} aoPressionar={() => void confirmar()} />
    </Formulario>
  );
}
