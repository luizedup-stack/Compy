import ExcelJS from 'exceljs';
import { ABA_DESCONTOS, ABA_MERCADO, ABA_PRODUTOS, COLUNAS_DESCONTOS, COLUNAS_PRODUTOS, LIMITE_LINHAS } from '@mercado/shared';

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

  // Aba opcional de promoções. Cada linha é UMA promoção e é cobrada (o valor aparece no painel ao enviar).
  const descontos = wb.addWorksheet(ABA_DESCONTOS);
  descontos.addRow(COLUNAS_DESCONTOS.map((nome, i) => (i === 0 || i === 1 || i === 3 ? `${nome}*` : nome))).font = { bold: true };
  [20, 20, 16, 16].forEach((largura, i) => {
    descontos.getColumn(i + 1).width = largura;
  });
  descontos.getColumn(1).numFmt = '@';

  const instrucoes = wb.addWorksheet(ABA_INSTRUCOES);
  instrucoes.getColumn(1).width = 110;
  [
    'Modelo de planilha do Bolso Certo',
    '',
    `1. Na aba "${ABA_MERCADO}", preencha o nome e o endereço do mercado na coluna B.`,
    `2. Na aba "${ABA_PRODUTOS}", uma linha por produto. Colunas com * são obrigatórias.`,
    '3. Código de barras: 8, 12 ou 13 dígitos. Formate a coluna como texto para o Excel não alterar o número.',
    '4. Preço: use vírgula ou ponto nos centavos, por exemplo 5,49.',
    '5. Quantidade: texto livre como "1 L", "500 g" ou "12 rolos". Permite comparar o preço por unidade.',
    '6. Disponível: sim ou não. Em branco vale sim.',
    `7. Até ${LIMITE_LINHAS} produtos por planilha. Enviar de novo atualiza os preços; a planilha sempre vale mais.`,
    '8. Foto (opcional): o link (começando com https://) da imagem do produto. O sistema baixa e guarda a foto. Sem link, ele procura a foto sozinho pelo código de barras, e você também pode enviar a foto no painel.',
    `9. Aba "${ABA_DESCONTOS}" (opcional): cada linha é uma PROMOÇÃO, que é cobrada. Preencha o código de barras de um produto que está na aba "${ABA_PRODUTOS}" (ou já cadastrado), o preço promocional (menor que o normal), "Válido de" (opcional) e "Válido até" (obrigatório), no formato dia/mês/ano.`,
    '10. Planilha com promoções só vai ao ar depois que o pagamento das promoções é confirmado; antes disso, nada da planilha é salvo. Sem a aba Descontos (ou vazia), tudo é salvo na hora e sem custo.',
    '11. Esta aba de instruções é ignorada na importação.',
    '',
    'Exemplo de linha da aba Produtos:',
  ].forEach((texto) => instrucoes.addRow([texto]));
  instrucoes.getRow(1).font = { bold: true, size: 14 };
  instrucoes.addRow([cabecalho.join(' | ')]).font = { bold: true };
  instrucoes.addRow(['7891000100103 | Leite integral 1 L | 5,49 | 1 L | Laticínios | sim | https://exemplo.com/fotos/leite.jpg']);
  instrucoes.addRow(['']);
  instrucoes.addRow([`Exemplo de linha da aba ${ABA_DESCONTOS}:`]);
  instrucoes.addRow([`${COLUNAS_DESCONTOS.join(' | ')}`]).font = { bold: true };
  instrucoes.addRow(['7891000100103 | 4,99 | 10/11/2026 | 15/11/2026']);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
