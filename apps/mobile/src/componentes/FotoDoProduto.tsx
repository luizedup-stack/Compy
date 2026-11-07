import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { urlApi } from '../api';
import { cores } from '../tema';

interface Props {
  /** Caminho da foto na API (ex.: "/fotos/7891000100103"). `null` = produto sem foto; `undefined` = a fonte não informa fotos. */
  foto?: string | null;
  nome: string;
  tamanho?: number;
}

/**
 * Foto do produto. A imagem vem do servidor (que a entrega ou leva ao banco aberto de produtos). Sem foto, ou se a imagem
 * não carregar (sem internet, por exemplo), aparece um quadrado "Sem foto" no lugar. Quando a fonte nem informa fotos
 * (`undefined`, como numa cópia antiga guardada no celular), não ocupa espaço nenhum.
 */
export function FotoDoProduto({ foto, nome, tamanho = 72 }: Props) {
  const [falhou, setFalhou] = useState(false);
  if (foto === undefined) return null;
  const medida = { width: tamanho, height: tamanho };

  if (foto && !falhou) {
    return (
      <Image
        testID="foto-produto"
        accessibilityLabel={`Foto de ${nome}`}
        source={{ uri: `${urlApi()}${foto}` }}
        resizeMode="contain"
        onError={() => setFalhou(true)}
        style={[estilos.imagem, medida]}
      />
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
  vazia: { alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: cores.borda, backgroundColor: cores.fundo },
  textoVazia: { fontSize: 11, color: cores.textoSuave, textAlign: 'center' },
});
