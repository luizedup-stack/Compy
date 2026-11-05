import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Botao } from './Botao';
import { Campo } from './Campo';
import { MSG_SERVIDOR_INVALIDO, salvarServidor, urlApi } from '../servidor';
import { estilos } from '../tema';

/**
 * Para versões de teste: troca o endereço do servidor (API) sem gerar o app de novo.
 * Fica discreto na tela Entrar. Campo vazio volta ao endereço de fábrica.
 */
export function ConfigurarServidor() {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  if (!aberto) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Configurar servidor"
        onPress={() => {
          setTexto(urlApi());
          setSalvo(false);
          setAberto(true);
        }}
      >
        <Text style={estilos.link}>Configurar servidor</Text>
      </Pressable>
    );
  }

  return (
    <>
      <Campo
        rotulo="Endereço do servidor"
        value={texto}
        onChangeText={(t: string) => {
          setTexto(t);
          setSalvo(false);
        }}
        erro={erro ?? undefined}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {salvo ? <Text style={estilos.sucesso}>Servidor salvo: {urlApi()}</Text> : null}
      <Botao
        titulo="Salvar servidor"
        aoPressionar={() => {
          void salvarServidor(texto).then((ok) => {
            setErro(ok ? null : MSG_SERVIDOR_INVALIDO);
            setSalvo(ok);
          });
        }}
      />
    </>
  );
}
