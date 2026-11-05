import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { esqueciSenha, mensagemDoErro, redefinirSenha } from '../api';
import { Botao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { Formulario } from '../componentes/Formulario';
import type { RootStackParamList } from '../rotas';
import { estilos } from '../tema';
import {
  MSG_EMAIL_INVALIDO,
  MSG_INFORME_CODIGO,
  MSG_SENHA_CURTA,
  TAMANHO_MINIMO_SENHA,
  emailValido,
  limparCodigo,
} from '../validacao';

type Props = NativeStackScreenProps<RootStackParamList, 'EsqueciSenha'>;

export const MSG_CODIGO_ENVIADO = 'Se esse e-mail estiver cadastrado, enviamos um código.';
export const MSG_SENHA_ALTERADA = 'Senha alterada. Entre com a nova senha.';

export function EsqueciSenha({ navigation }: Props) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<{ email?: string; codigo?: string; senha?: string; geral?: string }>({});
  const [enviando, setEnviando] = useState(false);

  async function enviarCodigo() {
    const emailLimpo = email.trim();
    if (!emailValido(emailLimpo)) {
      setErros({ email: MSG_EMAIL_INVALIDO });
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      await esqueciSenha(emailLimpo);
      setEtapa(2);
    } catch (e) {
      setErros({ geral: mensagemDoErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  async function redefinir() {
    const codigoLimpo = limparCodigo(codigo);
    const novos: typeof erros = {};
    if (codigoLimpo === '') novos.codigo = MSG_INFORME_CODIGO;
    if (senha.length < TAMANHO_MINIMO_SENHA) novos.senha = MSG_SENHA_CURTA;
    setErros(novos);
    if (novos.codigo || novos.senha) return;

    setEnviando(true);
    try {
      await redefinirSenha(codigoLimpo, senha);
      navigation.popTo('Entrar', { aviso: MSG_SENHA_ALTERADA });
    } catch (e) {
      setErros({ geral: mensagemDoErro(e) });
      setEnviando(false);
    }
  }

  const erroGeral = erros.geral ? (
    <Text style={estilos.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {erros.geral}
    </Text>
  ) : null;

  if (etapa === 1) {
    return (
      <Formulario>
        <Text style={estilos.titulo} accessibilityRole="header">
          Esqueci minha senha
        </Text>
        <Text style={estilos.subtitulo}>Informe o e-mail da sua conta e enviaremos um código para criar uma nova senha.</Text>
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
        {erroGeral}
        <Botao titulo="Enviar código" ocupado={enviando} aoPressionar={() => void enviarCodigo()} />
      </Formulario>
    );
  }

  return (
    <Formulario>
      <Text style={estilos.titulo} accessibilityRole="header">
        Nova senha
      </Text>
      <Text style={estilos.sucesso} accessibilityLiveRegion="polite">
        {MSG_CODIGO_ENVIADO}
      </Text>
      <Campo
        rotulo="Código recebido por e-mail"
        value={codigo}
        onChangeText={setCodigo}
        erro={erros.codigo}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
      <Campo
        rotulo="Nova senha"
        value={senha}
        onChangeText={setSenha}
        erro={erros.senha}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      {erroGeral}
      <Botao titulo="Redefinir senha" ocupado={enviando} aoPressionar={() => void redefinir()} />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Usar outro e-mail"
        onPress={() => {
          setErros({});
          setEtapa(1);
        }}
      >
        <Text style={estilos.link}>Usar outro e-mail</Text>
      </Pressable>
    </Formulario>
  );
}
