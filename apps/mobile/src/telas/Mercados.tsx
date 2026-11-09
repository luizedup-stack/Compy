import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listarMercados, mensagemDoErro, type Mercado } from '../api';
import { useAtualizacao } from '../atualizar';
import { Botao } from '../componentes/Botao';
import type { RootStackParamList } from '../rotas';
import { cores } from '../tema';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'ok'; mercados: Mercado[] }
  | { tipo: 'erro'; mensagem: string };

/** "1 produto", "27 produtos". */
function textoTotal(total: number): string {
  return `${total} ${total === 1 ? 'produto' : 'produtos'}`;
}

/** Lista dos mercados ativos (somente leitura). Tocar num mercado abre os produtos dele. */
export function Mercados() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [atualizando, setAtualizando] = useState(false);
  // Falha ao puxar para atualizar: a lista que já estava na tela é mantida e este aviso aparece em cima dela.
  const [erroAtualizar, setErroAtualizar] = useState<string | null>(null);
  // Número da última chamada feita (ou invalidada ao sair da tela): respostas de números anteriores são descartadas.
  const contador = useRef(0);

  const carregar = useCallback(async (atualizar: boolean) => {
    contador.current += 1;
    const numero = contador.current;
    setErroAtualizar(null);
    if (atualizar) setAtualizando(true);
    else setEstado({ tipo: 'carregando' });
    try {
      const mercados = await listarMercados();
      if (numero !== contador.current) return;
      setEstado({ tipo: 'ok', mercados });
    } catch (e) {
      if (numero !== contador.current) return;
      const mensagem = mensagemDoErro(e);
      if (atualizar) setErroAtualizar(mensagem);
      else setEstado({ tipo: 'erro', mensagem });
    } finally {
      if (numero === contador.current) setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(false);
    return () => {
      contador.current += 1; // ao sair da tela, nenhuma resposta tardia mexe no estado
    };
  }, [carregar]);

  // Botão "Atualizar" do topo: recarrega a lista de mercados e os totais, sem fechar o app.
  const { versao } = useAtualizacao();
  useEffect(() => {
    if (versao > 0) void carregar(true);
  }, [versao, carregar]);

  if (estado.tipo === 'carregando') {
    return (
      <View style={estilos.tela}>
        <View style={estilos.carregando} accessibilityLiveRegion="polite">
          <ActivityIndicator color={cores.marca} />
          <Text style={estilos.textoCarregando}>Carregando mercados…</Text>
        </View>
      </View>
    );
  }

  if (estado.tipo === 'erro') {
    return (
      <View style={estilos.tela}>
        <View style={estilos.erro}>
          <Text style={estilos.textoErro} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {estado.mensagem}
          </Text>
          <Botao titulo="Tentar de novo" tipo="secundario" aoPressionar={() => void carregar(false)} />
        </View>
      </View>
    );
  }

  return (
    <View style={estilos.tela}>
      {erroAtualizar ? (
        <Text style={estilos.avisoErro} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erroAtualizar}
        </Text>
      ) : null}
      <FlatList
        testID="lista-mercados"
        data={estado.mercados}
        keyExtractor={(mercado) => String(mercado.id)}
        renderItem={({ item }) => (
          <Pressable
            testID="mercado"
            accessibilityRole="button"
            accessibilityLabel={`${item.nome}, ${item.endereco}, ${textoTotal(item.totalProdutos)}`}
            onPress={() => navigation.navigate('MercadoDetalhe', { id: item.id, nome: item.nome, endereco: item.endereco })}
            style={({ pressed }) => [estilos.linha, pressed ? estilos.linhaPressionada : null]}
          >
            <Text style={estilos.nome}>{item.nome}</Text>
            <Text style={estilos.endereco}>{item.endereco}</Text>
            <Text style={estilos.total}>{textoTotal(item.totalProdutos)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={estilos.mensagem}>Nenhum mercado disponível ainda.</Text>}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => void carregar(true)} colors={[cores.marca]} tintColor={cores.marca} />}
        contentContainerStyle={estilos.lista}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  lista: { padding: 16, gap: 12 },
  linha: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    padding: 14,
    gap: 2,
    backgroundColor: cores.fundo,
  },
  linhaPressionada: { backgroundColor: '#F0F4F8' },
  nome: { fontSize: 18, fontWeight: '700', color: cores.texto },
  endereco: { fontSize: 14, color: cores.textoSuave },
  total: { marginTop: 4, fontSize: 14, fontWeight: '600', color: cores.marcaEscura },
  mensagem: { paddingVertical: 8, fontSize: 16, color: cores.textoSuave },
  carregando: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  textoCarregando: { fontSize: 16, color: cores.textoSuave },
  erro: { padding: 16, gap: 12 },
  textoErro: { fontSize: 16, color: cores.erro },
  avisoErro: { paddingHorizontal: 16, paddingTop: 12, fontSize: 14, color: cores.erro },
});
