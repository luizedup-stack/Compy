import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PASTA_DADOS } from './rotas/apoioTeste';
import { criarRepositorioMemoria } from './repositorioMemoria';
import { seed } from './scripts/seed';

const pastasTemporarias: string[] = [];
afterAll(() => {
  for (const p of pastasTemporarias) rmSync(p, { recursive: true, force: true });
});

describe('seed', () => {
  it('importa as 4 planilhas de dados-de-teste, em ordem de nome, sem erros', async () => {
    const repo = criarRepositorioMemoria();
    const relatorios = await seed(repo, PASTA_DADOS);
    expect(relatorios).toHaveLength(4);
    expect(relatorios.map((r) => r.erros)).toEqual([[], [], [], []]);
    expect(relatorios.map((r) => r.importadas)).toEqual([26, 29, 29, 29]);
    const mercados = await repo.listarMercados();
    expect(mercados.filter((m) => m.status === 'ativo')).toHaveLength(4);
  });

  it('ignora o que não é .xlsx', async () => {
    const pasta = mkdtempSync(path.join(tmpdir(), 'seed-vazio-'));
    pastasTemporarias.push(pasta);
    writeFileSync(path.join(pasta, 'LEIA-ME.md'), '# nada');
    expect(await seed(criarRepositorioMemoria(), pasta)).toEqual([]);
  });

  it('repassa o erro de uma planilha corrompida com o nome do arquivo', async () => {
    const pasta = mkdtempSync(path.join(tmpdir(), 'seed-ruim-'));
    pastasTemporarias.push(pasta);
    writeFileSync(path.join(pasta, 'quebrada.xlsx'), Buffer.from('isto nao e um xlsx'));
    await expect(seed(criarRepositorioMemoria(), pasta)).rejects.toThrow(/quebrada\.xlsx/);
  });
});
