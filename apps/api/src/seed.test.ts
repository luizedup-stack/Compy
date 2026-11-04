import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

const temporaria = (prefixo: string): string => {
  const pasta = mkdtempSync(path.join(tmpdir(), prefixo));
  pastasTemporarias.push(pasta);
  return pasta;
};
const copiar = (pasta: string, origem: string, destino: string) =>
  copyFileSync(path.join(PASTA_DADOS, origem), path.join(pasta, destino));

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

  it('ignora lock do Excel (~$), arquivo oculto e pasta chamada *.xlsx', async () => {
    const pasta = temporaria('seed-lixo-');
    for (const nome of readdirSync(PASTA_DADOS).filter((n) => n.endsWith('.xlsx'))) copiar(pasta, nome, nome);
    writeFileSync(path.join(pasta, '~$mercado-1-bom-preco.xlsx'), Buffer.from('lixo do excel'));
    writeFileSync(path.join(pasta, '.oculto.xlsx'), Buffer.from('lixo'));
    mkdirSync(path.join(pasta, 'pasta.xlsx'));
    const repo = criarRepositorioMemoria();
    const relatorios = await seed(repo, pasta);
    expect(relatorios).toHaveLength(4);
    expect(relatorios.map((r) => r.erros)).toEqual([[], [], [], []]);
    expect(await repo.listarMercados()).toHaveLength(4);
  });

  it('importa em ordem de nome de arquivo (não na ordem em que foram criados)', async () => {
    const pasta = temporaria('seed-ordem-');
    // Criados na ordem 1, 2, 4; em ordem de nome: a-atacarejo, b-estrela, c-bom-preco.
    copiar(pasta, 'mercado-1-bom-preco.xlsx', 'c-bom-preco.xlsx');
    copiar(pasta, 'mercado-2-estrela-da-vila.xlsx', 'b-estrela.xlsx');
    copiar(pasta, 'mercado-4-atacarejo-economico.xlsx', 'a-atacarejo.xlsx');
    const repo = criarRepositorioMemoria();
    const relatorios = await seed(repo, pasta);
    expect(relatorios.map((r) => r.mercadoId)).toEqual([1, 2, 3]);
    const nomes = await Promise.all(relatorios.map(async (r) => (await repo.acharMercado(r.mercadoId))?.nome));
    expect(nomes).toEqual(['Atacarejo Econômico', 'Supermercado Estrela da Vila', 'Mercado Bom Preço']);
  });

  it('pasta que não existe: erro em português com o caminho e as saídas', async () => {
    const pasta = path.join(temporaria('seed-base-'), 'nao-existe');
    const erro = await seed(criarRepositorioMemoria(), pasta).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(erro).toBeInstanceOf(Error);
    expect(erro!.message).toContain(pasta);
    expect(erro!.message).toContain('PASTA_DADOS_DE_TESTE');
    expect(erro!.message).toContain('CARREGAR_DADOS_DE_TESTE=0');
  });

  it('rodar duas vezes no mesmo repositório não duplica nada', async () => {
    const repo = criarRepositorioMemoria();
    const primeira = await seed(repo, PASTA_DADOS);
    const contar = async () =>
      Promise.all((await repo.listarMercados()).map(async (m) => (await repo.listarOfertasDoMercado(m.id)).length));
    const ofertas = await contar();
    const segunda = await seed(repo, PASTA_DADOS);
    expect(primeira.map((r) => r.mercadoCriado)).toEqual([true, true, true, true]);
    expect(segunda.map((r) => r.mercadoCriado)).toEqual([false, false, false, false]);
    expect(segunda.map((r) => r.importadas)).toEqual(primeira.map((r) => r.importadas));
    expect(segunda.map((r) => r.mercadoId)).toEqual(primeira.map((r) => r.mercadoId));
    expect(await repo.listarMercados()).toHaveLength(4);
    expect(await contar()).toEqual(ofertas);
  });
});
