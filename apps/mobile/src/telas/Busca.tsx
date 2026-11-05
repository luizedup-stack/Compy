import type { GrupoProduto } from '@mercado/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { buscar, mensagemDoErro } from '../api';
import { Botao } from '../componentes/Botao';
import { CartaoOferta } from '../componentes/CartaoOferta';
import { cores } from '../tema';

type Ordem = 'unidade' | 'embalagem';

/** Tempo de espera depois da última tecla antes de chamar a API. */
const ESPERA_MS = 400;
const MINIMO_LETRAS = 2;

const OPCOES: { ordem: Ordem; titulo: string }[] = [
  { ordem: 'unidade', titulo: 'Menor preço por unidade' },
  { ordem: 'embalagem', titulo: 'Menor preço da embalagem' },
];

type Estado =
  | { tipo: 'dica' }
  | { tipo: 'carregando' }
  | { tipo: 'ok'; q: string; grupos: GrupoProduto[] }
  | { tipo: 'erro'; q: string; mensagem: string };

/**
 * Busca e comparação de preços (somente leitura). A API devolve os grupos e as ofertas já ordenados
 * pela opção escolhida; a tela os mostra exatamente nessa ordem, sem reordenar.
 */
export function Busca() {
  const [texto, setTexto] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('unidade');
  const [estado, setEstado] = useState<Estado>({ tipo: 'dica' });

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Número da última chamada feita (ou invalidada): respostas de números anteriores são descartadas.
  const contador = useRef(0);
  // Última busca pedida e ainda válida (em andamento ou mostrada); evita repetir a mesma chamada.
  const ultima = useRef<{ q: string; ordem: Ordem } | null>(null);

  const cancelarEspera = useCallback(() => {
    if (temporizador.current !== null) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);

  // Ao sair da tela: nenhum temporizador pendente e nenhuma resposta tardia mexe no estado.
  useEffect(
    () => () => {
      cancelarEspera();
      contador.current += 1;
    },
    [cancelarEspera],
  );

  const disparar = useCallback(
    async (q: string, ordemEscolhida: Ordem, forcar = false) => {
      cancelarEspera();
      if (q.length < MINIMO_LETRAS) {
        contador.current += 1; // invalida qualquer chamada em andamento
        ultima.current = null;
        setEstado({ tipo: 'dica' });
        return;
      }
      const anterior = ultima.current;
      if (!forcar && anterior && anterior.q === q && anterior.ordem === ordemEscolhida) return;

      ultima.current = { q, ordem: ordemEscolhida };
      contador.current += 1;
      const numero = contador.current;
      setEstado({ tipo: 'carregando' });
      try {
        const grupos = await buscar(q, ordemEscolhida);
        if (numero !== contador.current) return;
        setEstado({ tipo: 'ok', q, grupos });
      } catch (e) {
        if (numero !== contador.current) return;
        ultima.current = null; // permite tentar de novo a mesma busca
        setEstado({ tipo: 'erro', q, mensagem: mensagemDoErro(e) });
      }
    },
    [cancelarEspera],
  );

  function aoDigitar(novo: string) {
    setTexto(novo);
    const q = novo.trim();
    if (q.length < MINIMO_LETRAS) {
      void disparar(q, ordem);
      return;
    }
    cancelarEspera();
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      void disparar(q, ordem);
    }, ESPERA_MS);
  }

  function trocarOrdem(nova: Ordem) {
    if (nova === ordem) return;
    setOrdem(nova);
    void disparar(texto.trim(), nova); // troca imediata, sem esperar os 400 ms
  }

  return (
    <View style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <TextInput
          value={texto}
          onChangeText={aoDigitar}
          onSubmitEditing={() => void disparar(texto.trim(), ordem)}
          accessibilityLabel="Buscar produto"
          placeholder="O que você quer comprar?"
          placeholderTextColor={cores.desabilitado}
          style={estilos.campo}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <View testID="ordem" accessibilityRole="radiogroup" style={estilos.opcoes}>
          {OPCOES.map((opcao) => {
            const marcada = opcao.ordem === ordem;
            return (
              <Pressable
                key={opcao.ordem}
                accessibilityRole="radio"
                accessibilityLabel={opcao.titulo}
                accessibilityState={{ checked: marcada, selected: marcada }}
                onPress={() => trocarOrdem(opcao.ordem)}
                style={[estilos.opcao, marcada ? estilos.opcaoMarcada : null]}
              >
                <Text style={[estilos.textoOpcao, marcada ? estilos.textoOpcaoMarcada : null]}>{opcao.titulo}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {estado.tipo === 'dica' ? (
        <Text style={estilos.mensagem}>Digite o que você quer comprar, por exemplo: arroz, leite, papel higiênico.</Text>
      ) : null}

      {estado.tipo === 'carregando' ? (
        <View style={estilos.carregando} accessibilityLiveRegion="polite">
          <ActivityIndicator color={cores.marca} />
          <Text style={estilos.textoCarregando}>Buscando…</Text>
        </View>
      ) : null}

      {estado.tipo === 'erro' ? (
        <View style={estilos.erro}>
          <Text style={estilos.textoErro} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {estado.mensagem}
          </Text>
          <Botao titulo="Tentar de novo" tipo="secundario" aoPressionar={() => void disparar(estado.q, ordem, true)} />
        </View>
      ) : null}

      {estado.tipo === 'ok' && estado.grupos.length === 0 ? (
        <Text style={estilos.mensagem} accessibilityLiveRegion="polite">{`Nada encontrado para "${estado.q}".`}</Text>
      ) : null}

      {estado.tipo === 'ok' && estado.grupos.length > 0 ? (
        <FlatList
          data={estado.grupos}
          keyExtractor={(grupo) => grupo.codigoBarras}
          renderItem={({ item }) => <GrupoCartao grupo={item} />}
          contentContainerStyle={estilos.lista}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      ) : null}
    </View>
  );
}

function GrupoCartao({ grupo }: { grupo: GrupoProduto }) {
  return (
    <View style={estilos.grupo}>
      <Text accessibilityRole="header" style={estilos.nomeGrupo}>
        {grupo.nome}
      </Text>
      {grupo.ofertas.map((oferta, indice) => (
        <CartaoOferta key={oferta.mercadoId} oferta={oferta} maisBarato={indice === 0 && grupo.ofertas.length > 1} />
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  cabecalho: { padding: 16, gap: 12 },
  campo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: cores.texto,
    backgroundColor: cores.fundo,
  },
  opcoes: { flexDirection: 'row', gap: 8 },
  opcao: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: cores.marca,
    backgroundColor: cores.fundo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  opcaoMarcada: { backgroundColor: cores.marcaEscura, borderColor: cores.marcaEscura },
  textoOpcao: { fontSize: 14, fontWeight: '600', color: cores.marcaEscura, textAlign: 'center' },
  textoOpcaoMarcada: { color: cores.fundo },
  mensagem: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 16, color: cores.textoSuave },
  carregando: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  textoCarregando: { fontSize: 16, color: cores.textoSuave },
  erro: { paddingHorizontal: 16, gap: 12 },
  textoErro: { fontSize: 16, color: cores.erro },
  lista: { padding: 16, gap: 16 },
  grupo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  nomeGrupo: { fontSize: 18, fontWeight: '700', color: cores.texto, marginBottom: 6 },
});
