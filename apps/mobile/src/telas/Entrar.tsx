import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { entrarComoCliente, mensagemDoErro } from '../api';
import { Botao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { ConfigurarServidor } from '../componentes/ConfigurarServidor';
import { Formulario } from '../componentes/Formulario';
import type { RootStackParamList } from '../rotas';
import { useSessao } from '../sessao';
import { estilos } from '../tema';
import { MSG_EMAIL_INVALIDO, MSG_INFORME_SENHA, emailValido } from '../validacao';

type Props = NativeStackScreenProps<RootStackParamList, 'Entrar'>;

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
      <Text style={estilos.titulo} accessibilityRole="header">
        Bolso Certo
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
