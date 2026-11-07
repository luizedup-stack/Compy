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
  return { ofertas: [...validas.values()].map((v) => v.oferta), fotos, erros };
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
  const { ofertas, fotos, erros } = lerProdutos(encontrarAba(wb, ABA_PRODUTOS));

  return repo.transacao(async (r) => {
    const { mercado, criado } = await resolverMercado(r, ator, dadosMercado);
    const agora = new Date();
    for (const oferta of ofertas) {
      await r.salvarOferta({ ...oferta, mercadoId: mercado.id, precoAtualizadoEm: agora });
    }
    // Fotos indicadas na planilha: o servidor baixa e guarda depois (veja fotos/gerenciador.ts). A foto que um mercado enviou à
    // mão pelo painel vale mais e não é trocada; um link já indicado antes (igual) também não é refeito.
    for (const [codigo, url] of fotos) {
      const atual = await r.acharFoto(codigo);
      if (atual?.origem === 'mercado' && atual.imagem !== null) continue;
      if (atual?.origem === 'planilha' && atual.url === url) continue;
      await r.salvarFoto({ codigoBarras: codigo, origem: 'planilha', url, imagem: null, mercadoId: mercado.id, atualizadaEm: agora });
    }
    return { mercadoId: mercado.id, mercadoCriado: criado, importadas: ofertas.length, erros };
  });
}
