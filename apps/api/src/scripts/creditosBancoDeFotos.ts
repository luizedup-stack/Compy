// Escreve dados/fotos-ilustrativas/CREDITOS.md a partir do índice do banco de fotos ilustrativas: de que produto do Open Food Facts
// veio a foto de cada tipo. As imagens do Open Food Facts têm licença Creative Commons BY-SA, que exige atribuição.
// Uso: npm run creditos-banco-de-fotos -w @mercado/api
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PASTA = path.resolve(__dirname, '../../dados/fotos-ilustrativas');
const indice = JSON.parse(readFileSync(path.join(PASTA, 'indice.json'), 'utf8')) as { id: string; busca: string; codigo?: string; origemUrl?: string }[];

const linhas = indice
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((e) => `| ${e.id} | \`${e.id}.jpg\` | ${e.codigo ? `[${e.codigo}](https://world.openfoodfacts.org/product/${e.codigo})` : '—'} |`);

writeFileSync(
  path.join(PASTA, 'CREDITOS.md'),
  `# Créditos das fotos ilustrativas

Cada foto deste banco é a imagem de um produto real do [Open Food Facts](https://world.openfoodfacts.org), um banco de dados aberto de produtos
feito por colaboradores. As imagens têm licença [Creative Commons BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/): podem ser usadas
com atribuição, e versões alteradas (aqui, reduzidas) mantêm a mesma licença. O app mostra "Fotos dos produtos: Open Food Facts (licença CC BY-SA)".

São fotos **ilustrativas**: servem para mostrar o TIPO do produto (leite, arroz...) quando ainda não há a foto do produto exato. O sistema as marca
como "ilustrativa" no app e no painel e as troca sozinho pela foto específica quando ela aparece.

| Tipo | Arquivo | Produto de origem no Open Food Facts |
|---|---|---|
${linhas.join('\n')}
`,
);
console.log(`CREDITOS.md escrito com ${indice.length} fotos.`);
