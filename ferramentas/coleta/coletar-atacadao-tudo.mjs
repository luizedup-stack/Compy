// Coleta o catálogo COMPLETO do Atacadão pela API pública de catálogo do próprio site (a mesma que o site usa), categoria por categoria.
// Uso: node ferramentas/coleta/coletar-atacadao-tudo.mjs        (USAR_CURL=1 se o Node do seu ambiente não enxerga o proxy)
// Gentil: 1 requisição por vez, ~0,8 s entre elas. Preço = o que o site mostra sem escolher loja. Pode ser interrompido e rodado
// de novo: continua de onde parou (as categorias já feitas ficam em dados-reais/atacadao.progresso.json).
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { urlDaFoto } from './foto.mjs';

const BASE = 'https://www.atacadao.com.br/io/api/catalog_system/pub';
const UA = 'Mozilla/5.0 (BolsoCerto coleta de teste)';
const POR_PAGINA = 50;
const LIMITE_DA_API = 2500; // a API do site não entrega além disso por consulta: categorias maiores são divididas em subcategorias
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const arquivoDados = new URL('../../dados-reais/atacadao.json', import.meta.url);
const arquivoProgresso = new URL('../../dados-reais/atacadao.progresso.json', import.meta.url);

const execArquivo = promisify(execFile);
async function pedir(caminho) {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      let status; let texto;
      if (process.env.USAR_CURL === '1') {
        const { stdout } = await execArquivo('curl', ['-s', '-m', '40', '-A', UA, '-w', '\n%{http_code}', `${BASE}${caminho}`], { maxBuffer: 80e6 });
        const i = stdout.lastIndexOf('\n'); texto = stdout.slice(0, i); status = Number(stdout.slice(i + 1));
      } else {
        const r = await fetch(`${BASE}${caminho}`, { headers: { 'User-Agent': UA } }); status = r.status; texto = await r.text();
      }
      if (status === 200 || status === 206) return JSON.parse(texto);
      if (status === 404) return [];
      if (status === 429 || status >= 500) { await esperar(5000 * (tentativa + 1)); continue; }
      console.error('HTTP', status, caminho); return [];
    } catch (e) { await esperar(3000); }
  }
  return null; // não conseguiu: a categoria fica para a próxima rodada
}

const arvore = await pedir('/category/tree/4');
if (!arvore) throw new Error('Não consegui ler a lista de categorias do site.');
// Cada categoria "folha" (sem filhas) é consultada por inteiro; se uma folha for maior que o limite da API, sobra o que couber.
const folhas = [];
// O filtro do site usa o caminho completo da categoria ("C:/2/18/19/"), não só o número dela.
(function andar(nos, caminho) { for (const n of nos) { const c = `${caminho}/${n.id}`; if (n.children?.length) andar(n.children, c); else folhas.push({ id: c, nome: n.name }); } })(arvore, '');
console.log('categorias folha:', folhas.length);

const porEan = new Map(existsSync(arquivoDados) ? JSON.parse(readFileSync(arquivoDados, 'utf8')).map((p) => [p.ean, p]) : []);
const feitas = new Set(existsSync(arquivoProgresso) ? JSON.parse(readFileSync(arquivoProgresso, 'utf8')) : []);
const salvar = () => { writeFileSync(arquivoDados, JSON.stringify([...porEan.values()], null, 1)); writeFileSync(arquivoProgresso, JSON.stringify([...feitas])); };

let n = 0;
for (const folha of folhas) {
  if (feitas.has(folha.id)) continue;
  let completa = true;
  for (let de = 0; de < LIMITE_DA_API; de += POR_PAGINA) {
    const lista = await pedir(`/products/search?fq=C:${folha.id}/&_from=${de}&_to=${de + POR_PAGINA - 1}`);
    if (lista === null) { completa = false; break; }
    for (const p of lista) {
      for (const it of p.items ?? []) {
        const oferta = it.sellers?.[0]?.commertialOffer;
        if (!oferta || !(oferta.Price > 0) || !(oferta.AvailableQuantity > 0)) continue;
        const ean = String(it.ean ?? '').trim();
        if (!/^\d{8}$|^\d{13}$/.test(ean) || porEan.has(ean)) continue;
        porEan.set(ean, {
          ean, nome: p.productName, marca: p.brand, preco: oferta.Price,
          categoria: (p.categories?.[0] ?? '').split('/').filter(Boolean)[0] ?? folha.nome,
          url: p.link,
          foto: urlDaFoto(it.images?.map((i) => i.imageUrl)),
        });
      }
    }
    await esperar(800);
    if (lista.length < POR_PAGINA) break;
  }
  if (completa) feitas.add(folha.id);
  if (++n % 10 === 0) { salvar(); console.log(`${feitas.size}/${folhas.length} categorias, ${porEan.size} produtos`); }
}
salvar();
console.log('total', porEan.size, 'produtos;', feitas.size, 'de', folhas.length, 'categorias completas');
