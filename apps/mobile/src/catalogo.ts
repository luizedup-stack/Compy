import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Catalogo } from '@mercado/shared';

/**
 * A cópia de todos os mercados e produtos, guardada no celular. Com ela o app busca, lista mercados e mostra
 * produtos sozinho, sem internet e sem o servidor ligado. Quando há conexão, a cópia é renovada.
 * Fica em partes pequenas porque o armazenamento do Android não lê textos muito grandes de uma vez.
 */
const CHAVE_META = 'bolso-certo.catalogo.meta';
const chaveParte = (i: number) => `bolso-certo.catalogo.parte.${i}`;
const CHAVE_FOTOS = 'bolso-certo.catalogo.fotos';
const OFERTAS_POR_PARTE = 300;

interface Meta {
  geradoEm: string;
  baixadoEm: number;
  mercados: Catalogo['mercados'];
  partes: number;
}

export interface CatalogoLocal {
  catalogo: Catalogo;
  /** Quando esta cópia foi baixada do servidor (milissegundos desde 1970). */
  baixadoEm: number;
}

let emMemoria: CatalogoLocal | null = null;

/** A cópia guardada no celular, ou null se nunca foi baixada. */
export async function lerCatalogoLocal(): Promise<CatalogoLocal | null> {
  if (emMemoria) return emMemoria;
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_META);
    if (!bruto) return null;
    const meta = JSON.parse(bruto) as Partial<Meta>;
    if (typeof meta.partes !== 'number' || !Array.isArray(meta.mercados) || typeof meta.baixadoEm !== 'number') return null;
    const pares = await AsyncStorage.multiGet(Array.from({ length: meta.partes }, (_, i) => chaveParte(i)));
    const ofertas: Catalogo['ofertas'] = [];
    for (const [, texto] of pares) {
      if (!texto) return null; // cópia incompleta: é como se não houvesse
      ofertas.push(...(JSON.parse(texto) as Catalogo['ofertas']));
    }
    let fotos: { comFoto?: string[]; fotosIlustrativas?: string[] } = {};
    try {
      const textoFotos = await AsyncStorage.getItem(CHAVE_FOTOS);
      if (textoFotos) fotos = JSON.parse(textoFotos) as typeof fotos;
    } catch {
      // sem as fotos a cópia continua valendo
    }
    emMemoria = {
      catalogo: {
        geradoEm: meta.geradoEm ?? '',
        mercados: meta.mercados,
        ofertas,
        ...(Array.isArray(fotos.comFoto) ? { comFoto: fotos.comFoto } : {}),
        ...(Array.isArray(fotos.fotosIlustrativas) ? { fotosIlustrativas: fotos.fotosIlustrativas } : {}),
      },
      baixadoEm: meta.baixadoEm,
    };
    return emMemoria;
  } catch {
    return null;
  }
}

/** Guarda uma cópia nova no celular (primeiro as partes, por último o índice: nunca fica uma cópia pela metade). */
export async function guardarCatalogoLocal(catalogo: Catalogo, baixadoEm: number = Date.now()): Promise<CatalogoLocal> {
  const partes: Catalogo['ofertas'][] = [];
  for (let i = 0; i < catalogo.ofertas.length; i += OFERTAS_POR_PARTE) {
    partes.push(catalogo.ofertas.slice(i, i + OFERTAS_POR_PARTE));
  }
  const local: CatalogoLocal = { catalogo, baixadoEm };
  try {
    const anterior = await AsyncStorage.getItem(CHAVE_META);
    const partesAntes = anterior ? ((JSON.parse(anterior) as Partial<Meta>).partes ?? 0) : 0;
    await AsyncStorage.multiSet(partes.map((p, i) => [chaveParte(i), JSON.stringify(p)] as [string, string]));
    const meta: Meta = { geradoEm: catalogo.geradoEm, baixadoEm, mercados: catalogo.mercados, partes: partes.length };
    await AsyncStorage.setItem(CHAVE_META, JSON.stringify(meta));
    // Quais produtos têm foto (e quais são ilustrativas): sem isto, ao reabrir o app sem internet as fotos sumiriam.
    await AsyncStorage.setItem(CHAVE_FOTOS, JSON.stringify({ comFoto: catalogo.comFoto ?? [], fotosIlustrativas: catalogo.fotosIlustrativas ?? [] })).catch(() => undefined);
    if (partesAntes > partes.length) {
      await AsyncStorage.multiRemove(Array.from({ length: partesAntes - partes.length }, (_, i) => chaveParte(partes.length + i)));
    }
  } catch {
    // Sem espaço: o app usa a cópia só até fechar.
  }
  emMemoria = local;
  return local;
}

/** Apaga a cópia (ao sair da conta). */
export async function apagarCatalogoLocal(): Promise<void> {
  emMemoria = null;
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_META);
    const partes = bruto ? ((JSON.parse(bruto) as Partial<Meta>).partes ?? 0) : 0;
    await AsyncStorage.multiRemove([CHAVE_META, CHAVE_FOTOS, ...Array.from({ length: partes }, (_, i) => chaveParte(i))]);
  } catch {
    // Nada a fazer.
  }
}

/** Só para os testes: esquece a cópia que está na memória (a guardada no aparelho continua). */
export function esquecerCatalogoEmMemoria(): void {
  emMemoria = null;
}
