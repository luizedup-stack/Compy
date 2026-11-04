import JSZip from 'jszip';
import { ErroPlanilha } from './erroPlanilha';

// Limites (R14/R16): o xlsx é um zip e o exceljs cria uma célula para cada célula de cada mesclagem.
export const LIMITE_ENTRADA_BYTES = 20 * 1024 * 1024;
export const LIMITE_TOTAL_BYTES = 30 * 1024 * 1024;
export const LIMITE_CELULAS_MESCLAGEM = 10_000;
export const LIMITE_CELULAS_MESCLAGEM_TOTAL = 50_000;

const ERRO_ARQUIVO_INVALIDO = 'Arquivo inválido: envie uma planilha .xlsx';
const ERRO_MUITO_GRANDE = 'Planilha grande demais para ser importada';

// Qualquer elemento mergeCell (com ou sem prefixo de namespace); ref entre aspas simples ou duplas,
// com espaços ao redor do "=" e em qualquer posição entre os atributos.
const PADRAO_MESCLAGEM = /<(?:[\w.-]+:)?mergeCell(?=[\s/>])[^>]{0,1000}?\sref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const PADRAO_REFERENCIA = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i;

function numeroDaColuna(letras: string): number {
  return [...letras.toUpperCase()].reduce((acc, letra) => acc * 26 + letra.charCodeAt(0) - 64, 0);
}

/** Número de células da faixa; Infinity se a conta estourar. 0 se não for uma faixa ou célula. */
function celulasDaMesclagem(ref: string): number {
  const m = PADRAO_REFERENCIA.exec(ref.trim());
  if (!m) return 0;
  const c1 = numeroDaColuna(m[1]!);
  const l1 = Number(m[2]);
  const c2 = m[3] ? numeroDaColuna(m[3]) : c1;
  const l2 = m[4] ? Number(m[4]) : l1;
  const colunas = Math.abs(c2 - c1) + 1;
  const linhas = Math.abs(l2 - l1) + 1;
  const area = colunas * linhas;
  return Number.isFinite(colunas) && Number.isFinite(linhas) && Number.isFinite(area) ? area : Infinity;
}

interface EntradaComFluxo {
  dir: boolean;
  name: string;
  internalStream(tipo: 'uint8array'): {
    on(evento: 'data', f: (pedaco: Uint8Array) => void): unknown;
    on(evento: 'end', f: () => void): unknown;
    on(evento: 'error', f: (erro: Error) => void): unknown;
    resume(): unknown;
    pause(): unknown;
  };
}

/**
 * Descompacta a entrada em fluxo, pedaço a pedaço, e para assim que passar do limite da
 * entrada ou do total. Só guarda os bytes das partes .xml (para a conferência das mesclagens).
 */
function lerEntrada(entrada: EntradaComFluxo, total: { bytes: number }, guardar: boolean): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    let encerrado = false;
    const fluxo = entrada.internalStream('uint8array');
    fluxo.on('data', (pedaco) => {
      if (encerrado) return;
      tamanho += pedaco.length;
      total.bytes += pedaco.length;
      if (tamanho > LIMITE_ENTRADA_BYTES || total.bytes > LIMITE_TOTAL_BYTES) {
        encerrado = true;
        fluxo.pause();
        reject(new ErroPlanilha(ERRO_MUITO_GRANDE));
        return;
      }
      if (guardar) partes.push(pedaco);
    });
    fluxo.on('end', () => {
      if (!encerrado) resolve(partes);
    });
    fluxo.on('error', () => {
      if (encerrado) return;
      encerrado = true;
      reject(new ErroPlanilha(ERRO_ARQUIVO_INVALIDO));
    });
    fluxo.resume();
  });
}

/**
 * Examina o zip ANTES do exceljs, lendo-o como o exceljs (JSZip, diretório central): descompacta cada
 * entrada em fluxo contando os bytes realmente gerados (tamanhos declarados não são confiáveis) e aborta
 * ao passar dos limites; depois confere as mesclagens de todas as partes .xml, sem criar nenhuma célula.
 * `contador` (opcional) recebe o total de bytes descompactados, para testes.
 */
export async function conferirZip(arquivo: Buffer, contador: { bytes: number } = { bytes: 0 }): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arquivo);
  } catch {
    throw new ErroPlanilha(ERRO_ARQUIVO_INVALIDO);
  }
  const entradas = (Object.values(zip.files) as unknown as EntradaComFluxo[]).filter((e) => !e.dir);
  if (entradas.length === 0) throw new ErroPlanilha(ERRO_ARQUIVO_INVALIDO);

  let celulasTotais = 0;
  for (const entrada of entradas) {
    const ehXml = entrada.name.replace(/^\/+/, '').toLowerCase().endsWith('.xml');
    const partes = await lerEntrada(entrada, contador, ehXml);
    if (!ehXml) continue;
    const xml = Buffer.concat(partes).toString('utf8');
    for (const m of xml.matchAll(PADRAO_MESCLAGEM)) {
      const celulas = celulasDaMesclagem(m[1] ?? m[2] ?? '');
      celulasTotais += celulas;
      if (celulas > LIMITE_CELULAS_MESCLAGEM || celulasTotais > LIMITE_CELULAS_MESCLAGEM_TOTAL) {
        throw new ErroPlanilha(ERRO_MUITO_GRANDE);
      }
    }
  }
}
