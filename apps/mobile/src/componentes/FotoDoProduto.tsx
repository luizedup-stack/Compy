import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { urlApi } from '../api';
import { cores } from '../tema';

interface Props {
  /** Caminho da foto na API (ex.: "/fotos/7891000100103"). `null` = produto sem foto; `undefined` = a fonte não informa fotos. */
  foto?: string | null;
  nome: string;
  tamanho?: number;
  /** A foto é só ilustrativa (a do tipo de produto, não a do produto exato): mostra a etiqueta "ilustrativa". */
  ilustrativa?: boolean;
}

/**
 * Foto do produto. A imagem vem do servidor (que a entrega ou leva ao banco aberto de produtos). Sem foto, ou se a imagem
 * não carregar (sem internet, por exemplo), aparece um quadrado "Sem foto" no lugar. Quando a fonte nem informa fotos
 * (`undefined`, como numa cópia antiga guardada no celular), não ocupa espaço nenhum.
 */
export function FotoDoProduto({ foto, nome, tamanho = 72, ilustrativa = false }: Props) {
  const [falhou, setFalhou] = useState(false);
  if (foto === undefined) return null;
  const medida = { width: tamanho, height: tamanho };

  if (foto && !falhou) {
    return (
      <View style={medida}>
        <Image
          testID="foto-produto"
          accessibilityLabel={ilustrativa ? `Foto ilustrativa de ${nome}` : `Foto de ${nome}`}
          source={{ uri: `${urlApi()}${foto}` }}
          resizeMode="contain"
          onError={() => setFalhou(true)}
          style={[estilos.imagem, medida]}
        />
        {ilustrativa ? (
          <View testID="etiqueta-ilustrativa" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={estilos.etiqueta}>
            <Text style={estilos.textoEtiqueta}>ilustrativa</Text>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View testID="sem-foto" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[estilos.vazia, medida]}>
      <Text style={estilos.textoVazia}>Sem foto</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  imagem: { backgroundColor: '#fff', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: cores.borda },
  etiqueta: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, paddingVertical: 1 },
  textoEtiqueta: { fontSize: 10, color: '#fff', textAlign: 'center' },
  vazia: { alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: cores.borda, backgroundColor: cores.fundo },
  textoVazia: { fontSize: 11, color: cores.textoSuave, textAlign: 'center' },
});
