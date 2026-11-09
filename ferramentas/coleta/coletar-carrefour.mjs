// Coleta preços públicos de páginas de produto do Carrefour (dados estruturados da própria página).
// Só usa URLs do sitemap oficial; 1 requisição por vez, ~0,7 s entre elas. Não contorna bloqueios.
// Uso: node ferramentas/coleta/coletar-carrefour.mjs [limite]
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { urlDaFoto } from './foto.mjs';

const LIMITE = Number(process.argv[2] ?? 350);
const UA = { 'User-Agent': 'Mozilla/5.0 (BolsoCerto coleta de teste)' };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const PALAVRAS = /(^|-)(arroz|feijao|macarrao|farinha|acucar|sal|oleo|azeite|cafe|leite|achocolatado|biscoito|bolacha|molho|extrato|milho|ervilha|sardinha|atum|fuba|aveia|granola|cereal|margarina|manteiga|requeijao|queijo|presunto|mortadela|salsicha|linguica|hamburguer|iogurte|suco|refrigerante|agua|cerveja|vinagre|maionese|ketchup|mostarda|tempero|caldo|gelatina|sabao|detergente|amaciante|desinfetante|esponja|papel|guardanapo|shampoo|condicionador|sabonete|creme|desodorante|absorvente|fralda|racao|cha|chocolate|bala|amendoim|pipoca|lentilha|palmito|azeitona)(-|$)/;
const GRUPOS = /^\/(Mercearia|Bebidas|Limpeza|Higiene|Perfumaria|Alimentos|Congelados|Frios|Laticínios|Padaria|Pet|Bebê|Cuidados|Matinais|Biscoitos|Doces|Enlatados|Molhos|Cereais|Hortifruti|Açougue|Mercado)/i;

// Prioriza páginas cujo nome se parece com produtos já coletados nas OUTRAS redes (dados-reais/*.json): assim os produtos do
// Carrefour que entram são os que dá para comparar com os demais mercados.
const pastaRef = new URL('../../dados-reais/', import.meta.url);
const arquivosRef = readdirSync(pastaRef).filter((n) => n.endsWith('.json') && !n.endsWith('.progresso.json') && n !== 'carrefour.json');
const REF = arquivosRef.length ? arquivosRef.flatMap((n) => JSON.parse(readFileSync(new URL(n, pastaRef), 'utf8'))) : null;
const tokens = (t) => new Set(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3));
const indice = new Map();
const tamRef = [];
REF?.forEach((p, i) => { const t = tokens(p.nome + ' ' + p.marca); tamRef[i] = t.size; t.forEach((k) => { if (!indice.has(k)) indice.set(k, []); indice.get(k).push(i); }); });
function parecido(slug) {
  const t = tokens(slug); const cont = new Map();
  t.forEach((k) => (indice.get(k) ?? []).forEach((i) => cont.set(i, (cont.get(i) ?? 0) + 1)));
  let melhor = 0;
  cont.forEach((c, i) => { if (c >= 3) melhor = Math.max(melhor, c / Math.min(t.size, tamRef[i])); });
  return melhor;
}
const indices = [];
for (let n = 0; n < 43; n += 1) indices.push(n);
const urls = [];
for (const n of indices) {
  try {
    const r = await fetch(`https://mercado.carrefour.com.br/sitemap/product-${n}.xml`, { headers: UA });
    const xml = await r.text();
    for (const m of xml.matchAll(/<loc>(https:\/\/mercado.carrefour.com.br\/([^<]*?)\/p)<\/loc>/g)) {
      if (REF || PALAVRAS.test(m[2])) urls.push({ u: m[1], slug: m[2] });
    }
  } catch (e) { console.error('sitemap', n, e.message); }
  await esperar(250);
}
console.log('candidatas', urls.length);
if (REF) { for (const x of urls) x.nota = parecido(x.slug); urls.sort((a, b) => b.nota - a.nota); console.log('parecidas (>=0.6):', urls.filter((x) => x.nota >= 0.6).length); }
else urls.sort(() => Math.random() - 0.5);

const caminhoSaida = new URL('../../dados-reais/carrefour.json', import.meta.url);
const achados = new Map(existsSync(caminhoSaida) ? JSON.parse(readFileSync(caminhoSaida, 'utf8')).map((x) => [x.ean, x]) : []);
let vistas = 0;
for (const { u } of urls) {
  if (achados.size >= LIMITE) break;
  vistas++;
  try {
    const r = await fetch(u, { headers: UA });
    if (!r.ok) { console.error('HTTP', r.status, u); if (r.status === 403 || r.status === 429) break; continue; }
    const h = await r.text();
    for (const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      let j; try { j = JSON.parse(m[1]); } catch { continue; }
      if (j['@type'] !== 'Product') continue;
      const ean = String(j.gtin ?? j.gtin13 ?? '').trim();
      const preco = Number(j.offers?.price ?? j.offers?.lowPrice);
      const disponivel = /InStock/i.test(String(j.offers?.availability ?? ''));
      const cat = j.category ?? '';
      if (!/^\d{8}$|^\d{13}$/.test(ean) || !(preco > 0) || !disponivel || achados.has(ean)) continue;
      if (!GRUPOS.test(cat)) { continue; }
      achados.set(ean, { ean, nome: j.name, marca: j.brand?.name ?? '', preco, categoria: cat.split('/').filter(Boolean)[0] ?? '', url: u, foto: urlDaFoto(j.image) });
    }
  } catch (e) { console.error(u, e.message); }
  if (vistas % 50 === 0) writeFileSync(caminhoSaida, JSON.stringify([...achados.values()], null, 1));
  if (vistas % 25 === 0) console.log('vistas', vistas, 'achados', achados.size);
  await esperar(700);
}
writeFileSync(caminhoSaida, JSON.stringify([...achados.values()], null, 1));
console.log('total', achados.size, 'páginas vistas', vistas);
