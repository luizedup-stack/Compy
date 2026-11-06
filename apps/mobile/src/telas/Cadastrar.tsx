import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { urlApi, cadastrar, entrarComoCliente, mensagemDoErro } from '../api';
import { Botao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { Formulario } from '../componentes/Formulario';
import type { RootStackParamList } from '../rotas';
import { useSessao } from '../sessao';
import { cores, estilos } from '../tema';
import { MSG_EMAIL_INVALIDO, MSG_SENHA_CURTA, MSG_SENHAS_DIFERENTES, TAMANHO_MINIMO_SENHA, emailValido } from '../validacao';

type Props = NativeStackScreenProps<RootStackParamList, 'Cadastrar'>;

const TEXTO_POLITICA = 'Li e aceito a política de privacidade';

export function Cadastrar({ navigation }: Props) {
  const { iniciar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [aceitou, setAceitou] = useState(false);
  const [erros, setErros] = useState<{ email?: string; senha?: string; repetir?: string; geral?: string }>({});
  const [enviando, setEnviando] = useState(false);

  function abrirPolitica() {
    Linking.openURL(`${urlApi()}/privacidade`).catch(() =>
      setErros((antigos) => ({ ...antigos, geral: 'Não foi possível abrir a política de privacidade.' })),
    );
  }

  async function enviar() {
    const emailLimpo = email.trim();
    const novos: typeof erros = {};
    if (!emailValido(emailLimpo)) novos.email = MSG_EMAIL_INVALIDO;
    if (senha.length < TAMANHO_MINIMO_SENHA) novos.senha = MSG_SENHA_CURTA;
    // Quem digita a senha errada não descobriria sozinho: pede para repetir e confere se são iguais.
    else if (senha !== repetir) novos.repetir = MSG_SENHAS_DIFERENTES;
    setErros(novos);
    if (novos.email || novos.senha || novos.repetir) return;

    setEnviando(true);
    let contaCriada = false;
    try {
      await cadastrar(emailLimpo, senha);
      contaCriada = true;
      const resposta = await entrarComoCliente(emailLimpo, senha);
      await iniciar(resposta.token, resposta.emailVerificado);
    } catch (e) {
      setErros({
        geral: contaCriada
          ? `Sua conta foi criada, mas não conseguimos entrar agora. ${mensagemDoErro(e)} Tente entrar pela tela inicial.`
          : mensagemDoErro(e),
      });
      setEnviando(false);
    }
  }

  return (
    <Formulario>
      <Text style={estilos.titulo} accessibilityRole="header">
        Criar conta
      </Text>
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
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Campo
        rotulo="Repita a senha"
        value={repetir}
        onChangeText={setRepetir}
        erro={erros.repetir}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <View style={local.politica}>
        <Switch
          value={aceitou}
          onValueChange={setAceitou}
          accessibilityLabel={TEXTO_POLITICA}
          trackColor={{ true: cores.marca, false: cores.borda }}
        />
        <Text style={local.textoPolitica}>{TEXTO_POLITICA}</Text>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel="Ler a política" onPress={abrirPolitica}>
        <Text style={estilos.link}>Ler a política</Text>
      </Pressable>
      {erros.geral ? (
        <Text style={estilos.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erros.geral}
        </Text>
      ) : null}
      <Botao titulo="Criar conta" desabilitado={!aceitou} ocupado={enviando} aoPressionar={() => void enviar()} />
      <Pressable accessibilityRole="link" accessibilityLabel="Já tenho conta" onPress={() => navigation.popTo('Entrar')}>
        <Text style={estilos.link}>Já tenho conta</Text>
      </Pressable>
    </Formulario>
  );
}

const local = StyleSheet.create({
  politica: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textoPolitica: { flex: 1, fontSize: 16, color: cores.texto },
});
