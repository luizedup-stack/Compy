// Banco de fotos ILUSTRATIVAS: uma foto real para cada tipo de produto (leite, arroz, papel higiênico...), guardada junto do sistema em
// apps/api/dados/fotos-ilustrativas/ (veja scripts/montarBancoDeFotos.ts). É o último recurso: quando não existe a foto específica do
// produto (código de barras, planilha, painel), ele recebe a foto do tipo, sempre marcada como "ilustrativa" para ninguém achar que é
// o produto exato. Se a foto específica aparecer depois, ela troca a ilustrativa sozinha.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PASTA_ILUSTRATIVAS = path.resolve(__dirname, '../../dados/fotos-ilustrativas');

export interface EntradaIlustrativa {
  id: string;
  /** Palavras que o nome do produto precisa ter (todas) para esta foto valer. Quanto mais palavras, mais específica. */
  palavras: string[];
  /** A imagem pronta, como texto "data:image/jpeg;base64,...". */
  imagem: string;
}

/** Abreviações comuns nos nomes dos produtos ("Papel Hig." é papel higiênico, "Det." é detergente). */
const ABREVIACOES: Record<string, string> = { hig: 'higienico', det: 'detergente', sab: 'sabonete', cond: 'condicionador', desod: 'desodorante' };

/** As palavras do nome, sem acento nem maiúsculas e com as abreviações por extenso ("Água Sanitária 2L" → ["agua", "sanitaria", "2l"]). */
export function palavrasDoNome(nome: string): string[] {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((p) => ABREVIACOES[p] ?? p);
}

/** Lê o índice e as imagens da pasta. O que falta (foto que o montador não achou) simplesmente não entra. */
export function carregarBancoIlustrativo(pasta = PASTA_ILUSTRATIVAS): EntradaIlustrativa[] {
  const arquivoIndice = path.join(pasta, 'indice.json');
  if (!existsSync(arquivoIndice)) return [];
  const indice = JSON.parse(readFileSync(arquivoIndice, 'utf8')) as { id: string; palavras: string[] }[];
  const entradas: EntradaIlustrativa[] = [];
  for (const e of indice) {
    const arquivo = path.join(pasta, `${e.id}.jpg`);
    if (!existsSync(arquivo)) continue;
    entradas.push({ id: e.id, palavras: e.palavras, imagem: `data:image/jpeg;base64,${readFileSync(arquivo).toString('base64')}` });
  }
  return entradas;
}

/**
 * Escolhe a foto do tipo certo para o nome do produto: vale a entrada cujas palavras estão todas no nome. Entre várias, a mais
 * específica (mais palavras: "leite condensado" ganha de "leite"); em empate, a que aparece mais cedo no nome ("Chocolate ao Leite"
 * é chocolate, não leite). Sem nenhuma, null.
 */
export function escolherIlustrativa<T extends { palavras: string[] }>(nome: string, entradas: T[]): T | null {
  const palavras = palavrasDoNome(nome);
  const posicao = new Map<string, number>();
  palavras.forEach((p, i) => {
    if (!posicao.has(p)) posicao.set(p, i);
  });
  let melhor: { entrada: T; especificidade: number; inicio: number } | null = null;
  for (const entrada of entradas) {
    if (entrada.palavras.length === 0 || !entrada.palavras.every((p) => posicao.has(p))) continue;
    const inicio = Math.min(...entrada.palavras.map((p) => posicao.get(p)!));
    if (!melhor || entrada.palavras.length > melhor.especificidade || (entrada.palavras.length === melhor.especificidade && inicio < melhor.inicio)) {
      melhor = { entrada, especificidade: entrada.palavras.length, inicio };
    }
  }
  return melhor?.entrada ?? null;
}

/** Um tipo de produto do banco ilustrativo: as palavras que o identificam e a busca que acha uma foto representativa dele. */
export interface Categoria {
  id: string;
  palavras: string[];
  busca: string;
}

/** A lista de tipos de produto (categorias.json), com ou sem foto já montada. */
export function carregarCategorias(pasta = PASTA_ILUSTRATIVAS): Categoria[] {
  const arquivo = path.join(pasta, 'categorias.json');
  return existsSync(arquivo) ? (JSON.parse(readFileSync(arquivo, 'utf8')) as Categoria[]) : [];
}

/** Prefixos das chaves de configuração (no banco de dados) onde o servidor guarda as fotos ilustrativas que ele mesmo achou. */
export const CHAVE_ILUSTRATIVA = 'ilustrativa:';
export const CHAVE_ILUSTRATIVA_SEM = 'ilustrativa-sem:';
