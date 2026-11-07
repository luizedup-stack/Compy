// Prepara a foto de um produto para enviar: reduz a imagem escolhida (as fotos de celular têm vários MB) para um JPEG pequeno.
// O servidor aceita até 300 KB; aqui a imagem fica bem abaixo disso.

export class ErroDeFoto extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeFoto';
  }
}

/** Maior lado, em pixels. Bastam para a foto no app e no painel e mantêm o arquivo pequeno. */
const LADO_MAXIMO = 480;
const TAMANHO_MAXIMO_ESCOLHIDO = 25 * 1024 * 1024;
const LIMITE_FINAL_BYTES = 250 * 1024;
const QUALIDADES = [0.85, 0.7, 0.55, 0.4];

export const MSG_NAO_E_IMAGEM = 'Escolha uma imagem (JPEG, PNG ou WebP).';
export const MSG_NAO_LEU = 'Não consegui ler essa imagem. Tente outra.';
export const MSG_GRANDE = 'A foto continua grande demais mesmo reduzida. Tente outra imagem.';

/** Devolve a foto reduzida como texto "data:image/jpeg;base64,...". Lança ErroDeFoto com uma mensagem para mostrar. */
export async function reduzirImagem(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith('image/')) throw new ErroDeFoto(MSG_NAO_E_IMAGEM);
  if (arquivo.size > TAMANHO_MAXIMO_ESCOLHIDO) throw new ErroDeFoto(MSG_NAO_LEU);

  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo);
  } catch {
    throw new ErroDeFoto(MSG_NAO_LEU);
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const largura = Math.max(1, Math.round(imagem.width * escala));
  const altura = Math.max(1, Math.round(imagem.height * escala));
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const contexto = tela.getContext('2d');
  if (!contexto) throw new ErroDeFoto(MSG_NAO_LEU);
  // Fundo branco: PNG com transparência viraria preto ao converter para JPEG.
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, largura, altura);
  contexto.drawImage(imagem, 0, 0, largura, altura);
  imagem.close?.();

  for (const qualidade of QUALIDADES) {
    const texto = tela.toDataURL('image/jpeg', qualidade);
    const bytes = Math.floor(((texto.length - texto.indexOf(',') - 1) * 3) / 4);
    if (bytes <= LIMITE_FINAL_BYTES) return texto;
  }
  throw new ErroDeFoto(MSG_GRANDE);
}
