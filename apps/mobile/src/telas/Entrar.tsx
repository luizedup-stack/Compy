import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text } from 'react-native';

import { entrarComoCliente, mensagemDoErro } from '../api';
import { Botao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { ConfigurarServidor } from '../componentes/ConfigurarServidor';
import { Formulario } from '../componentes/Formulario';
import type { RootStackParamList } from '../rotas';
import { useSessao } from '../sessao';
import { cores, estilos, fontes } from '../tema';
import { MSG_EMAIL_INVALIDO, MSG_INFORME_SENHA, emailValido } from '../validacao';

type Props = NativeStackScreenProps<RootStackParamList, 'Entrar'>;

const marcaEstilo = { width: 200, height: 70, alignSelf: 'flex-start' } as const;
const sloganEstilo = StyleSheet.flatten([estilos.subtitulo, { fontFamily: fontes.semi, color: cores.marca }]);

export function Entrar({ navigation, route }: Props) {
  const { iniciar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<{ email?: string; senha?: string; geral?: string }>({});
  const [enviando, setEnviando] = useState(false);
  const aviso = route.params?.aviso;

  async function enviar() {
    const emailLimpo = email.trim();
    const novos: typeof erros = {};
    if (!emailValido(emailLimpo)) novos.email = MSG_EMAIL_INVALIDO;
    if (senha === '') novos.senha = MSG_INFORME_SENHA;
    setErros(novos);
    if (novos.email || novos.senha) return;

    setEnviando(true);
    try {
      const resposta = await entrarComoCliente(emailLimpo, senha);
      await iniciar(resposta.token, resposta.emailVerificado);
      // Volta para as abas, na aba Conta (já com a conta aberta).
      navigation.reset({ index: 0, routes: [{ name: 'Principal', params: { screen: 'Conta' } }] });
    } catch (e) {
      setErros({ geral: mensagemDoErro(e) });
      setEnviando(false);
    }
  }

  return (
    <Formulario>
      <Image source={require('../../assets/marca-compy.png')} style={marcaEstilo} resizeMode="contain" accessibilityRole="header" accessibilityLabel="Compy" />
      <Text style={sloganEstilo}>
        Compare <Text style={{ color: cores.destaque }}>antes</Text> de comprar.
      </Text>
      <Text style={estilos.subtitulo}>Entre na sua conta. Para só comparar preços, não precisa de conta.</Text>
      {aviso ? (
        <Text style={estilos.sucesso} accessibilityLiveRegion="polite">
          {aviso}
        </Text>
      ) : null}
      <Campo
        rotulo="E-mail"
        value={email}
        onChangeText={setEmail}
        erro={erros.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        textContentType="emailAddress"
      />
      <Campo
        rotulo="Senha"
        value={senha}
        onChangeText={setSenha}
        erro={erros.senha}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />
      {erros.geral ? (
        <Text style={estilos.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erros.geral}
        </Text>
      ) : null}
      <Botao titulo="Entrar" ocupado={enviando} aoPressionar={() => void enviar()} />
      <Pressable accessibilityRole="link" accessibilityLabel="Criar conta" onPress={() => navigation.navigate('Cadastrar')}>
        <Text style={estilos.link}>Criar conta</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Esqueci minha senha"
        onPress={() => navigation.navigate('EsqueciSenha')}
      >
        <Text style={estilos.link}>Esqueci minha senha</Text>
      </Pressable>
      <ConfigurarServidor />
    </Formulario>
  );
}
