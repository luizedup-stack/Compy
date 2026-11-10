import type { Oferta } from '@mercado/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatarPreco, textoIdade, textoPorUnidade, textoPromocaoAte } from '../formatar';
import { perguntarSeQuerIr } from '../rota';
import { cores } from '../tema';

interface Props {
  oferta: Oferta;
  /** Liga a etiqueta verde "mais barato" (a primeira oferta de um grupo com mais de uma). */
  maisBarato?: boolean;
}

export const AVISO_SEM_QUANTIDADE = 'sem quantidade informada';

/**
 * Uma oferta de um mercado: nome, endereço, preço da embalagem, preço por unidade e idade do preço.
 * Tocar na oferta (é onde a pessoa escolhe comprar) pergunta se ela quer ir até o mercado e abre o Google Maps ou o Waze.
 * Oferta EM PROMOÇÃO (`oferta.precoOriginal`): selo laranja "PROMOÇÃO", o preço promocional grande, o preço antigo riscado, "até dd/mm"
 * e o cartão todo em tom laranja, para chamar a atenção de quem está olhando.
 */
export function CartaoOferta({ oferta, maisBarato = false }: Props) {
  const porUnidade = textoPorUnidade(oferta);
  const idade = textoIdade(oferta.diasDesdeAtualizacao);
  const preco = formatarPreco(oferta.preco);
  const emPromocao = oferta.precoOriginal !== undefined;
  const ate = emPromocao ? textoPromocaoAte(oferta.promocaoAte) : null;

  // A linha inteira é lida como uma frase só, na ordem: mercado, preço, preço por unidade, idade.
  const partes = [
    oferta.mercadoNome,
    ...(emPromocao ? [`em promoção, de ${formatarPreco(oferta.precoOriginal as number)} por ${preco}, ${ate}`] : []),
    oferta.quantidadeTexto ? `${preco}, ${oferta.quantidadeTexto}` : preco,
    porUnidade ?? AVISO_SEM_QUANTIDADE,
    idade,
  ];
  if (oferta.desatualizado) partes.push('preço antigo');
  if (maisBarato) partes.push('mais barato');

  return (
    <Pressable
      testID="oferta"
      accessible
      accessibilityRole="link"
      accessibilityLabel={partes.join(', ')}
      accessibilityHint="Toque para ver como chegar ao estabelecimento"
      onPress={() => perguntarSeQuerIr({ nome: oferta.mercadoNome, endereco: oferta.endereco })}
      style={({ pressed }) => [estilos.cartao, emPromocao ? estilos.cartaoPromocao : null, pressed ? estilos.pressionado : null]}
    >
      {emPromocao ? (
        <View testID="selo-promocao" style={estilos.faixaPromocao}>
          <Text style={estilos.textoFaixaPromocao}>🔥 PROMOÇÃO</Text>
          <Text style={estilos.textoAte}>{ate}</Text>
        </View>
      ) : null}
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
        <Text style={[estilos.preco, emPromocao ? estilos.precoPromocao : null]}>{preco}</Text>
        {emPromocao ? <Text testID="preco-antigo" style={estilos.precoAntigo}>{formatarPreco(oferta.precoOriginal as number)}</Text> : null}
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
        <Text style={estilos.comoChegar}>Como chegar</Text>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  cartao: { paddingVertical: 10, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  pressionado: { opacity: 0.6 },
  cartaoPromocao: { backgroundColor: cores.fundoPromocao, borderWidth: 2, borderColor: cores.promocao, borderRadius: 10, paddingHorizontal: 10, marginTop: 6 },
  faixaPromocao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cores.promocao, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
  textoFaixaPromocao: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  textoAte: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  precoPromocao: { color: cores.promocaoEscura, fontSize: 28 },
  precoAntigo: { fontSize: 15, color: cores.textoSuave, textDecorationLine: 'line-through' },
  comoChegar: { marginLeft: 'auto', fontSize: 14, fontWeight: '700', color: cores.marca },
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
