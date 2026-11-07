import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErroDeFoto, MSG_GRANDE, MSG_NAO_E_IMAGEM, MSG_NAO_LEU, reduzirImagem } from './foto';

const imagem = (tipo = 'image/jpeg', bytes = 10) => new File([new Uint8Array(bytes)], 'foto', { type: tipo });

/** Um "navegador" mínimo: createImageBitmap devolve uma imagem de largura x altura, e o canvas devolve os textos dados (um por qualidade). */
function simularNavegador({ largura, altura, textos }: { largura: number; altura: number; textos: string[] }) {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: largura, height: altura, close: vi.fn() })));
  const desenhos: { l: number; a: number }[] = [];
  const contexto = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn((_i: unknown, _x: number, _y: number, l: number, a: number) => desenhos.push({ l, a })) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contexto as unknown as CanvasRenderingContext2D);
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
  textos.forEach((t) => toDataURL.mockReturnValueOnce(t));
  return { desenhos, toDataURL, contexto };
}

const texto = (bytes: number) => `data:image/jpeg;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reduzirImagem', () => {
  it('recusa o que não é imagem e arquivos enormes', async () => {
    await expect(reduzirImagem(imagem('application/pdf'))).rejects.toMatchObject({ message: MSG_NAO_E_IMAGEM });
    await expect(reduzirImagem(imagem('image/jpeg', 26 * 1024 * 1024))).rejects.toMatchObject({ message: MSG_NAO_LEU });
  });

  it('imagem que o navegador não consegue abrir: mensagem clara', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('corrompida'))));
    await expect(reduzirImagem(imagem())).rejects.toBeInstanceOf(ErroDeFoto);
    await expect(reduzirImagem(imagem())).rejects.toMatchObject({ message: MSG_NAO_LEU });
  });

  it('reduz uma foto grande para no máximo 480 px no maior lado, mantendo a proporção, em JPEG', async () => {
    const { desenhos, toDataURL, contexto } = simularNavegador({ largura: 4000, altura: 3000, textos: [texto(40_000)] });
    const resultado = await reduzirImagem(imagem('image/png'));
    expect(desenhos).toEqual([{ l: 480, a: 360 }]);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    expect(resultado.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(contexto.fillStyle).toBe('#ffffff'); // fundo branco: PNG transparente não vira preto
  });

  it('foto pequena não é ampliada', async () => {
    const { desenhos } = simularNavegador({ largura: 200, altura: 100, textos: [texto(5_000)] });
    await reduzirImagem(imagem());
    expect(desenhos).toEqual([{ l: 200, a: 100 }]);
  });

  it('se o JPEG sai grande, tenta de novo com qualidade menor até caber', async () => {
    const { toDataURL } = simularNavegador({ largura: 1000, altura: 1000, textos: [texto(400_000), texto(300_000), texto(100_000)] });
    const resultado = await reduzirImagem(imagem());
    expect(toDataURL.mock.calls.map((c) => c[1])).toEqual([0.85, 0.7, 0.55]);
    expect(resultado.length).toBe(texto(100_000).length);
  });

  it('se nem na menor qualidade cabe: erro com a explicação', async () => {
    simularNavegador({ largura: 1000, altura: 1000, textos: [texto(900_000), texto(900_000), texto(900_000), texto(900_000)] });
    await expect(reduzirImagem(imagem())).rejects.toMatchObject({ message: MSG_GRANDE });
  });
});
