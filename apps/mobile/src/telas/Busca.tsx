import type { CriterioOrdem, GrupoProduto } from '@mercado/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { buscar, listarProdutos, mensagemDoErro, type OpcoesDeLista } from '../api';
import { useAtualizacao } from '../atualizar';
import { Botao } from '../componentes/Botao';
import { CartaoOferta } from '../componentes/CartaoOferta';
import { FotoDoProduto } from '../componentes/FotoDoProduto';
import { PainelDeFiltros, SEM_FILTROS, contarFiltros, type SelecaoDeFiltros } from '../componentes/PainelDeFiltros';
import { cores } from '../tema';

type Ordem = 'unidade' | 'embalagem';

/** Tempo de espera depois da última tecla antes de chamar a API. */
const ESPERA_MS = 400;
const MINIMO_LETRAS = 2;

/** As formas de ordenar a lista (a primeira é a que vale ao abrir). */
const CRITERIOS: { valor: CriterioOrdem; titulo: string }[] = [
  { valor: 'relevancia', titulo: 'Relevância' },
  { valor: 'menor-preco', titulo: 'Menor preço' },
  { valor: 'maior-preco', titulo: 'Maior preço' },
  { valor: 'recentes', titulo: 'Recentes' },
];

type Estado =
  // Nada digitado: a lista de produtos da tela inicial, paginada (`total` = produtos em todas as páginas).
  | { tipo: 'inicio'; grupos: GrupoProduto[]; total: number; pagina: number; carregandoMais: boolean; erroMais: string | null }
  | { tipo: 'carregando' }
  | { tipo: 'ok'; q: string; grupos: GrupoProduto[] }
  | { tipo: 'erro'; q: string; mensagem: string };

/**
 * Busca e comparação de preços (somente leitura). A API devolve os grupos e as ofertas já ordenados
 * pela opção escolhida; a tela os mostra exatamente nessa ordem, sem reordenar.
 * Sem nada digitado, a tela já mostra a lista de produtos comparados (os vendidos em mais de um mercado vêm primeiro,
 * cada um com o mercado mais barato em destaque); ao digitar, mostra o resultado da busca.
 */
export function Busca() {
  const [texto, setTexto] = useState('');
  // Como comparar o preço (unidade ou embalagem), a ordenação escolhida e os filtros: tudo junto vai na consulta.
  const [selecao, setSelecao] = useState<SelecaoDeFiltros>(SEM_FILTROS);
  const [criterio, setCriterio] = useState<CriterioOrdem>('relevancia');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const ordem: Ordem = selecao.comparar;
  // Sempre o valor mais novo, para as consultas que já estão em andamento não usarem opções velhas.
  const opcoesRef = useRef<OpcoesDeLista>({ criterio: 'relevancia' });
  opcoesRef.current = { criterio, ...(Object.keys(selecao.filtros).length > 0 ? { filtros: selecao.filtros } : {}) };
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Número da última chamada feita (ou invalidada): respostas de números anteriores são descartadas.
  const contador = useRef(0);
  // Última busca pedida e ainda válida (em andamento ou mostrada); evita repetir a mesma chamada.
  const ultima = useRef<{ q: string; ordem: Ordem; opcoes: string } | null>(null);

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
      // Texto curto demais (ou vazio) vale como "nada digitado": mostra a lista de produtos da tela inicial.
      const lista = q.length < MINIMO_LETRAS;
      const chave = lista ? '' : q;
      const anterior = ultima.current;
      const opcoes = opcoesRef.current;
      const chaveOpcoes = JSON.stringify(opcoes);
      if (!forcar && anterior && anterior.q === chave && anterior.ordem === ordemEscolhida && anterior.opcoes === chaveOpcoes) return;

      ultima.current = { q: chave, ordem: ordemEscolhida, opcoes: chaveOpcoes };
      contador.current += 1;
      const numero = contador.current;
      setEstado({ tipo: 'carregando' });
      if (lista) {
        try {
          const { grupos, total } = await listarProdutos(ordemEscolhida, 1, opcoes);
          if (numero !== contador.current) return;
          setEstado({ tipo: 'inicio', grupos, total, pagina: 1, carregandoMais: false, erroMais: null });
        } catch (e) {
          if (numero !== contador.current) return;
          ultima.current = null; // permite tentar de novo
          setEstado({ tipo: 'erro', q: '', mensagem: mensagemDoErro(e) });
        }
        return;
      }
      try {
        const grupos = await buscar(q, ordemEscolhida, opcoes);
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

  // Abre a tela já com a lista de produtos (sem a pessoa precisar digitar nada).
  useEffect(() => {
    void disparar('', 'unidade');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir a tela; trocar a ordem tem o seu próprio disparo
  }, []);

  // Botão "Atualizar" do topo: refaz a consulta que está na tela (a lista inicial ou a busca digitada), sem fechar o app.
  const { versao } = useAtualizacao();
  useEffect(() => {
    if (versao > 0) void disparar(texto.trim(), ordem, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o botão é tocado
  }, [versao]);

  /** Pede a próxima página da lista inicial e a junta ao que já está na tela. */
  async function carregarMais() {
    if (estado.tipo !== 'inicio' || estado.carregandoMais || estado.grupos.length >= estado.total) return;
    const numero = contador.current;
    const proxima = estado.pagina + 1;
    setEstado({ ...estado, carregandoMais: true, erroMais: null });
    try {
      const { grupos, total } = await listarProdutos(ordem, proxima, opcoesRef.current);
      if (numero !== contador.current) return; // a pessoa digitou ou trocou a ordem enquanto isso
      setEstado((atual) => {
        if (atual.tipo !== 'inicio') return atual;
        const jaTem = new Set(atual.grupos.map((g) => g.codigoBarras));
        return {
          ...atual,
          grupos: [...atual.grupos, ...grupos.filter((g) => !jaTem.has(g.codigoBarras))],
          total,
          pagina: proxima,
          carregandoMais: false,
        };
      });
    } catch (e) {
      if (numero !== contador.current) return;
      setEstado((atual) => (atual.tipo === 'inicio' ? { ...atual, carregandoMais: false, erroMais: mensagemDoErro(e) } : atual));
    }
  }

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

  function trocarCriterio(novo: CriterioOrdem) {
    if (novo === criterio) return;
    opcoesRef.current = { ...opcoesRef.current, criterio: novo };
    setCriterio(novo);
    void disparar(texto.trim(), ordem); // troca imediata, sem esperar os 400 ms
  }

  function aplicarFiltros(nova: SelecaoDeFiltros) {
    setFiltrosAbertos(false);
    opcoesRef.current = { criterio, ...(Object.keys(nova.filtros).length > 0 ? { filtros: nova.filtros } : {}) };
    setSelecao(nova);
    void disparar(texto.trim(), nova.comparar);
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
        <View style={estilos.barraOrdem}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.chips} style={estilos.rolagemChips}>
            <View testID="criterio" accessibilityRole="radiogroup" style={estilos.opcoes}>
              {CRITERIOS.map((c) => {
                const marcada = c.valor === criterio;
                return (
                  <Pressable
                    key={c.valor}
                    accessibilityRole="radio"
                    accessibilityLabel={`Ordenar por ${c.titulo}`}
                    accessibilityState={{ checked: marcada, selected: marcada }}
                    onPress={() => trocarCriterio(c.valor)}
                    style={[estilos.opcao, marcada ? estilos.opcaoMarcada : null]}
                  >
                    <Text style={[estilos.textoOpcao, marcada ? estilos.textoOpcaoMarcada : null]}>{c.titulo}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={contarFiltros(selecao) > 0 ? `Filtros, ${contarFiltros(selecao)} ligados` : 'Filtros'}
            onPress={() => setFiltrosAbertos(true)}
            style={[estilos.botaoFiltros, contarFiltros(selecao) > 0 ? estilos.botaoFiltrosLigado : null]}
          >
            <Text style={[estilos.textoBotaoFiltros, contarFiltros(selecao) > 0 ? estilos.textoBotaoFiltrosLigado : null]}>
              {contarFiltros(selecao) > 0 ? `Filtros (${contarFiltros(selecao)})` : 'Filtros'}
            </Text>
          </Pressable>
        </View>
        <PainelDeFiltros visivel={filtrosAbertos} inicial={selecao} aoFechar={() => setFiltrosAbertos(false)} aoAplicar={aplicarFiltros} />
      </View>

      {estado.tipo === 'inicio' && estado.grupos.length === 0 ? (
        <Text style={estilos.mensagem} accessibilityLiveRegion="polite">
          Ainda não há produtos cadastrados.
        </Text>
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

      {estado.tipo === 'inicio' && estado.grupos.length > 0 ? (
        <FlatList
          testID="lista-inicial"
          data={estado.grupos}
          keyExtractor={(grupo) => grupo.codigoBarras}
          renderItem={({ item }) => <GrupoCartao grupo={item} />}
          contentContainerStyle={estilos.lista}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReachedThreshold={0.5}
          onEndReached={() => void carregarMais()}
          ListHeaderComponent={
            <Text style={estilos.explicacaoInicio}>
              Produtos para comparar entre os estabelecimentos, com o mais barato em destaque. Use "Ordenar por" e "Filtros" para achar o
              que você quer, ou digite acima para buscar um produto.
            </Text>
          }
          ListFooterComponent={
            estado.grupos.length < estado.total ? (
              <View style={estilos.rodape}>
                {estado.erroMais ? (
                  <Text style={estilos.textoErro} accessibilityRole="alert" accessibilityLiveRegion="polite">
                    {estado.erroMais}
                  </Text>
                ) : null}
                <Botao
                  titulo={estado.erroMais ? 'Tentar de novo' : 'Carregar mais produtos'}
                  tipo="secundario"
                  ocupado={estado.carregandoMais}
                  aoPressionar={() => void carregarMais()}
                />
              </View>
            ) : (
              <View />
            )
          }
        />
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
      <View style={estilos.topoGrupo}>
        <FotoDoProduto foto={grupo.foto} nome={grupo.nome} ilustrativa={grupo.fotoIlustrativa === true} />
        <Text accessibilityRole="header" style={estilos.nomeGrupo}>
          {grupo.nome}
        </Text>
      </View>
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
  barraOrdem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolagemChips: { flex: 1 },
  chips: { paddingRight: 8 },
  botaoFiltros: { minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: cores.marca, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo },
  botaoFiltrosLigado: { backgroundColor: cores.promocao, borderColor: cores.promocao },
  textoBotaoFiltros: { fontSize: 14, fontWeight: '700', color: cores.marcaEscura },
  textoBotaoFiltrosLigado: { color: '#FFFFFF' },
  opcoes: { flexDirection: 'row', gap: 8 },
  opcao: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: cores.marca,
    backgroundColor: cores.fundo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
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
  explicacaoInicio: { fontSize: 14, color: cores.textoSuave, marginBottom: 4 },
  rodape: { gap: 12, paddingVertical: 8 },
  grupo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topoGrupo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  nomeGrupo: { flex: 1, fontSize: 18, fontWeight: '700', color: cores.texto },
});
