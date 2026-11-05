import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { urlApi, excluirConta, mensagemDoErro } from '../api';
import { Botao } from '../componentes/Botao';
import { useSessao } from '../sessao';
import { cores, estilos as comuns } from '../tema';

export const AVISO_CONTA_EXCLUIDA = 'Conta excluída.';

/** Conta do cliente: sair, política de privacidade e exclusão da conta (com confirmação em duas etapas). */
export function Conta() {
  const { sair } = useSessao();
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroLink, setErroLink] = useState<string | null>(null);

  // Trava de verdade contra toques repetidos: vale na hora, sem esperar o botão aparecer desativado.
  const emAndamento = useRef(false);
  const montada = useRef(true);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  function abrirPolitica() {
    setErroLink(null);
    Linking.openURL(`${urlApi()}/privacidade`).catch(() => {
      if (montada.current) setErroLink('Não foi possível abrir a política de privacidade.');
    });
  }

  function cancelar() {
    if (emAndamento.current) return;
    setConfirmando(false);
    setErro(null);
  }

  async function excluir() {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setExcluindo(true);
    setErro(null);
    try {
      await excluirConta();
      // A sessão acaba aqui: a tela some e quem entra é a tela Entrar, com o aviso.
      await sair(AVISO_CONTA_EXCLUIDA);
    } catch (e) {
      emAndamento.current = false;
      if (montada.current) {
        setErro(mensagemDoErro(e));
        setExcluindo(false);
      }
    }
  }

  return (
    <ScrollView testID="tela-conta" style={comuns.tela} contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={estilos.titulo}>
        Minha conta
      </Text>

      <Botao titulo="Sair" tipo="secundario" aoPressionar={() => void sair()} />

      <View>
        <Pressable accessibilityRole="link" accessibilityLabel="Política de privacidade" onPress={abrirPolitica}>
          <Text style={comuns.link}>Política de privacidade</Text>
        </Pressable>
        {erroLink ? (
          <Text style={comuns.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {erroLink}
          </Text>
        ) : null}
      </View>

      <View style={estilos.secao}>
        <Text accessibilityRole="header" style={estilos.tituloSecao}>
          Excluir minha conta
        </Text>
        <Text style={estilos.explicacao}>
          Isso apaga sua conta e seus dados. Suas buscas passam a ser anônimas. Não dá para desfazer.
        </Text>

        {confirmando ? (
          <View style={estilos.confirmacao}>
            {erro ? (
              <Text style={comuns.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {erro}
              </Text>
            ) : null}
            <Botao titulo="Sim, excluir minha conta" tipo="perigo" ocupado={excluindo} aoPressionar={() => void excluir()} />
            <Botao titulo="Cancelar" tipo="secundario" desabilitado={excluindo} aoPressionar={cancelar} />
          </View>
        ) : (
          <Botao titulo="Excluir minha conta" tipo="secundario" aoPressionar={() => setConfirmando(true)} />
        )}
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 24, gap: 16 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.marca },
  secao: { gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: cores.borda },
  tituloSecao: { fontSize: 20, fontWeight: '700', color: cores.texto },
  explicacao: { fontSize: 16, color: cores.textoSuave },
  confirmacao: { gap: 12 },
});
