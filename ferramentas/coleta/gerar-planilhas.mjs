// Gera as planilhas (aba Mercado + aba Produtos) a partir dos JSON em dados-reais/.
// Uso: node ferramentas/coleta/gerar-planilhas.mjs
import ExcelJS from 'exceljs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REDES = [
  { arquivo: 'atacadao', saida: 'mercado-atacadao.xlsx', nome: 'Atacadão (preços do site)', endereco: 'Preços públicos do site atacadao.com.br, sem loja definida – São Paulo – SP' },
  { arquivo: 'carrefour', saida: 'mercado-carrefour.xlsx', nome: 'Carrefour Mercado (preços do site)', endereco: 'Preços públicos do site mercado.carrefour.com.br, sem loja definida – São Paulo – SP' },
];

// Procura "500g", "1,5 L", "12 x 350 ml", "12 un" no nome do produto. Devolve texto ou ''.
const UNID = '(?:kg|g|mg|ml|l|lt|litros?|un|und|unid|unidades?|rolos?|dz)';
const RE_QTD = new RegExp(String.raw`(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(${UNID})\b`, 'gi');
function quantidadeDoNome(nome) {
  let ultima = null;
  for (const m of nome.matchAll(RE_QTD)) ultima = m;
  if (!ultima) return '';
  const [, mult, num, un] = ultima;
  return `${mult ? mult + ' x ' : ''}${num} ${un.toLowerCase().replace(/^lt$|^litros?$/, 'l')}`;
}

for (const rede of REDES) {
  const caminho = new URL(`../../dados-reais/${rede.arquivo}.json`, import.meta.url);
  if (!existsSync(caminho)) continue;
  const itens = JSON.parse(readFileSync(caminho, 'utf8'));
  const wb = new ExcelJS.Workbook();
  const m = wb.addWorksheet('Mercado');
  m.addRow(['Nome do mercado', rede.nome]);
  m.addRow(['Endereço', rede.endereco]);
  m.getColumn(1).width = 20; m.getColumn(2).width = 80;
  const p = wb.addWorksheet('Produtos');
  p.addRow(['Código de barras*', 'Produto*', 'Preço*', 'Quantidade', 'Categoria', 'Disponível']);
  p.getColumn(1).numFmt = '@';
  for (const it of itens) {
    const r = p.addRow([it.ean, it.nome, it.preco, quantidadeDoNome(it.nome), it.categoria, 'sim']);
    r.getCell(1).numFmt = '@';
    r.getCell(3).numFmt = '0.00';
  }
  p.columns.forEach((c, i) => { c.width = [18, 60, 10, 14, 24, 11][i]; });
  await wb.xlsx.writeFile(fileURLToPath(new URL(`../../dados-reais/${rede.saida}`, import.meta.url)));
  console.log(rede.saida, itens.length, 'produtos');
}
