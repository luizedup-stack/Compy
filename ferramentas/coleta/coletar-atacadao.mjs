// Coleta preços públicos do site do Atacadão (API pública de catálogo do próprio site).
// Uso: node ferramentas/coleta/coletar-atacadao.mjs
// Gentil: 1 requisição por vez, ~0,8 s entre elas. Preço = o que o site mostra sem escolher loja.
import { writeFileSync } from 'node:fs';
import { urlDaFoto } from './foto.mjs';

const TERMOS = ['arroz','feijao','macarrao','farinha de trigo','farinha de mandioca','acucar','sal refinado','oleo de soja','azeite','cafe','leite integral','leite em po','achocolatado','biscoito','bolacha','molho de tomate','extrato de tomate','milho verde','ervilha','sardinha','atum','farofa','fuba','aveia','granola','cereal','margarina','manteiga','requeijao','queijo','presunto','mortadela','salsicha','linguica','hamburguer','frango congelado','carne bovina','ovos','iogurte','suco','refrigerante','agua mineral','cerveja','vinagre','maionese','ketchup','mostarda','tempero','sazon','caldo','gelatina','pao de forma','torrada','sabao em po','sabao em barra','detergente','amaciante','agua sanitaria','desinfetante','limpador','esponja','papel higienico','papel toalha','guardanapo','sacos de lixo','shampoo','condicionador','sabonete','creme dental','escova de dente','desodorante','absorvente','fralda','algodao','cotonete','racao','cha','leite condensado','creme de leite','doce de leite','chocolate','bala','amendoim','pipoca','batata palha','lentilha','grao de bico','feijao preto','palmito','azeitona','cebola','alho'];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://www.atacadao.com.br/io/api/catalog_system/pub/products/search';
const porEan = new Map();

for (const termo of TERMOS) {
  for (const de of [0, 50]) {
    const url = `${BASE}?ft=${encodeURIComponent(termo)}&_from=${de}&_to=${de + 49}`;
    let lista = [];
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (BolsoCerto coleta de teste)' } });
      if (r.ok || r.status === 206) lista = await r.json();
      else console.error(termo, 'HTTP', r.status);
    } catch (e) { console.error(termo, e.message); }
    for (const p of lista) {
      for (const it of p.items ?? []) {
        const oferta = it.sellers?.[0]?.commertialOffer;
        if (!oferta || !(oferta.Price > 0) || !(oferta.AvailableQuantity > 0)) continue;
        const ean = String(it.ean ?? '').trim();
        if (!/^\d{8}$|^\d{13}$/.test(ean) || porEan.has(ean)) continue;
        porEan.set(ean, {
          ean, nome: p.productName, marca: p.brand, preco: oferta.Price,
          categoria: (p.categories?.[0] ?? '').split('/').filter(Boolean)[0] ?? '',
          url: p.link,
          foto: urlDaFoto(it.images?.map((i) => i.imageUrl)), // foto do produto, do próprio catálogo do site
        });
      }
    }
    await esperar(800);
    if (lista.length < 50) break;
  }
  console.log(termo, porEan.size);
}
writeFileSync(new URL('../../dados-reais/atacadao.json', import.meta.url), JSON.stringify([...porEan.values()], null, 1));
console.log('total', porEan.size);
