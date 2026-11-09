// Coleta o catálogo PÚBLICO de redes de supermercado cujo site usa a plataforma VTEX (API de catálogo aberta do próprio site).
// Percorre as categorias da loja virtual e, em cada uma, as páginas de produtos; guarda só o que está disponível, com preço
// e código de barras válido. O resultado vai para dados-reais/<rede>.json (fora do git: são dados de terceiros).
//
// Uso:  node ferramentas/coleta/coletar-vtex.mjs <rede> [<rede> ...] [--limite N]
//       node ferramentas/coleta/coletar-vtex.mjs --listar          (mostra as redes configuradas)
//
// Gentil com os sites: no máximo 3 requisições ao mesmo tempo por rede, ~0,35 s de pausa entre as de cada uma, identifica-se como coleta de teste e NÃO tenta
// contornar bloqueios: se o site responde 403/429 de forma insistente, a coleta daquela rede para e guarda o que já tem.
// O preço é o que o site mostra sem escolher loja (pode variar por loja/região).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { urlDaFoto } from './foto.mjs';

/** Redes configuradas: base do site e, se for o caso, um texto de endereço para a planilha (o endereço é só explicativo). */
export const REDES = {
  atacadao: { site: 'https://www.atacadao.com.br' },
  mambo: { site: 'https://www.mambo.com.br' },
  savegnago: { site: 'https://www.savegnago.com.br' },
  oba: { site: 'https://www.obahortifruti.com.br' },
  samsclub: { site: 'https://www.samsclub.com.br' },
  covabra: { site: 'https://www.covabra.com.br' },
  hortifruti: { site: 'https://www.hortifruti.com.br' },
  zaffari: { site: 'https://www.zaffari.com.br' },
  bistek: { site: 'https://www.bistek.com.br' },
  giassi: { site: 'https://www.giassi.com.br' },
};

const UA = { 'User-Agent': 'Mozilla/5.0 (BolsoCerto coleta de teste)', Accept: 'application/json' };
const PAUSA_MS = 350;
const POR_PAGINA = 50;
/** A VTEX não entrega itens além desta posição numa mesma consulta. */
const MAX_POSICAO = 2500;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dígito verificador GS1 (EAN-8, UPC-A e EAN-13): é o mesmo conferido pelo importador de planilhas. */
export function eanValido(codigo) {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(codigo) || /^0+$/.test(codigo)) return false;
  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop();
  const soma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === verificador;
}

/** Pede uma URL e devolve o JSON. Tenta de novo (com espera crescente) em erros passageiros; 403 repetido interrompe. */
async function pedirJson(url, contexto) {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(url, { headers: UA, signal: ctl.signal }).finally(() => clearTimeout(t));
      if (r.status === 200 || r.status === 206) return await r.json();
      if (r.status === 403 || r.status === 429) {
        contexto.bloqueios += 1;
        if (contexto.bloqueios >= 5) throw new Error(`site bloqueando (HTTP ${r.status}); coleta interrompida de propósito`);
        await esperar(5000 * tentativa);
      } else if (r.status === 404 || r.status === 400) {
        return null; // categoria sem produtos ou fora do limite
      } else {
        await esperar(2000 * tentativa);
      }
    } catch (e) {
      if (String(e.message).includes('interrompida de propósito')) throw e;
      await esperar(2000 * tentativa);
    }
  }
  return null;
}

/**
 * Folhas da árvore de categorias (as que não têm subcategorias). A VTEX só filtra por categoria com o CAMINHO completo
 * ("C:/topo/filho/neto/"), por isso cada folha guarda os ids do caminho. `topo` é o nome do departamento (se a loja tem uma
 * única raiz, como o nome da própria rede, vale o nível de baixo).
 */
export function folhas(arvore) {
  const lista = [];
  const raizUnica = (arvore ?? []).length === 1;
  const visitar = (no, caminho, nomes) => {
    const ids = [...caminho, no.id];
    const nomesAte = [...nomes, no.name];
    const filhos = no.children ?? [];
    if (filhos.length === 0) lista.push({ fq: `C:/${ids.join('/')}/`, topo: raizUnica ? (nomesAte[1] ?? nomesAte[0]) : nomesAte[0] });
    for (const f of filhos) visitar(f, ids, nomesAte);
  };
  for (const no of arvore ?? []) visitar(no, [], []);
  return lista;
}

/** Transforma um produto da VTEX em registros (um por código de barras disponível). */
export function registrosDe(p, topo) {
  const saida = [];
  for (const it of p.items ?? []) {
    const ean = String(it.ean ?? '').trim();
    if (!eanValido(ean)) continue;
    const oferta = (it.sellers ?? []).map((s) => s.commertialOffer).find((o) => o && o.Price > 0 && o.AvailableQuantity > 0);
    if (!oferta) continue;
    saida.push({
      ean,
      nome: p.productName,
      marca: p.brand ?? '',
      preco: oferta.Price,
      categoria: topo ?? (p.categories?.[0] ?? '').split('/').filter(Boolean)[0] ?? '',
      url: p.link,
      foto: urlDaFoto(it.images?.map((i) => i.imageUrl)),
      // Para itens vendidos por peso (kg), o nome costuma não trazer a quantidade: a unidade ajuda a calcular o preço por kg.
      medida: it.measurementUnit ?? '',
      multiplicador: it.unitMultiplier ?? 1,
    });
  }
  return saida;
}

/** Quantos pedidos andam ao mesmo tempo por rede. Poucos, de propósito: é um catálogo público de uma loja real. */
const TRABALHADORES = 3;

async function coletarRede(nome, limite) {
  const { site } = REDES[nome];
  const saida = new URL(`../../dados-reais/${nome}.json`, import.meta.url);
  const progresso = new URL(`../../dados-reais/${nome}.progresso.json`, import.meta.url);
  const contexto = { bloqueios: 0 };

  // Continua de onde parou: lê o que já foi coletado e quais categorias já foram percorridas.
  const achados = new Map();
  const feitas = new Set();
  if (existsSync(saida) && existsSync(progresso)) {
    try {
      for (const r of JSON.parse(readFileSync(saida, 'utf8'))) achados.set(r.ean, r);
      for (const fq of JSON.parse(readFileSync(progresso, 'utf8'))) feitas.add(fq);
      console.log(`[${nome}] continuando: ${achados.size} produtos e ${feitas.size} categorias já feitas`);
    } catch { /* arquivo estragado: começa do zero */ }
  }

  console.log(`[${nome}] lendo as categorias de ${site}`);
  const arvore = await pedirJson(`${site}/api/catalog_system/pub/category/tree/5`, contexto);
  const lista = folhas(arvore);
  const pendentes = lista.filter((c) => !feitas.has(c.fq));
  console.log(`[${nome}] ${lista.length} categorias, ${pendentes.length} por fazer`);

  const guardar = () => {
    writeFileSync(saida, JSON.stringify([...achados.values()], null, 1));
    writeFileSync(progresso, JSON.stringify([...feitas]));
  };

  let parar = false;
  let proxima = 0;
  /** Uma categoria inteira: todas as páginas dela. */
  async function categoria({ fq, topo }) {
    for (let de = 0; de < MAX_POSICAO && !parar; de += POR_PAGINA) {
      const url = `${site}/api/catalog_system/pub/products/search?fq=${encodeURIComponent(fq)}&_from=${de}&_to=${de + POR_PAGINA - 1}`;
      const produtos = await pedirJson(url, contexto);
      await esperar(PAUSA_MS);
      if (!Array.isArray(produtos) || produtos.length === 0) break;
      for (const p of produtos) for (const r of registrosDe(p, topo)) if (!achados.has(r.ean)) achados.set(r.ean, r);
      if (produtos.length < POR_PAGINA) break;
    }
    feitas.add(fq);
  }
  async function trabalhador() {
    while (!parar && proxima < pendentes.length) {
      const c = pendentes[proxima++];
      try {
        await categoria(c);
      } catch (e) {
        console.error(`[${nome}] ${e.message}`);
        parar = true;
        return;
      }
      if (feitas.size % 20 === 0) {
        console.log(`[${nome}] ${feitas.size}/${lista.length} categorias, ${achados.size} produtos`);
        guardar();
      }
      if (limite && achados.size >= limite) parar = true;
    }
  }
  await Promise.all(Array.from({ length: TRABALHADORES }, trabalhador));
  guardar();
  console.log(`[${nome}] FIM: ${achados.size} produtos (${feitas.size}/${lista.length} categorias)`);
  return achados.size;
}

// ---- linha de comando (só quando este arquivo é executado, não quando importado nos testes)
if (import.meta.url === new URL(process.argv[1], 'file:///').href || process.argv[1]?.endsWith('coletar-vtex.mjs')) {
  const args = process.argv.slice(2);
  if (args.includes('--listar') || args.length === 0) {
    console.log('Redes configuradas:', Object.keys(REDES).join(', '));
  } else {
    const iLimite = args.indexOf('--limite');
    const limite = iLimite >= 0 ? Number(args[iLimite + 1]) : 0;
    const redes = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--limite');
    for (const r of redes) {
      if (!REDES[r]) { console.error(`Rede desconhecida: ${r}`); continue; }
      await coletarRede(r, limite);
    }
  }
}
