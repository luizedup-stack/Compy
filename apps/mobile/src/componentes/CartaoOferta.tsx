import type { Oferta } from '@mercado/shared';
import { StyleSheet, Text, View } from 'react-native';

import { formatarPreco, textoIdade, textoPorUnidade } from '../formatar';
import { cores } from '../tema';

interface Props {
  oferta: Oferta;
  /** Liga a etiqueta verde "mais barato" (a primeira oferta de um grupo com mais de uma). */
  maisBarato?: boolean;
}

export const AVISO_SEM_QUANTIDADE = 'sem quantidade informada';

/** Uma oferta de um mercado: nome, endereço, preço da embalagem, preço por unidade e idade do preço. */
export function CartaoOferta({ oferta, maisBarato = false }: Props) {
  const porUnidade = textoPorUnidade(oferta);
  const idade = textoIdade(oferta.diasDesdeAtualizacao);
  const preco = formatarPreco(oferta.preco);

  // A linha inteira é lida como uma frase só, na ordem: mercado, preço, preço por unidade, idade.
  const partes = [
    oferta.mercadoNome,
    oferta.quantidadeTexto ? `${preco}, ${oferta.quantidadeTexto}` : preco,
    porUnidade ?? AVISO_SEM_QUANTIDADE,
    idade,
  ];
  if (oferta.desatualizado) partes.push('preço antigo');
  if (maisBarato) partes.push('mais barato');

  return (
    <View testID="oferta" accessible accessibilityLabel={partes.join(', ')} style={estilos.cartao}>
      <View style={estilos.topo}>
        <Text style={estilos.mercado}>{oferta.mercadoNome}</Text>
        {maisBarato ? (
          <View style={[estilos.chip, estilos.chipMaisBarato]}>
            <Text style={estilos.textoChipMaisBarato}>mais barato</Text>
          </View>
        ) : null}
      </View>
      <Text style={estilos.endereco}>{oferta.endereco}</Text>

      <View style={estilos.linhaPreco}>
        <Text style={estilos.preco}>{preco}</Text>
        {oferta.quantidadeTexto ? <Text style={estilos.quantidade}>{oferta.quantidadeTexto}</Text> : null}
      </View>

      {porUnidade ? <Text style={estilos.porUnidade}>{porUnidade}</Text> : <Text style={estilos.semQuantidade}>{AVISO_SEM_QUANTIDADE}</Text>}

      <View style={estilos.rodape}>
        <Text style={estilos.idade}>{idade}</Text>
        {oferta.desatualizado ? (
          <View style={[estilos.chip, estilos.chipAntigo]}>
            <Text style={estilos.textoChipAntigo}>Preço antigo</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { paddingVertical: 10, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mercado: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: cores.texto },
  endereco: { fontSize: 13, color: cores.textoSuave },
  linhaPreco: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  preco: { fontSize: 24, fontWeight: '700', color: cores.texto },
  quantidade: { fontSize: 14, color: cores.textoSuave },
  porUnidade: { fontSize: 15, fontWeight: '600', color: cores.marcaEscura },
  semQuantidade: { fontSize: 13, fontStyle: 'italic', color: cores.textoSuave },
  rodape: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  idade: { fontSize: 13, color: cores.textoSuave },
  chip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  chipMaisBarato: { backgroundColor: cores.marcaEscura },
  textoChipMaisBarato: { fontSize: 12, fontWeight: '700', color: cores.fundo },
  chipAntigo: { backgroundColor: cores.fundoAviso, borderWidth: 1, borderColor: cores.bordaAviso },
  textoChipAntigo: { fontSize: 12, fontWeight: '700', color: cores.texto },
});
