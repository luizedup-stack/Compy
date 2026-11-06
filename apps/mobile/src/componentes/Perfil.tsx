// Perfil do cliente, no topo da tela "Conta": foto, nome de usuário, e-mail e troca de senha. A pessoa pode editar tudo.
// Os dados ficam na conta (servidor): GET/PATCH /conta e POST /conta/senha (veja api.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { atualizarPerfil, mensagemDoErro, obterPerfil, trocarSenha, type Perfil as DadosDoPerfil } from '../api';
import { escolherFoto } from '../foto';
import { cores, estilos as comuns } from '../tema';
import { MSG_EMAIL_INVALIDO, MSG_SENHA_CURTA, MSG_SENHAS_DIFERENTES, TAMANHO_MINIMO_SENHA, emailValido } from '../validacao';
import { Botao } from './Botao';
import { Campo } from './Campo';

/** A foto da pessoa, ou um círculo com a inicial do nome (ou do e-mail) quando ela não escolheu foto. */
function Avatar({ perfil }: { perfil: DadosDoPerfil }) {
  if (perfil.foto) {
    return <Image accessibilityLabel="Foto de perfil" source={{ uri: perfil.foto }} style={estilos.foto} />;
  }
  const inicial = (perfil.nome ?? perfil.email).trim().charAt(0).toUpperCase();
  return (
    <View accessibilityLabel="Sem foto de perfil" style={[estilos.foto, estilos.semFoto]}>
      <Text style={estilos.inicial}>{inicial}</Text>
    </View>
  );
}

export function Perfil() {
  const [perfil, setPerfil] = useState<DadosDoPerfil | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [erros, setErros] = useState<{ nome?: string; email?: string; geral?: string }>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [trocandoFoto, setTrocandoFoto] = useState(false);

  // Troca de senha
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [avisoSenha, setAvisoSenha] = useState<string | null>(null);
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  /** Mostra o perfil recebido do servidor e preenche os campos com ele. */
  const aplicar = useCallback((p: DadosDoPerfil) => {
    setPerfil(p);
    setNome(p.nome ?? '');
    setEmail(p.email);
  }, []);

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const p = await obterPerfil();
      if (montado.current) aplicar(p);
    } catch (e) {
      if (montado.current) setErroCarga(mensagemDoErro(e));
    }
  }, [aplicar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Escolhe uma foto na galeria e já a guarda na conta. */
  async function trocarFoto() {
    setErros({});
    setAviso(null);
    setTrocandoFoto(true);
    try {
      const foto = await escolherFoto();
      if (foto === null) return; // a pessoa cancelou
      const p = await atualizarPerfil({ foto });
      if (montado.current) {
        setPerfil(p);
        setAviso('Foto atualizada.');
      }
    } catch (e) {
      if (montado.current) setErros({ geral: mensagemDoErro(e) });
    } finally {
      if (montado.current) setTrocandoFoto(false);
    }
  }

  async function removerFoto() {
    setErros({});
    setAviso(null);
    setTrocandoFoto(true);
    try {
      const p = await atualizarPerfil({ foto: null });
      if (montado.current) {
        setPerfil(p);
        setAviso('Foto removida.');
      }
    } catch (e) {
      if (montado.current) setErros({ geral: mensagemDoErro(e) });
    } finally {
      if (montado.current) setTrocandoFoto(false);
    }
  }

  /** Salva o nome e/ou o e-mail (só o que mudou). */
  async function salvar() {
    if (!perfil) return;
    setAviso(null);
    const novos: typeof erros = {};
    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim();
    if (nomeLimpo !== '' && (nomeLimpo.length < 2 || nomeLimpo.length > 50)) novos.nome = 'O nome deve ter de 2 a 50 caracteres';
    if (!emailValido(emailLimpo)) novos.email = MSG_EMAIL_INVALIDO;
    setErros(novos);
    if (novos.nome || novos.email) return;

    const campos: { nome?: string | null; email?: string } = {};
    if (nomeLimpo !== (perfil.nome ?? '')) campos.nome = nomeLimpo === '' ? null : nomeLimpo;
    if (emailLimpo.toLowerCase() !== perfil.email) campos.email = emailLimpo;
    if (Object.keys(campos).length === 0) {
      setAviso('Nada para alterar.');
      return;
    }
    setSalvando(true);
    try {
      const p = await atualizarPerfil(campos);
      if (montado.current) {
        aplicar(p);
        setAviso('Dados atualizados.');
      }
    } catch (e) {
      if (montado.current) setErros({ geral: mensagemDoErro(e) });
    } finally {
      if (montado.current) setSalvando(false);
    }
  }

  async function mudarSenha() {
    setAvisoSenha(null);
    if (senhaAtual === '') {
      setErroSenha('Informe a senha atual');
      return;
    }
    if (senhaNova.length < TAMANHO_MINIMO_SENHA) {
      setErroSenha(MSG_SENHA_CURTA);
      return;
    }
    if (senhaNova !== repetir) {
      setErroSenha(MSG_SENHAS_DIFERENTES);
      return;
    }
    setErroSenha(null);
    setTrocandoSenha(true);
    try {
      await trocarSenha(senhaAtual, senhaNova);
      if (montado.current) {
        setSenhaAtual('');
        setSenhaNova('');
        setRepetir('');
        setSenhaAberta(false);
        setAvisoSenha('Senha alterada.');
      }
    } catch (e) {
      if (montado.current) setErroSenha(mensagemDoErro(e));
    } finally {
      if (montado.current) setTrocandoSenha(false);
    }
  }

  if (erroCarga) {
    return (
      <View style={estilos.bloco}>
        <Text style={comuns.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erroCarga}
        </Text>
        <Botao titulo="Tentar de novo" tipo="secundario" aoPressionar={() => void carregar()} />
      </View>
    );
  }
  if (!perfil) {
    return (
      <View style={estilos.bloco} accessibilityLiveRegion="polite">
        <ActivityIndicator color={cores.marca} />
      </View>
    );
  }

  return (
    <View style={estilos.bloco} testID="perfil">
      <View style={estilos.topo}>
        <Avatar perfil={perfil} />
        <View style={estilos.botoesFoto}>
          <Botao titulo="Trocar foto" tipo="secundario" ocupado={trocandoFoto} aoPressionar={() => void trocarFoto()} />
          {perfil.foto ? <Botao titulo="Remover foto" tipo="secundario" desabilitado={trocandoFoto} aoPressionar={() => void removerFoto()} /> : null}
        </View>
      </View>

      <Campo rotulo="Nome de usuário" value={nome} onChangeText={setNome} erro={erros.nome} autoComplete="name" textContentType="name" />
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
      {erros.geral ? (
        <Text style={comuns.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erros.geral}
        </Text>
      ) : null}
      {aviso ? (
        <Text style={comuns.sucesso} accessibilityLiveRegion="polite">
          {aviso}
        </Text>
      ) : null}
      <Botao titulo="Salvar alterações" ocupado={salvando} aoPressionar={() => void salvar()} />

      <View style={estilos.senha}>
        {avisoSenha ? (
          <Text style={comuns.sucesso} accessibilityLiveRegion="polite">
            {avisoSenha}
          </Text>
        ) : null}
        {senhaAberta ? (
          <>
            <Campo rotulo="Senha atual" value={senhaAtual} onChangeText={setSenhaAtual} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
            <Campo rotulo="Nova senha" value={senhaNova} onChangeText={setSenhaNova} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
            <Campo rotulo="Repita a nova senha" value={repetir} onChangeText={setRepetir} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
            {erroSenha ? (
              <Text style={comuns.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {erroSenha}
              </Text>
            ) : null}
            <Botao titulo="Alterar senha" ocupado={trocandoSenha} aoPressionar={() => void mudarSenha()} />
            <Botao titulo="Cancelar" tipo="secundario" desabilitado={trocandoSenha} aoPressionar={() => setSenhaAberta(false)} />
          </>
        ) : (
          <Botao titulo="Trocar senha" tipo="secundario" aoPressionar={() => { setAvisoSenha(null); setSenhaAberta(true); }} />
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 12 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  foto: { width: 96, height: 96, borderRadius: 48, backgroundColor: cores.borda },
  semFoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: cores.marca },
  inicial: { fontSize: 40, fontWeight: '700', color: cores.fundo },
  botoesFoto: { flex: 1, gap: 8 },
  senha: { gap: 12, marginTop: 8 },
});
