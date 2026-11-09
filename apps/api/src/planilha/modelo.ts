import ExcelJS from 'exceljs';
import { ABA_MERCADO, ABA_PRODUTOS, COLUNAS_PRODUTOS, LIMITE_LINHAS } from '@mercado/shared';

const ABA_INSTRUCOES = 'Instruções';
const OBRIGATORIAS = 3;

export async function gerarModelo(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const mercado = wb.addWorksheet(ABA_MERCADO);
  mercado.addRow(['Nome do mercado*']);
  mercado.addRow(['Endereço*']);
  mercado.getColumn(1).width = 24;
  mercado.getColumn(2).width = 50;
  mercado.getColumn(1).font = { bold: true };

  // "Foto" é opcional (link da imagem do produto) e não faz parte das colunas obrigatórias do pacote compartilhado.
  const cabecalho = [...COLUNAS_PRODUTOS.map((nome, i) => (i < OBRIGATORIAS ? `${nome}*` : nome)), 'Foto'];
  const produtos = wb.addWorksheet(ABA_PRODUTOS);
  produtos.addRow(cabecalho).font = { bold: true };
  const larguras = [20, 40, 12, 16, 20, 14, 50];
  larguras.forEach((largura, i) => {
    produtos.getColumn(i + 1).width = largura;
  });
  // Código de barras como texto: o Excel não pode converter o número para notação científica.
  produtos.getColumn(1).numFmt = '@';

  const instrucoes = wb.addWorksheet(ABA_INSTRUCOES);
  instrucoes.getColumn(1).width = 110;
  [
    'Modelo de planilha do Compy',
    '',
    `1. Na aba "${ABA_MERCADO}", preencha o nome e o endereço do mercado na coluna B.`,
    `2. Na aba "${ABA_PRODUTOS}", uma linha por produto. Colunas com * são obrigatórias.`,
    '3. Código de barras: 8, 12 ou 13 dígitos. Formate a coluna como texto para o Excel não alterar o número.',
    '4. Preço: use vírgula ou ponto nos centavos, por exemplo 5,49.',
    '5. Quantidade: texto livre como "1 L", "500 g" ou "12 rolos". Permite comparar o preço por unidade.',
    '6. Disponível: sim ou não. Em branco vale sim.',
    `7. Até ${LIMITE_LINHAS} produtos por planilha. Enviar de novo atualiza os preços; a planilha sempre vale mais.`,
    '8. Foto (opcional), de dois jeitos: (a) o link (começando com https://) da imagem do produto, que o sistema baixa e guarda; ou (b) a imagem COLADA na célula da coluna Foto, na linha do produto (Inserir > Imagem, deixando a imagem sobre a célula; até 100 imagens coladas por planilha, para mais fotos use links). Sem foto, o sistema procura sozinho pelo código de barras, e você também pode enviar a foto no painel.',
    '9. Se o produto ainda não tem foto de verdade, a sua passa a valer para todos. Se já tem (de outro mercado ou do banco aberto), a que existia continua para os outros e a sua fica guardada para o seu mercado.',
    '10. Esta aba de instruções é ignorada na importação.',
    '',
    'DICA: se a planilha do seu mercado é diferente deste modelo, peça a uma IA (ChatGPT, Claude, Gemini...) para ajustá-la. Envie a SUA planilha e este modelo juntos e escreva, por exemplo:',
    '"Reorganize a minha planilha para ficar igual ao modelo anexo: mesma aba \'Mercado\' e aba \'Produtos\' com as colunas Código de barras, Produto, Preço, Quantidade, Categoria, Disponível e Foto, nesta ordem. Código de barras como texto, preço com vírgula, e não invente nenhum dado."',
    'Depois confira a planilha pronta (principalmente códigos de barras e preços) antes de enviar. Não envie dados pessoais seus ou de clientes para a IA: só a lista de produtos.',
    '',
    'Exemplo de linha da aba Produtos:',
  ].forEach((texto) => instrucoes.addRow([texto]));
  instrucoes.getRow(1).font = { bold: true, size: 14 };
  instrucoes.addRow([cabecalho.join(' | ')]).font = { bold: true };
  instrucoes.addRow(['7891000100103 | Leite integral 1 L | 5,49 | 1 L | Laticínios | sim | https://exemplo.com/fotos/leite.jpg']);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
