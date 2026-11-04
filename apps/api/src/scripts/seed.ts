import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ErroPlanilha, importarPlanilha, type RelatorioImportacao } from '../planilha/importar';
import type { Repositorio } from '../repositorio';

/** Só arquivos comuns `.xlsx`; ignora pastas, ocultos e o `~$nome.xlsx` que o Excel cria com a planilha aberta. */
const ehPlanilha = (d: Dirent): boolean =>
  d.isFile() && d.name.toLowerCase().endsWith('.xlsx') && !d.name.startsWith('~$') && !d.name.startsWith('.');

async function listarEntradas(pasta: string): Promise<Dirent[]> {
  try {
    return await readdir(pasta, { withFileTypes: true });
  } catch (e) {
    const codigo = (e as NodeJS.ErrnoException).code;
    if (codigo === 'ENOENT' || codigo === 'ENOTDIR') {
      throw new Error(
        `Pasta de dados de teste não encontrada: ${pasta}. ` +
          'Aponte PASTA_DADOS_DE_TESTE para uma pasta que exista ou use CARREGAR_DADOS_DE_TESTE=0 para iniciar sem dados de teste.',
      );
    }
    throw e;
  }
}

/**
 * Importa, como administrador, cada `.xlsx` da pasta (em ordem de nome de arquivo).
 * Se uma planilha for rejeitada por inteiro, o erro sobe com o nome do arquivo na mensagem.
 */
export async function seed(repo: Repositorio, pasta: string): Promise<RelatorioImportacao[]> {
  const nomes = (await listarEntradas(pasta)).filter(ehPlanilha).map((d) => d.name).sort();
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
