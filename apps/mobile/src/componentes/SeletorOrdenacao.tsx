import type { CriterioOrdem } from '@mercado/shared';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { cores } from '../tema';

export interface OpcaoOrdem {
  valor: CriterioOrdem;
  titulo: string;
}

interface Props {
  opcoes: OpcaoOrdem[];
  escolhido: CriterioOrdem;
  aberto: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
  aoEscolher: (valor: CriterioOrdem) => void;
}

/**
 * "Ordenar por": um botão fechado (mostra só a opção escolhida) que, ao ser tocado, abre uma lista com todas as opções —
 * como uma caixa de seleção (listbox). Antes disso, as opções ficavam sempre visíveis lado a lado; agora só aparecem
 * quando a pessoa toca no botão.
 */
export function SeletorOrdenacao({ opcoes, escolhido, aberto, aoAbrir, aoFechar, aoEscolher }: Props) {
  const titulo = opcoes.find((o) => o.valor === escolhido)?.titulo ?? '';
  return (
    <>
      <Pressable
        testID="botao-ordenar"
        accessibilityRole="button"
        accessibilityLabel={`Ordenar por: ${titulo}. Toque para ver as opções`}
        onPress={aoAbrir}
        style={estilos.botao}
      >
        <Text style={estilos.textoBotao} numberOfLines={1}>
          Ordenar: <Text style={estilos.textoEscolhido}>{titulo}</Text>
        </Text>
        <Text style={estilos.seta} accessibilityElementsHidden>
          ▾
        </Text>
      </Pressable>

      <Modal visible={aberto} animationType="fade" transparent onRequestClose={aoFechar}>
        <Pressable style={estilos.fundo} accessibilityLabel="Fechar" onPress={aoFechar}>
          <Pressable style={estilos.caixa} onPress={(e) => e.stopPropagation()}>
            <Text accessibilityRole="header" style={estilos.tituloCaixa}>
              Ordenar por
            </Text>
            <View testID="lista-ordenar" accessibilityRole="radiogroup">
              {opcoes.map((o) => {
                const marcada = o.valor === escolhido;
                return (
                  <Pressable
                    key={o.valor}
                    accessibilityRole="radio"
                    accessibilityLabel={o.titulo}
                    accessibilityState={{ checked: marcada, selected: marcada }}
                    onPress={() => aoEscolher(o.valor)}
                    style={[estilos.linha, marcada ? estilos.linhaMarcada : null]}
                  >
                    <Text style={[estilos.textoLinha, marcada ? estilos.textoLinhaMarcada : null]}>{o.titulo}</Text>
                    {marcada ? <Text style={estilos.visto}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const estilos = StyleSheet.create({
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: cores.marca,
    backgroundColor: cores.fundo,
    paddingHorizontal: 14,
  },
  textoBotao: { flex: 1, fontSize: 15, fontWeight: '600', color: cores.marcaEscura },
  textoEscolhido: { fontWeight: '800' },
  seta: { fontSize: 16, color: cores.marcaEscura, marginLeft: 8 },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  caixa: { backgroundColor: cores.fundo, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingVertical: 10, paddingHorizontal: 8, paddingBottom: 24 },
  tituloCaixa: { fontSize: 17, fontWeight: '800', color: cores.texto, paddingHorizontal: 12, paddingVertical: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 14, borderRadius: 10 },
  linhaMarcada: { backgroundColor: '#E6F5F9' },
  textoLinha: { fontSize: 16, color: cores.texto },
  textoLinhaMarcada: { fontWeight: '800', color: cores.marcaEscura },
  visto: { fontSize: 18, fontWeight: '800', color: cores.marcaEscura },
});
