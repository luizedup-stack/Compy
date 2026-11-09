// Coleta o máximo possível do Carrefour Mercado: visita as páginas de produto listadas no sitemap oficial do site e lê os dados
// estruturados (nome, código de barras, preço, foto) que a própria página publica. Não contorna bloqueio nenhum: se o site recusar
// (403/429), para e avisa.
// Uso: node ferramentas/coleta/coletar-carrefour-tudo.mjs [limite de produtos]     (USAR_CURL=1 se o Node não enxerga o proxy)
// São ~43 mil páginas, então leva horas: pode ser interrompido (Ctrl+C) e rodado de novo, que continua de onde parou
// (páginas já vistas ficam em dados-reais/carrefour.progresso.json). Gentil: 2 requisições por vez (CONCORRENCIA=4 para mais rápido), ~0,6 s de pausa em cada.
// As páginas cujo endereço parece de supermercado (arroz, leite, detergente...) vêm primeiro.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { urlDaFoto } from './foto.mjs';

const LIMITE = Number(process.argv[2] ?? 1_000_000);
const UA = 'Mozilla/5.0 (BolsoCerto coleta de teste)';
const PARALELO = Number(process.env.CONCORRENCIA ?? 2);
const PAUSA_MS = 600;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const PALAVRAS = /(^|-)(arroz|feijao|macarrao|farinha|acucar|sal|oleo|azeite|cafe|leite|achocolatado|biscoito|bolacha|molho|extrato|milho|ervilha|sardinha|atum|fuba|aveia|granola|cereal|margarina|manteiga|requeijao|queijo|presunto|mortadela|salsicha|linguica|hamburguer|iogurte|suco|refrigerante|agua|cerveja|vinagre|maionese|ketchup|mostarda|tempero|caldo|gelatina|sabao|detergente|amaciante|desinfetante|esponja|papel|guardanapo|shampoo|condicionador|sabonete|creme|desodorante|absorvente|fralda|racao|cha|chocolate|bala|amendoim|pipoca|lentilha|palmito|azeitona)(-|$)/;
const GRUPOS = /^\/(Mercearia|Bebidas|Limpeza|Higiene|Perfumaria|Alimentos|Congelados|Frios|Laticínios|Padaria|Pet|Bebê|Cuidados|Matinais|Biscoitos|Doces|Enlatados|Molhos|Cereais|Hortifruti|Açougue|Mercado)/i;
const arquivoDados = new URL('../../dados-reais/carrefour.json', import.meta.url);
const arquivoProgresso = new URL('../../dados-reais/carrefour.progresso.json', import.meta.url);

const execArquivo = promisify(execFile);
async function pegar(url) {
  if (process.env.USAR_CURL === '1') {
    const { stdout } = await execArquivo('curl', ['-s', '-L', '-m', '40', '-A', UA, '-w', '\n%{http_code}', url], { maxBuffer: 30e6 });
    const i = stdout.lastIndexOf('\n');
    return { status: Number(stdout.slice(i + 1)), texto: stdout.slice(0, i) };
  }
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  return { status: r.status, texto: await r.text() };
}

const achados = new Map(existsSync(arquivoDados) ? JSON.parse(readFileSync(arquivoDados, 'utf8')).map((x) => [x.ean, x]) : []);
const vistas = new Set(existsSync(arquivoProgresso) ? JSON.parse(readFileSync(arquivoProgresso, 'utf8')) : []);
const salvar = () => { writeFileSync(arquivoDados, JSON.stringify([...achados.values()], null, 1)); writeFileSync(arquivoProgresso, JSON.stringify([...vistas])); };

const urls = [];
for (let n = 0; n < 43; n++) {
  try {
    const { status, texto } = await pegar(`https://mercado.carrefour.com.br/sitemap/product-${n}.xml`);
    if (status !== 200) { console.error('sitemap', n, 'HTTP', status); continue; }
    for (const m of texto.matchAll(/<loc>(https:\/\/mercado.carrefour.com.br\/([^<]*?)\/p)<\/loc>/g)) urls.push({ u: m[1], doSuper: PALAVRAS.test(m[2]) });
  } catch (e) { console.error('sitemap', n, e.message); }
  await esperar(250);
}
urls.sort((a, b) => Number(b.doSuper) - Number(a.doSuper));
const fila = urls.filter((x) => !vistas.has(x.u));
console.log(`páginas no sitemap: ${urls.length}; já vistas: ${vistas.size}; faltam ${fila.length}; produtos já guardados: ${achados.size}`);

let parar = false;
let feitas = 0;
async function trabalhador() {
  while (!parar && achados.size < LIMITE) {
    const item = fila.shift();
    if (!item) return;
    try {
      const { status, texto } = await pegar(item.u);
      if (status === 403 || status === 429) { console.error('O site recusou (HTTP', status, '): parando para não insistir.'); parar = true; return; }
      if (status === 200) {
        for (const m of texto.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
          let j; try { j = JSON.parse(m[1]); } catch { continue; }
          if (j['@type'] !== 'Product') continue;
          const ean = String(j.gtin ?? j.gtin13 ?? '').trim();
          const preco = Number(j.offers?.price ?? j.offers?.lowPrice);
          const cat = j.category ?? '';
          if (!/^\d{8}$|^\d{13}$/.test(ean) || !(preco > 0) || !/InStock/i.test(String(j.offers?.availability ?? '')) || achados.has(ean) || !GRUPOS.test(cat)) continue;
          achados.set(ean, { ean, nome: j.name, marca: j.brand?.name ?? '', preco, categoria: cat.split('/').filter(Boolean)[0] ?? '', url: item.u, foto: urlDaFoto(j.image) });
        }
      }
      if (status === 200 || status === 404) vistas.add(item.u); // outros erros: tenta de novo na próxima rodada
    } catch (e) { /* tenta de novo na próxima rodada */ }
    if (++feitas % 200 === 0) { salvar(); console.log(`vistas nesta rodada ${feitas}; produtos ${achados.size}`); }
    await esperar(PAUSA_MS);
  }
}
process.on('SIGINT', () => { parar = true; });
process.on('SIGTERM', () => { parar = true; });
await Promise.all(Array.from({ length: PARALELO }, trabalhador));
salvar();
console.log('total', achados.size, 'produtos;', vistas.size, 'páginas vistas;', fila.length, 'ainda faltam.');
