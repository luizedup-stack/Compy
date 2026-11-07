import type { ProdutoMercado } from '@mercado/shared';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ErroApi, mensagemDoErro, produtosDoMercado } from '../api';
import { Botao } from '../componentes/Botao';
import { LinhaProduto } from '../componentes/LinhaProduto';
import { perguntarSeQuerIr } from '../rota';
import type { RootStackParamList } from '../rotas';
import { cores } from '../tema';

type Props = NativeStackScreenProps<RootStackParamList, 'MercadoDetalhe'>;

type Estado =
  | { tipo: 'primeira' } // carregando a página 1
  | { tipo: 'erro'; mensagem: string } // a página 1 falhou
  | { tipo: 'naoEncontrado'; mensagem: string } // 404: o mercado foi removido
  | { tipo: 'ok' };

export const MSG_ERRO_MAIS = 'Não foi possível carregar mais.';

/** Produtos de um mercado (somente leitura), 50 por página, com rolagem infinita. */
export function MercadoDetalhe({ navigation, route }: Props) {
  const { id, nome, endereco } = route.params;

  // "Como chegar" no cabeçalho: pergunta e abre o Google Maps ou o Waze com o endereço do mercado.
  useEffect(() => {
    if (!endereco) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="link" accessibilityLabel="Como chegar ao mercado" onPress={() => perguntarSeQuerIr({ nome, endereco })}>
          <Text style={{ color: cores.marca, fontSize: 15, fontWeight: '700' }}>Como chegar</Text>
        </Pressable>
      ),
    });
  }, [navigation, nome, endereco]);
  const [estado, setEstado] = useState<Estado>({ tipo: 'primeira' });
  const [itens, setItens] = useState<ProdutoMercado[]>([]);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroMais, setErroMais] = useState<string | null>(null);

  // Tudo o que decide se uma página deve ser pedida fica em refs, para valer na hora (sem esperar a tela redesenhar).
  const buscando = useRef(false); // há uma chamada em andamento
  const bloqueado = useRef(false); // a última página falhou: só o botão "Tentar de novo" libera
  const progresso = useRef({ pagina: 0, recebidos: 0, total: 0, vazia: false });
  // Número da última chamada feita (ou invalidada): respostas de números anteriores são descartadas.
  const contador = useRef(0);

  const carregarPagina = useCallback(
    async (pagina: number) => {
      if (buscando.current) return;
      buscando.current = true;
      bloqueado.current = false;
      contador.current += 1;
      const numero = contador.current;
      if (pagina === 1) {
        setEstado({ tipo: 'primeira' });
        setItens([]);
        setErroMais(null);
      } else {
        setCarregandoMais(true);
        setErroMais(null);
      }
      try {
        const resposta = await produtosDoMercado(id, pagina);
        if (numero !== contador.current) return;
        const anterior = pagina === 1 ? 0 : progresso.current.recebidos;
        progresso.current = {
          pagina,
          recebidos: anterior + resposta.itens.length,
          total: resposta.total,
          vazia: resposta.itens.length === 0,
        };
        setItens((antigos) => {
          const vistos = new Set(antigos.map((p) => p.codigoBarras));
          return [...antigos, ...resposta.itens.filter((p) => !vistos.has(p.codigoBarras))];
        });
        setEstado({ tipo: 'ok' });
        setCarregandoMais(false);
      } catch (e) {
        if (numero !== contador.current) return;
        bloqueado.current = true;
        if (e instanceof ErroApi && e.status === 401) return; // a sessão já está sendo encerrada
        const mensagem = mensagemDoErro(e);
        if (e instanceof ErroApi && e.status === 404) {
          setCarregandoMais(false);
          setEstado({ tipo: 'naoEncontrado', mensagem });
        } else if (pagina === 1) {
          setEstado({ tipo: 'erro', mensagem });
        } else {
          setCarregandoMais(false);
          setErroMais(MSG_ERRO_MAIS);
        }
      } finally {
        if (numero === contador.current) buscando.current = false;
      }
    },
    [id],
  );

  useEffect(() => {
    progresso.current = { pagina: 0, recebidos: 0, total: 0, vazia: false };
    buscando.current = false;
    void carregarPagina(1);
    return () => {
      contador.current += 1; // ao sair da tela, nenhuma resposta tardia mexe no estado
      buscando.current = false;
    };
  }, [carregarPagina]);

  /** Fim da lista: pede a próxima página só se a primeira já chegou, nada está em andamento e ainda faltam produtos. */
  function aoChegarAoFim() {
    const { pagina, recebidos, total, vazia } = progresso.current;
    if (buscando.current || bloqueado.current || pagina === 0 || vazia || recebidos >= total) return;
    void carregarPagina(pagina + 1);
  }

  if (estado.tipo === 'primeira') {
    return (
      <View style={estilos.tela}>
        <View style={estilos.carregando} accessibilityLiveRegion="polite">
          <ActivityIndicator color={cores.marca} />
          <Text style={estilos.textoCarregando}>Carregando produtos…</Text>
        </View>
      </View>
    );
  }

  if (estado.tipo === 'erro') {
    return (
      <View style={estilos.tela}>
        <View style={estilos.bloco}>
          <Text style={estilos.textoErro} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {estado.mensagem}
          </Text>
          <Botao titulo="Tentar de novo" tipo="secundario" aoPressionar={() => void carregarPagina(1)} />
        </View>
      </View>
    );
  }

  if (estado.tipo === 'naoEncontrado') {
    return (
      <View style={estilos.tela}>
        <View style={estilos.bloco}>
          <Text style={estilos.textoErro} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {estado.mensagem}
          </Text>
          <Botao titulo="Voltar" tipo="secundario" aoPressionar={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <View style={estilos.tela}>
      <FlatList
        testID="lista-produtos"
        data={itens}
        keyExtractor={(produto) => produto.codigoBarras}
        renderItem={({ item }) => <LinhaProduto produto={item} />}
        onEndReached={aoChegarAoFim}
        onEndReachedThreshold={0.5}
        initialNumToRender={20}
        maxToRenderPerBatch={50}
        ListEmptyComponent={<Text style={estilos.mensagem}>Este mercado ainda não tem produtos.</Text>}
        ListFooterComponent={
          carregandoMais ? (
            <View style={estilos.carregando} accessibilityLiveRegion="polite">
              <ActivityIndicator color={cores.marca} />
              <Text style={estilos.textoCarregando}>Carregando mais produtos…</Text>
            </View>
          ) : erroMais ? (
            <View style={estilos.bloco}>
              <Text style={estilos.textoErro} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {erroMais}
              </Text>
              <Botao
                titulo="Tentar de novo"
                tipo="secundario"
                aoPressionar={() => void carregarPagina(progresso.current.pagina + 1)}
              />
            </View>
          ) : undefined
        }
        contentContainerStyle={estilos.lista}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  lista: { paddingHorizontal: 16, paddingVertical: 8 },
  mensagem: { paddingVertical: 8, fontSize: 16, color: cores.textoSuave },
  carregando: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  textoCarregando: { fontSize: 16, color: cores.textoSuave },
  bloco: { padding: 16, gap: 12 },
  textoErro: { fontSize: 16, color: cores.erro },
});
