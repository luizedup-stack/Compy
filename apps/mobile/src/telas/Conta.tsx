import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { urlApi, excluirConta, mensagemDoErro } from '../api';
import { Botao } from '../componentes/Botao';
import { Perfil } from '../componentes/Perfil';
import { useSessao } from '../sessao';
import type { RootStackParamList } from '../rotas';
import { cores, estilos as comuns } from '../tema';

// Endereço do site do Bolso Certo (veja site/LEIA-ME.md): o botão "Fale conosco" leva até a seção de Contato de lá.
// Troque aqui se o site for publicado noutro endereço.
export const URL_SITE = 'https://luizedup-stack.github.io/compy/';
export const AVISO_CONTA_EXCLUIDA = 'Conta excluída.';
/** Crédito das fotos: a licença do Open Food Facts (CC BY-SA) pede que elas sejam atribuídas. */
export const CREDITO_FOTOS = 'Fotos dos produtos: Open Food Facts (licença CC BY-SA) e enviadas pelos comércios.';

/**
 * Aba Conta. O app funciona sem login: quem não entrou vê aqui as opções de Entrar e Criar conta;
 * quem entrou vê o perfil (foto, nome de usuário, e-mail e senha, tudo editável), Sair, a política de privacidade
 * e a exclusão da conta (com confirmação em duas etapas).
 */
export function Conta() {
  const { sessao } = useSessao();
  return sessao ? <ContaLogada /> : <ContaSemLogin />;
}

/** Quem ainda não entrou: o app é usado normalmente; entrar ou criar conta é opcional. */
function ContaSemLogin() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { avisoDeSaida } = useSessao();
  const [erroLink, setErroLink] = useState<string | null>(null);

  function abrirPolitica() {
    setErroLink(null);
    Linking.openURL(`${urlApi()}/privacidade`).catch(() => setErroLink('Não foi possível abrir a política de privacidade.'));
  }

  function abrirContato() {
    setErroLink(null);
    Linking.openURL(`${URL_SITE}#contato`).catch(() => setErroLink('Não foi possível abrir a página de contato.'));
  }

  return (
    <ScrollView testID="tela-conta-sem-login" style={comuns.tela} contentContainerStyle={estilos.conteudo}>
      <Text accessibilityRole="header" style={estilos.titulo}>
        Minha conta
      </Text>
      {avisoDeSaida ? (
        <Text style={comuns.sucesso} accessibilityLiveRegion="polite">
          {avisoDeSaida}
        </Text>
      ) : null}
      <Text style={estilos.explicacao}>
        Você pode buscar e comparar preços sem ter conta. Se quiser, entre ou crie uma conta para ter o seu perfil.
      </Text>
      <Botao titulo="Entrar" aoPressionar={() => navigation.navigate('Entrar')} />
      <Botao titulo="Criar conta" tipo="secundario" aoPressionar={() => navigation.navigate('Cadastrar')} />
      <View>
        <Pressable accessibilityRole="link" accessibilityLabel="Fale conosco" onPress={abrirContato}>
          <Text style={comuns.link}>Fale conosco (dúvidas, sugestões)</Text>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Política de privacidade" onPress={abrirPolitica}>
          <Text style={comuns.link}>Política de privacidade</Text>
        </Pressable>
        {erroLink ? (
          <Text style={comuns.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {erroLink}
          </Text>
        ) : null}
      </View>
      <Text style={estilos.credito}>{CREDITO_FOTOS}</Text>
    </ScrollView>
  );
}

/** Quem entrou: perfil, sair e exclusão da conta. */
function ContaLogada() {
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

  function abrirContato() {
    setErroLink(null);
    Linking.openURL(`${URL_SITE}#contato`).catch(() => {
      if (montada.current) setErroLink('Não foi possível abrir a página de contato.');
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
      // A sessão acaba aqui: a aba passa a mostrar a versão sem login, com o aviso.
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

      <Perfil />

      <Botao titulo="Sair" tipo="secundario" aoPressionar={() => void sair()} />

      <View>
        <Pressable accessibilityRole="link" accessibilityLabel="Fale conosco" onPress={abrirContato}>
          <Text style={comuns.link}>Fale conosco (dúvidas, sugestões)</Text>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Política de privacidade" onPress={abrirPolitica}>
          <Text style={comuns.link}>Política de privacidade</Text>
        </Pressable>
        {erroLink ? (
          <Text style={comuns.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {erroLink}
          </Text>
        ) : null}
      </View>

      <Text style={estilos.credito}>{CREDITO_FOTOS}</Text>

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
  credito: { fontSize: 12, color: cores.textoSuave },
});
