// Gera as planilhas (aba Mercado + aba Produtos) a partir dos JSON em dados-reais/.
// Uso: node ferramentas/coleta/gerar-planilhas.mjs
import ExcelJS from 'exceljs';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REDES = [
  { arquivo: 'atacadao', saida: 'mercado-atacadao.xlsx', nome: 'Atacadão (preços do site)', endereco: 'Preços públicos do site atacadao.com.br, sem loja definida – São Paulo – SP' },
  { arquivo: 'carrefour', saida: 'mercado-carrefour.xlsx', nome: 'Carrefour Mercado (preços do site)', endereco: 'Preços públicos do site mercado.carrefour.com.br, sem loja definida – São Paulo – SP' },
  // Redes coletadas por ferramentas/coleta/coletar-vtex.mjs (catálogo público do próprio site).
  { arquivo: 'mambo', saida: 'mercado-mambo.xlsx', nome: 'Mambo (preços do site)', endereco: 'Preços públicos do site mambo.com.br, sem loja definida – São Paulo – SP' },
  { arquivo: 'savegnago', saida: 'mercado-savegnago.xlsx', nome: 'Savegnago (preços do site)', endereco: 'Preços públicos do site savegnago.com.br, sem loja definida – São Paulo – SP' },
  { arquivo: 'samsclub', saida: 'mercado-samsclub.xlsx', nome: "Sam's Club (preços do site)", endereco: 'Preços públicos do site samsclub.com.br, sem loja definida – São Paulo – SP' },
  { arquivo: 'oba', saida: 'mercado-oba.xlsx', nome: 'Oba Hortifruti (preços do site)', endereco: 'Preços públicos do site obahortifruti.com.br, sem loja definida – São Paulo – SP' },
  { arquivo: 'covabra', saida: 'mercado-covabra.xlsx', nome: 'Covabra Supermercados (preços do site)', endereco: 'Preços públicos do site covabra.com.br, sem loja definida – Campinas – SP' },
  { arquivo: 'hortifruti', saida: 'mercado-hortifruti.xlsx', nome: 'Hortifruti Natural da Terra (preços do site)', endereco: 'Preços públicos do site hortifruti.com.br, sem loja definida – São Paulo – SP' },
  // O Assaí bloqueia a coleta automática (proteção anti-robô): a planilha sai só com a aba Mercado e o cabeçalho, pronta para ser
  // preenchida à mão ou por uma fonte autorizada pela rede. Sem produtos, o importador a recusa: preencha antes de enviar.
  { arquivo: 'assai', saida: 'mercado-assai.xlsx', nome: 'Assaí Atacadista (preços do site)', endereco: 'Preços do Assaí Atacadista, sem loja definida – São Paulo – SP', modelo: true },
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

/** O importador aceita até 5.000 linhas por planilha (LIMITE_LINHAS em packages/shared); ficamos abaixo disso. */
const LINHAS_POR_ARQUIVO = 4500;

for (const rede of REDES) {
  const caminho = new URL(`../../dados-reais/${rede.arquivo}.json`, import.meta.url);
  if (!existsSync(caminho) && !rede.modelo) continue;
  const itens = existsSync(caminho) ? JSON.parse(readFileSync(caminho, 'utf8')) : [];

  // Redes grandes viram vários arquivos com a MESMA aba "Mercado": o servidor junta todos no mesmo mercado
  // (a chave é nome + endereço), cada arquivo acrescenta/atualiza os produtos dele.
  const partes = [];
  for (let i = 0; i < itens.length; i += LINHAS_POR_ARQUIVO) partes.push(itens.slice(i, i + LINHAS_POR_ARQUIVO));
  if (partes.length === 0 && rede.modelo) partes.push([]); // modelo vazio (Assaí): só a aba Mercado e o cabeçalho
  if (partes.length === 0) continue;

  // Apaga as planilhas antigas desta rede (assim não sobra uma parte velha de uma coleta anterior).
  const pasta = fileURLToPath(new URL('../../dados-reais/', import.meta.url));
  const base = rede.saida.replace(/\.xlsx$/, '');
  for (const nome of readdirSync(pasta)) {
    if (nome === rede.saida || new RegExp(`^${base}-parte-\\d+\\.xlsx$`).test(nome)) rmSync(pasta + nome);
  }

  for (const [indice, parte] of partes.entries()) {
    const wb = new ExcelJS.Workbook();
    const m = wb.addWorksheet('Mercado');
    m.addRow(['Nome do mercado', rede.nome]);
    m.addRow(['Endereço', rede.endereco]);
    m.getColumn(1).width = 20; m.getColumn(2).width = 80;
    const p = wb.addWorksheet('Produtos');
    p.addRow(['Código de barras*', 'Produto*', 'Preço*', 'Quantidade', 'Categoria', 'Disponível', 'Foto']);
    p.getColumn(1).numFmt = '@';
    for (const it of parte) {
      // Quantidade: a que aparece no nome; se não houver e o item é vendido por peso (kg), o preço é por kg.
      const quantidade = quantidadeDoNome(it.nome) || (it.medida === 'kg' ? '1 kg' : '');
      const r = p.addRow([it.ean, it.nome, it.preco, quantidade, it.categoria, 'sim', it.foto ?? '']);
      r.getCell(1).numFmt = '@';
      r.getCell(3).numFmt = '0.00';
    }
    p.columns.forEach((c, i) => { c.width = [18, 60, 10, 14, 24, 11, 60][i]; });
    const nomeArquivo = partes.length === 1 ? rede.saida : `${base}-parte-${String(indice + 1).padStart(2, '0')}.xlsx`;
    await wb.xlsx.writeFile(pasta + nomeArquivo);
    console.log(nomeArquivo, parte.length, 'produtos,', parte.filter((i) => i.foto).length, 'com link de foto');
  }
}
