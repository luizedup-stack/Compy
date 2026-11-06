// Escolher a foto de perfil na galeria do celular e reduzi-la para ser guardada na conta.
// A foto é recortada em quadrado (a pessoa ajusta ao escolher), reduzida para 256x256 e comprimida (JPEG): fica com
// algumas dezenas de KB, bem abaixo do limite do servidor. Devolve a imagem como texto "data:image/jpeg;base64,...".
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Lado, em pixels, da foto guardada. */
export const LADO_DA_FOTO = 256;

/** Por que não foi possível escolher a foto (para mostrar à pessoa). */
export class ErroDeFoto extends Error {}

/**
 * Abre a galeria e devolve a foto escolhida já reduzida, ou `null` se a pessoa cancelou.
 * Lança `ErroDeFoto` se a imagem não pôde ser lida.
 */
export async function escolherFoto(): Promise<string | null> {
  const escolha = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true, // deixa a pessoa recortar
    aspect: [1, 1],
    quality: 1,
  });
  if (escolha.canceled || !escolha.assets?.[0]) return null;

  try {
    const reduzida = await ImageManipulator.manipulateAsync(
      escolha.assets[0].uri,
      [{ resize: { width: LADO_DA_FOTO, height: LADO_DA_FOTO } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!reduzida.base64) throw new Error('sem dados');
    return `data:image/jpeg;base64,${reduzida.base64}`;
  } catch {
    throw new ErroDeFoto('Não foi possível usar essa foto. Escolha outra.');
  }
}
