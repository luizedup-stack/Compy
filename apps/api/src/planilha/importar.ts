import ExcelJS from 'exceljs';
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
import { ImagemInvalida, reduzirParaJpeg } from '../fotos/baixar';
import { conferirZip } from './conferirZip';
import { ErroPlanilha } from './erroPlanilha';

export { ErroPlanilha };
export {
  LIMITE_CELULAS_MESCLAGEM,
  LIMITE_CELULAS_MESCLAGEM_TOTAL,
  LIMITE_ENTRADA_BYTES,
  LIMITE_TOTAL_BYTES,
} from './conferirZip';
export type { RelatorioImportacao };
export type Ator = { papel: 'admin' } | { papel: 'mercado'; mercadoId: number };

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

/** Quantas imagens coladas numa planilha o servidor aceita (cada uma é reduzida e guardada). */
const MAXIMO_IMAGENS_POR_PLANILHA = 100;

/**
 * Imagens COLADAS na planilha (Inserir > Imagem, posta sobre a célula da coluna Foto): cada uma é da linha em que está ancorada.
 * Devolve a imagem já reduzida (JPEG pequeno) por código de barras; o que não der certo vira aviso no relatório e o produto entra do mesmo jeito.
 * Imagem fora da coluna Foto (um logotipo no topo, por exemplo) é ignorada.
 */
async function lerImagensDaPlanilha(
  wb: ExcelJS.Workbook,
  aba: ExcelJS.Worksheet,
  colunaFoto: number | undefined,
  linhas: Map<number, string>,
  erros: RelatorioImportacao['erros'],
): Promise<Map<string, string>> {
  const imagens = new Map<string, string>();
  let lidas = 0;
  for (const colada of aba.getImages()) {
    const linha = Math.floor(colada.range.tl.nativeRow) + 1;
    const coluna = Math.floor(colada.range.tl.nativeCol) + 1;
    if (colunaFoto !== undefined && coluna !== colunaFoto) continue;
    const codigo = linhas.get(linha);
    if (codigo === undefined) continue;
    if (++lidas > MAXIMO_IMAGENS_POR_PLANILHA) {
      erros.push({ linha, motivo: `Foto ignorada: a planilha tem imagens demais (o limite é ${MAXIMO_IMAGENS_POR_PLANILHA})` });
      continue;
    }
    try {
      const bytes = wb.getImage(Number(colada.imageId))?.buffer;
      if (!bytes) throw new ImagemInvalida('imagem vazia');
      imagens.set(codigo, await reduzirParaJpeg(Buffer.from(bytes)));
    } catch {
      erros.push({ linha, motivo: 'Foto ignorada: não consegui ler a imagem colada nesta linha' });
    }
  }
  return imagens;
}

/** Nomes aceitos para a coluna opcional com o link da foto do produto (comparados sem acento e sem maiúsculas). */
const NOMES_COLUNA_FOTO = ['foto', 'link da foto', 'imagem', 'link da imagem', 'url da foto'];
const LINK_DE_FOTO_VALIDO = /^https:\/\/\S{4,990}$/i;

/** O link da foto: se a célula é um hiperlink do Excel (texto + endereço), vale o endereço, não o texto que aparece. */
function linkDaFoto(valor: unknown): string {
  if (valor && typeof valor === 'object' && typeof (valor as { hyperlink?: unknown }).hyperlink === 'string') {
    return ((valor as { hyperlink: string }).hyperlink).trim();
  }
  return texto(valor);
}

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
  // Coluna opcional "Foto" (link da imagem do produto): quem não tem não precisa preencher.
  const colunaFoto = NOMES_COLUNA_FOTO.map(coluna).find((n) => n !== undefined);

  const validas = new Map<string, LinhaValida>();
  const fotos = new Map<string, string>(); // código de barras -> link da foto (só de linhas válidas)
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
    const linkFoto = linkDaFoto(celula(colunaFoto));
    if (linkFoto !== '') {
      if (LINK_DE_FOTO_VALIDO.test(linkFoto)) fotos.set(barras.codigo, linkFoto);
      // Foto com problema não derruba o produto: ele entra, só a foto é ignorada (o relatório avisa).
      else erros.push({ linha: numeroLinha, motivo: `Foto ignorada: o link precisa começar com https:// (${linkFoto.slice(0, 40)})` });
    } else fotos.delete(barras.codigo); // a última ocorrência do código vale, também para a foto
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
  // Linha da planilha -> código de barras (só a linha que vale de cada produto): serve para achar de que produto é cada imagem colada.
  const linhas = new Map<number, string>([...validas.values()].map((v) => [v.linha, v.oferta.codigoBarras]));
  return { ofertas: [...validas.values()].map((v) => v.oferta), fotos, erros, linhas, colunaFoto };
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

    // Papel mercado: as ofertas vão para o mercado DELE e a aba "Mercado" da planilha é ignorada. O nome, o endereço
    // completo e o telefone ficam na tela "Meu mercado"; uma planilha não pode sobrescrevê-los nem apontar para outro mercado.
    const proprio = await r.acharMercado(ator.mercadoId);
    if (!proprio || proprio.status !== 'ativo') throw new ErroPlanilha('Mercado não encontrado ou inativo');
    return { mercado: proprio, criado: false };
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
  await conferirZip(arquivo);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arquivo as unknown as ArrayBuffer);
  } catch {
    throw new ErroPlanilha('Arquivo inválido: envie uma planilha .xlsx');
  }
  const dadosMercado = lerMercado(encontrarAba(wb, ABA_MERCADO));
  const abaProdutos = encontrarAba(wb, ABA_PRODUTOS);
  const { ofertas, fotos, erros, linhas, colunaFoto } = lerProdutos(abaProdutos);
  const imagens = await lerImagensDaPlanilha(wb, abaProdutos, colunaFoto, linhas, erros);
  erros.sort((a, b) => a.linha - b.linha);

  return repo.transacao(async (r) => {
    const { mercado, criado } = await resolverMercado(r, ator, dadosMercado);
    const agora = new Date();
    await r.salvarOfertas(ofertas.map((oferta) => ({ ...oferta, mercadoId: mercado.id, precoAtualizadoEm: agora })));
    // Fotos do mercado: links (o servidor baixa depois, veja fotos/gerenciador.ts) e imagens coladas (já prontas). Imagem e link na
    // mesma linha: vale a imagem. Onde o produto já tem foto de verdade de outro, a do mercado fica só para ele.
    await r.salvarFotosDaPlanilha([...fotos].filter(([codigo]) => !imagens.has(codigo)), mercado.id, agora);
    const prontas = [...imagens].map(([codigoBarras, imagem]) => ({ codigoBarras, imagem }));
    for (const { codigoBarras, imagem } of prontas) {
      // A mesma regra da foto enviada pelo painel: sem foto de verdade, vira a de todos; com foto de outro, fica só do mercado.
      const jaTem = (await r.listarResumoDeFotos([codigoBarras])).some((f) => f.origem !== 'ilustrativa');
      const atual = jaTem ? await r.acharFoto(codigoBarras) : null;
      const eDono = atual?.origem === 'mercado' && atual.mercadoId === mercado.id;
      if (jaTem && !eDono) {
        await r.salvarFotoDoMercado({ codigoBarras, mercadoId: mercado.id, imagem, atualizadaEm: agora });
      } else {
        await r.salvarFoto({ codigoBarras, origem: 'mercado', url: null, imagem, mercadoId: mercado.id, atualizadaEm: agora });
        await r.removerFotoDoMercado(mercado.id, codigoBarras);
      }
    }
    return { mercadoId: mercado.id, mercadoCriado: criado, importadas: ofertas.length, erros, ...(prontas.length > 0 ? { fotosColadas: prontas.length } : {}) };
  });
}
