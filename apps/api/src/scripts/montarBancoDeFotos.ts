// Monta o BANCO DE FOTOS ILUSTRATIVAS: uma foto real para cada tipo de produto (leite, arroz, papel higiênico...), guardada junto do
// sistema em apps/api/dados/fotos-ilustrativas/. Serve para dar foto a produtos cuja foto específica não existe (como os de teste,
// de marcas e códigos inventados): o servidor usa a foto do tipo, marcada como "ilustrativa".
//
// Uso (na pasta do projeto):  npm run montar-banco-de-fotos -w @mercado/api
// Para cada tipo de categorias.json que ainda não tem foto, procura um produto conhecido no Open Food Facts (a "busca"), baixa a imagem
// e grava <id>.jpg e o índice indice.json (com o produto de onde veio, para o crédito: as fotos são CC BY-SA). Pode ser rodado de novo:
// só procura o que falta. O serviço limita as buscas, então é lento (alguns minutos) e repete sozinho quando pede calma.
// USAR_CURL=1 usa o curl como transporte (para ambientes cujo proxy o fetch do Node não enxerga).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { baixarFoto } from '../fotos/baixar';
import { criarBuscadorPorNomeOpenFoodFacts, ErroTemporario } from '../fotos/openFoodFacts';

const PASTA = path.resolve(__dirname, '../../dados/fotos-ilustrativas');
const AGENTE = 'BolsoCerto/1.0 (https://github.com/luizedup-stack/bolso-certo)';
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fetchViaCurl = (async (url: string, init?: RequestInit) => {
  const ua = ((init?.headers ?? {}) as Record<string, string>)['User-Agent'] ?? AGENTE;
  const saida = execFileSync('curl', ['-s', '-m', '40', '-A', ua, '-w', '\n%{http_code}', url], { maxBuffer: 30e6 });
  const i = saida.lastIndexOf(10);
  return new Response(saida.subarray(0, i), { status: Number(saida.subarray(i + 1).toString()) });
}) as unknown as typeof fetch;

interface Categoria { id: string; palavras: string[]; busca: string }
interface Entrada { id: string; palavras: string[]; busca: string; codigo?: string; produto?: string; origemUrl?: string }

async function main(): Promise<void> {
  const categorias = JSON.parse(readFileSync(path.join(PASTA, 'categorias.json'), 'utf8')) as Categoria[];
  const arquivoIndice = path.join(PASTA, 'indice.json');
  const indice: Entrada[] = existsSync(arquivoIndice) ? JSON.parse(readFileSync(arquivoIndice, 'utf8')) : [];
  const feitos = new Set(indice.map((e) => e.id));
  const fetchFn = process.env.USAR_CURL === '1' ? fetchViaCurl : undefined;
  const buscador = criarBuscadorPorNomeOpenFoodFacts({ userAgent: AGENTE, ...(fetchFn ? { fetchFn } : {}) });
  mkdirSync(PASTA, { recursive: true });

  const faltam = categorias.filter((c) => !feitos.has(c.id));
  console.log(`${categorias.length} tipos; ${feitos.size} já têm foto; procurando ${faltam.length}.`);
  const semFoto: string[] = [];
  for (const c of faltam) {
    let achado: { url: string } | null | 'adiado' = 'adiado';
    for (let tentativa = 0; tentativa < 6 && achado === 'adiado'; tentativa++) {
      try {
        achado = await buscador.buscarPorNome(c.busca);
      } catch (e) {
        if (!(e instanceof ErroTemporario)) throw e;
        await esperar(20_000 * (tentativa + 1)); // o serviço pediu calma
      }
    }
    await esperar(8_000);
    if (achado === 'adiado') { console.log(`  ...  ${c.id}: serviço ocupado, fica para a próxima rodada`); semFoto.push(c.id); continue; }
    if (!achado) { console.log(`  sem  ${c.id}: nada parecido com "${c.busca}"`); semFoto.push(c.id); continue; }
    try {
      const texto = await baixarFoto(achado.url, { ...(fetchFn ? { fetchFn } : {}), resolver: async () => ['93.184.216.34'] });
      writeFileSync(path.join(PASTA, `${c.id}.jpg`), Buffer.from(texto.split(',')[1]!, 'base64'));
      indice.push({ ...c, origemUrl: achado.url, codigo: /products\/((?:\d+\/)+\d+)/.exec(achado.url)?.[1]?.replace(/\//g, '') });
      writeFileSync(arquivoIndice, JSON.stringify(indice, null, 1));
      console.log(`  ok   ${c.id}`);
    } catch (e) {
      console.log(`  erro ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
      semFoto.push(c.id);
    }
  }
  console.log(`\nBanco: ${indice.length} de ${categorias.length} tipos com foto.${semFoto.length ? ` Faltam: ${semFoto.join(', ')}` : ''}`);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
