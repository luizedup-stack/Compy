import ExcelJS from 'exceljs';
import { Unzip, UnzipInflate } from 'fflate';
import {
  ABA_MERCADO,
  ABA_PRODUTOS,
  COLUNAS_PRODUTOS,
  LIMITE_BYTES,
  LIMITE_LINHAS,
  normalizarTexto,
  parsePreco,
  parseQuantidade,
  validarCodigoBarras,
  type RelatorioImportacao,
} from '@mercado/shared';
import { ErroMercadoDuplicado, type Mercado, type OfertaArmazenada, type Repositorio } from '../repositorio';

export type { RelatorioImportacao };
export type Ator = { papel: 'admin' } | { papel: 'mercado'; mercadoId: number };

/** Erro do arquivo inteiro: a mensagem está em português e pode ser mostrada ao usuário. */
export class ErroPlanilha extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroPlanilha';
  }
}

// Limites de R14: o xlsx é um zip e o exceljs cria uma célula para cada célula de cada mesclagem.
export const LIMITE_ENTRADA_BYTES = 20 * 1024 * 1024;
export const LIMITE_TOTAL_BYTES = 30 * 1024 * 1024;
export const LIMITE_CELULAS_MESCLAGEM = 10_000;
export const LIMITE_CELULAS_MESCLAGEM_TOTAL = 50_000;

const ERRO_ARQUIVO_INVALIDO = 'Arquivo inválido: envie uma planilha .xlsx';
const ERRO_MUITO_GRANDE = 'Planilha grande demais para ser importada';
const PADRAO_MESCLAGEM = /<(?:\w+:)?mergeCell\b[^>]*?\sref=["']([^"']+)["']/g;

function numeroDaColuna(letras: string): number {
  return [...letras].reduce((acc, letra) => acc * 26 + letra.charCodeAt(0) - 64, 0);
}

function celulasDaMesclagem(ref: string): number {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(ref.trim());
  if (!m) return 0;
  const [c1, l1] = [numeroDaColuna(m[1]!.toUpperCase()), Number(m[2])];
  const [c2, l2] = m[3] ? [numeroDaColuna(m[3].toUpperCase()), Number(m[4])] : [c1, l1];
  return (Math.abs(c2 - c1) + 1) * (Math.abs(l2 - l1) + 1);
}

/**
 * Examina o zip ANTES do exceljs: descompacta em fluxo contando os bytes realmente gerados
 * (o tamanho declarado no cabeçalho pode mentir) e aborta ao passar dos limites; depois
 * confere o tamanho das mesclagens nas planilhas, sem criar nenhuma célula.
 */
function conferirZip(arquivo: Buffer): void {
  const planilhas: Uint8Array[][] = [];
  let total = 0;
  let entradas = 0;
  try {
    const zip = new Unzip();
    zip.register(UnzipInflate);
    zip.onfile = (entrada) => {
      entradas++;
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      const ehPlanilha = /^xl\/worksheets\/[^/]+\.xml$/i.test(entrada.name);
      if (ehPlanilha) planilhas.push(partes);
      entrada.ondata = (erro, pedaco) => {
        if (erro) throw erro;
        tamanho += pedaco.length;
        total += pedaco.length;
        if (tamanho > LIMITE_ENTRADA_BYTES || total > LIMITE_TOTAL_BYTES) throw new ErroPlanilha(ERRO_MUITO_GRANDE);
        if (ehPlanilha) partes.push(pedaco.slice());
      };
      entrada.start();
    };
    zip.push(new Uint8Array(arquivo), true);
  } catch (erro) {
    if (erro instanceof ErroPlanilha) throw erro;
    throw new ErroPlanilha(ERRO_ARQUIVO_INVALIDO);
  }
  if (entradas === 0) throw new ErroPlanilha(ERRO_ARQUIVO_INVALIDO);

  let celulasTotais = 0;
  for (const partes of planilhas) {
    const xml = Buffer.concat(partes).toString('utf8');
    for (const m of xml.matchAll(PADRAO_MESCLAGEM)) {
      const celulas = celulasDaMesclagem(m[1]!);
      celulasTotais += celulas;
      if (celulas > LIMITE_CELULAS_MESCLAGEM || celulasTotais > LIMITE_CELULAS_MESCLAGEM_TOTAL) {
        throw new ErroPlanilha(ERRO_MUITO_GRANDE);
      }
    }
  }
}

type Primitivo = string | number | null;

/** Reduz qualquer valor de célula do exceljs (texto rico, fórmula, link, data...) a texto ou número. */
function primitivo(valor: unknown): Primitivo {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' || typeof valor === 'number') return valor;
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor !== 'object') return null;
  const objeto = valor as Record<string, unknown>;
  if (Array.isArray(objeto.richText)) {
    return (objeto.richText as { text?: string }[]).map((parte) => parte.text ?? '').join('');
  }
  if ('result' in objeto) return primitivo(objeto.result);
  if ('formula' in objeto || 'sharedFormula' in objeto) return null;
  if ('text' in objeto) return primitivo(objeto.text);
  if ('error' in objeto) return String(objeto.error);
  return null;
}

const texto = (valor: unknown): string => String(primitivo(valor) ?? '').trim();

const DISPONIVEL: Record<string, boolean> = {
  sim: true, s: true, true: true, '1': true,
  nao: false, n: false, false: false, '0': false,
};

interface LinhaValida {
  linha: number;
  oferta: Omit<OfertaArmazenada, 'mercadoId' | 'precoAtualizadoEm'>;
}

function encontrarAba(wb: ExcelJS.Workbook, nome: string): ExcelJS.Worksheet {
  const alvo = normalizarTexto(nome);
  const aba = wb.worksheets.find((w) => normalizarTexto(w.name) === alvo);
  if (!aba) throw new ErroPlanilha(`A aba "${nome}" não foi encontrada na planilha`);
  return aba;
}

function lerMercado(aba: ExcelJS.Worksheet): { nome: string; endereco: string } {
  const valores: Record<string, string> = {};
  aba.eachRow({ includeEmpty: false }, (linha) => {
    const rotulo = normalizarTexto(texto(linha.getCell(1).value));
    if ((rotulo === 'nome do mercado' || rotulo === 'endereco') && !(rotulo in valores)) {
      valores[rotulo] = texto(linha.getCell(2).value);
    }
  });
  const nome = valores['nome do mercado'];
  const endereco = valores['endereco'];
  if (!nome) throw new ErroPlanilha(`Aba "${ABA_MERCADO}": preencha o Nome do mercado (coluna B)`);
  if (!endereco) throw new ErroPlanilha(`Aba "${ABA_MERCADO}": preencha o Endereço (coluna B)`);
  return { nome, endereco };
}

function lerProdutos(aba: ExcelJS.Worksheet) {
  const colunas = new Map<string, number>();
  aba.getRow(1).eachCell({ includeEmpty: false }, (celula, numero) => {
    const chave = normalizarTexto(texto(celula.value));
    if (!colunas.has(chave)) colunas.set(chave, numero);
  });
  const coluna = (nome: string) => colunas.get(normalizarTexto(nome));
  const [codigo, produto, preco] = COLUNAS_PRODUTOS.slice(0, 3).map((nome) => {
    const numero = coluna(nome);
    if (numero === undefined) throw new ErroPlanilha(`A coluna "${nome}" não foi encontrada na aba "${ABA_PRODUTOS}"`);
    return numero;
  }) as [number, number, number];
  const [quantidade, categoria, disponivel] = COLUNAS_PRODUTOS.slice(3).map(coluna);

  const validas = new Map<string, LinhaValida>();
  const erros: RelatorioImportacao['erros'] = [];
  let preenchidas = 0;

  aba.eachRow({ includeEmpty: false }, (linha, numeroLinha) => {
    if (numeroLinha === 1) return;
    let vazia = true;
    linha.eachCell({ includeEmpty: false }, (c) => {
      if (texto(c.value) !== '') vazia = false;
    });
    if (vazia) return;
    if (++preenchidas > LIMITE_LINHAS) {
      throw new ErroPlanilha(`A planilha tem mais de ${LIMITE_LINHAS} linhas de produtos (o limite é ${LIMITE_LINHAS})`);
    }
    const celula = (numero: number | undefined) => (numero === undefined ? null : linha.getCell(numero).value);
    const falha = (motivo: string) => erros.push({ linha: numeroLinha, motivo });

    const bruto = primitivo(celula(codigo));
    const barras = validarCodigoBarras(typeof bruto === 'number' ? bruto : (bruto ?? ''));
    if (!barras.ok) return falha(barras.motivo);
    const nome = texto(celula(produto));
    if (!nome) return falha('Produto obrigatório');
    const valorPreco = primitivo(celula(preco));
    const precoOk = valorPreco === null ? null : parsePreco(valorPreco);
    if (precoOk === null) return falha(`Preço inválido: ${valorPreco ?? 'em branco'}`);
    const textoDisponivel = normalizarTexto(texto(celula(disponivel)));
    if (textoDisponivel !== '' && !(textoDisponivel in DISPONIVEL)) {
      return falha(`Valor inválido em "Disponível": ${textoDisponivel} (use sim ou não)`);
    }

    const anterior = validas.get(barras.codigo);
    if (anterior) {
      erros.push({
        linha: anterior.linha,
        motivo: `Código de barras duplicado: vale a última ocorrência (linha ${numeroLinha})`,
      });
    }
    const textoQuantidade = texto(celula(quantidade));
    const parseada = parseQuantidade(textoQuantidade || null);
    validas.set(barras.codigo, {
      linha: numeroLinha,
      oferta: {
        codigoBarras: barras.codigo,
        nome,
        nomeNorm: normalizarTexto(nome),
        preco: precoOk,
        quantidadeTexto: textoQuantidade || null,
        quantidadeValor: parseada?.valor ?? null,
        quantidadeUnidade: parseada?.unidade ?? null,
        categoria: texto(celula(categoria)) || null,
        disponivel: textoDisponivel === '' ? true : DISPONIVEL[textoDisponivel]!,
        promocaoPreco: null,
        promocaoInicio: null,
        promocaoFim: null,
      },
    });
  });

  erros.sort((a, b) => a.linha - b.linha);
  return { ofertas: [...validas.values()].map((v) => v.oferta), erros };
}

/** Só usa `r`, o repositório da transação (nunca o externo, que travaria esperando a si mesmo). */
async function resolverMercado(
  r: Repositorio,
  ator: Ator,
  dados: { nome: string; endereco: string },
): Promise<{ mercado: Mercado; criado: boolean }> {
  const nomeNorm = normalizarTexto(dados.nome);
  const enderecoNorm = normalizarTexto(dados.endereco);
  try {
    if (ator.papel === 'admin') {
      const existente = await r.acharMercadoPorChave(nomeNorm, enderecoNorm);
      if (existente?.status === 'removido') throw new ErroPlanilha('Este mercado foi removido e não aceita planilhas');
      if (existente) return { mercado: existente, criado: false };
      const mercado = await r.criarMercado({
        nome: dados.nome,
        endereco: dados.endereco,
        nomeNorm,
        enderecoNorm,
        status: 'ativo',
        contaSituacao: 'gratuita',
        usuarioId: null,
      });
      return { mercado, criado: true };
    }

    const proprio = await r.acharMercado(ator.mercadoId);
    if (!proprio || proprio.status !== 'ativo') throw new ErroPlanilha('Mercado não encontrado ou inativo');
    if (proprio.nome === dados.nome && proprio.endereco === dados.endereco) {
      return { mercado: proprio, criado: false };
    }
    const novos = { nome: dados.nome, endereco: dados.endereco, nomeNorm, enderecoNorm };
    await r.atualizarMercado(proprio.id, novos);
    return { mercado: { ...proprio, ...novos }, criado: false };
  } catch (erro) {
    if (erro instanceof ErroMercadoDuplicado) {
      throw new ErroPlanilha('Já existe outro mercado com este nome e endereço');
    }
    throw erro;
  }
}

export async function importarPlanilha(repo: Repositorio, arquivo: Buffer, ator: Ator): Promise<RelatorioImportacao> {
  if (arquivo.length > LIMITE_BYTES) {
    throw new ErroPlanilha(`Arquivo muito grande: o limite é ${LIMITE_BYTES / 1024 / 1024} MB`);
  }

  // Toda a leitura e validação acontece antes da transação; dentro dela só há escritas.
  conferirZip(arquivo);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arquivo as unknown as ArrayBuffer);
  } catch {
    throw new ErroPlanilha(ERRO_ARQUIVO_INVALIDO);
  }
  const dadosMercado = lerMercado(encontrarAba(wb, ABA_MERCADO));
  const { ofertas, erros } = lerProdutos(encontrarAba(wb, ABA_PRODUTOS));

  return repo.transacao(async (r) => {
    const { mercado, criado } = await resolverMercado(r, ator, dadosMercado);
    const agora = new Date();
    for (const oferta of ofertas) {
      await r.salvarOferta({ ...oferta, mercadoId: mercado.id, precoAtualizadoEm: agora });
    }
    return { mercadoId: mercado.id, mercadoCriado: criado, importadas: ofertas.length, erros };
  });
}
