import type { ProdutoMercado } from '@mercado/shared';
import { StyleSheet, Text, View } from 'react-native';

import { formatarPreco, textoIdade, textoPorUnidade } from '../formatar';
import { cores } from '../tema';
import { AVISO_SEM_QUANTIDADE } from './CartaoOferta';
import { FotoDoProduto } from './FotoDoProduto';

/** Um produto de um mercado: nome, preço da embalagem, preço por unidade e idade do preço. */
export function LinhaProduto({ produto }: { produto: ProdutoMercado }) {
  const porUnidade = textoPorUnidade(produto);
  const idade = textoIdade(produto.diasDesdeAtualizacao);
  const preco = formatarPreco(produto.preco);

  // A linha inteira é lida como uma frase só, na ordem: nome, preço, preço por unidade, idade.
  const partes = [
    produto.nome,
    produto.quantidadeTexto ? `${preco}, ${produto.quantidadeTexto}` : preco,
    porUnidade ?? AVISO_SEM_QUANTIDADE,
    idade,
  ];
  if (produto.desatualizado) partes.push('preço antigo');

  return (
    <View testID="produto" accessible accessibilityLabel={partes.join(', ')} style={estilos.linha}>
      <View style={estilos.topo}>
        <FotoDoProduto foto={produto.foto} nome={produto.nome} tamanho={56} ilustrativa={produto.fotoIlustrativa === true} />
        <Text style={estilos.nome}>{produto.nome}</Text>
      </View>

      <View style={estilos.linhaPreco}>
        <Text style={estilos.preco}>{preco}</Text>
        {produto.quantidadeTexto ? <Text style={estilos.quantidade}>{produto.quantidadeTexto}</Text> : null}
      </View>

      {porUnidade ? <Text style={estilos.porUnidade}>{porUnidade}</Text> : <Text style={estilos.semQuantidade}>{AVISO_SEM_QUANTIDADE}</Text>}

      <View style={estilos.rodape}>
        <Text style={estilos.idade}>{idade}</Text>
        {produto.desatualizado ? (
          <View style={estilos.chipAntigo}>
            <Text style={estilos.textoChipAntigo}>Preço antigo</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { paddingVertical: 10, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nome: { flex: 1, fontSize: 16, fontWeight: '700', color: cores.texto },
  linhaPreco: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  preco: { fontSize: 22, fontWeight: '700', color: cores.texto },
  quantidade: { fontSize: 14, color: cores.textoSuave },
  porUnidade: { fontSize: 15, fontWeight: '600', color: cores.marcaEscura },
  semQuantidade: { fontSize: 13, fontStyle: 'italic', color: cores.textoSuave },
  rodape: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  idade: { fontSize: 13, color: cores.textoSuave },
  chipAntigo: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: cores.fundoAviso,
    borderWidth: 1,
    borderColor: cores.bordaAviso,
  },
  textoChipAntigo: { fontSize: 12, fontWeight: '700', color: cores.texto },
});
