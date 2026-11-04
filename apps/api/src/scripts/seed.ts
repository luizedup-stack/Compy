import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ErroPlanilha, importarPlanilha, type RelatorioImportacao } from '../planilha/importar';
import type { Repositorio } from '../repositorio';

/**
 * Importa, como administrador, cada `.xlsx` da pasta (em ordem de nome de arquivo).
 * Se uma planilha for rejeitada por inteiro, o erro sobe com o nome do arquivo na mensagem.
 */
export async function seed(repo: Repositorio, pasta: string): Promise<RelatorioImportacao[]> {
  const nomes = (await readdir(pasta)).filter((n) => n.toLowerCase().endsWith('.xlsx')).sort();
  const relatorios: RelatorioImportacao[] = [];
  for (const nome of nomes) {
    const arquivo = await readFile(path.join(pasta, nome));
    try {
      relatorios.push(await importarPlanilha(repo, arquivo, { papel: 'admin' }));
    } catch (e) {
      if (e instanceof ErroPlanilha) throw new ErroPlanilha(`${nome}: ${e.message}`);
      throw e;
    }
  }
  return relatorios;
}
