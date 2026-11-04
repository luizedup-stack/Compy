import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import { ErroPlanilha } from './erroPlanilha';

// Limites (R14/R16/R17): o xlsx é um zip e o exceljs cria uma célula para cada célula de cada mesclagem.
export const LIMITE_ENTRADA_BYTES = 20 * 1024 * 1024;
export const LIMITE_TOTAL_BYTES = 30 * 1024 * 1024;
export const LIMITE_CELULAS_MESCLAGEM = 10_000;
export const LIMITE_CELULAS_MESCLAGEM_TOTAL = 50_000;

const ERRO_ARQUIVO_INVALIDO = 'Arquivo inválido: envie uma planilha .xlsx';
const ERRO_MUITO_GRANDE = 'Planilha grande demais para ser importada';

const PADRAO_REFERENCIA = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i;
// A mesma expressão (sem âncoras e com diferença entre maiúsculas e minúsculas) que o exceljs usa
// para decidir se uma entrada do zip é uma planilha.
const PADRAO_PLANILHA_EXCELJS = /xl\/worksheets\/sheet(\d+)[.]xml/;

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

interface Estado {
  /** Bytes descompactados de todas as entradas até agora. */
  bytes: number;
  /** Células cobertas por todas as mesclagens encontradas até agora. */
  celulas: number;
}

/**
 * Descompacta a entrada em fluxo, pedaço a pedaço, e para assim que passar do limite da entrada ou do
 * total. Cada pedaço também alimenta o mesmo tokenizador XML do exceljs (saxes), que reconhece as
 * mesclagens (elemento mergeCell, com ou sem prefixo, com `ref` já decodificado) em qualquer entrada,
 * seja qual for o nome. Nada é acumulado em memória além do estado do tokenizador.
 */
function lerEntrada(entrada: EntradaComFluxo, estado: Estado): Promise<void> {
  const ehPlanilhaDoExceljs = PADRAO_PLANILHA_EXCELJS.test(entrada.name.replace(/^\/+/, ''));
  return new Promise((resolve, reject) => {
    let encerrado = false;
    let tamanho = 0;
    const fluxo = entrada.internalStream('uint8array');

    const falhar = (erro: ErroPlanilha) => {
      if (encerrado) return;
      encerrado = true;
      fluxo.pause();
      reject(erro);
    };

    // Erro de sintaxe só interrompe a leitura desta entrada (peças binárias são normais).
    // Numa planilha do exceljs, vira "arquivo inválido" no fim.
    let erroXml = false;
    const parser = new SaxesParser();
    parser.on('error', () => {
      erroXml = true;
    });
    parser.on('opentag', (tag) => {
      if (tag.name.split(':').pop() !== 'mergeCell') return;
      const ref = (tag.attributes as Record<string, string>)['ref'];
      if (ref === undefined) return;
      const celulas = celulasDaMesclagem(ref);
      estado.celulas += celulas;
      if (celulas > LIMITE_CELULAS_MESCLAGEM || estado.celulas > LIMITE_CELULAS_MESCLAGEM_TOTAL) {
        falhar(new ErroPlanilha(ERRO_MUITO_GRANDE));
      }
    });
    const decodificador = new TextDecoder('utf-8');

    const alimentar = (texto: string) => {
      if (erroXml || encerrado) return;
      try {
        parser.write(texto);
      } catch {
        erroXml = true;
      }
    };

    fluxo.on('data', (pedaco) => {
      if (encerrado) return;
      tamanho += pedaco.length;
      estado.bytes += pedaco.length;
      if (tamanho > LIMITE_ENTRADA_BYTES || estado.bytes > LIMITE_TOTAL_BYTES) {
        falhar(new ErroPlanilha(ERRO_MUITO_GRANDE));
        return;
      }
      alimentar(decodificador.decode(pedaco, { stream: true }));
    });
    fluxo.on('end', () => {
      if (encerrado) return;
      alimentar(decodificador.decode());
      if (!erroXml && !encerrado) {
        try {
          parser.close();
        } catch {
          erroXml = true;
        }
      }
      if (encerrado) return;
      if (erroXml && ehPlanilhaDoExceljs) {
        falhar(new ErroPlanilha(ERRO_ARQUIVO_INVALIDO));
        return;
      }
      encerrado = true;
      resolve();
    });
    fluxo.on('error', () => falhar(new ErroPlanilha(ERRO_ARQUIVO_INVALIDO)));
    fluxo.resume();
  });
}

/**
 * Examina o zip ANTES do exceljs, lendo-o como o exceljs (JSZip, diretório central): descompacta cada
 * entrada em fluxo contando os bytes realmente gerados (tamanhos declarados não são confiáveis), aborta
 * ao passar dos limites e confere o tamanho das mesclagens sem criar nenhuma célula.
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

  const estado: Estado = { bytes: 0, celulas: 0 };
  try {
    for (const entrada of entradas) {
      await lerEntrada(entrada, estado);
      contador.bytes = estado.bytes;
    }
  } finally {
    contador.bytes = estado.bytes;
  }
}
