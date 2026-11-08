import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import type { Repositorio } from '../repositorio';
import { importarPlanilha } from './importar';

// Coluna opcional "Foto" (link da imagem do produto) na aba Produtos.
const LEITE = '7890070035629';
const ARROZ = '7890070036992';
const FEIJAO = '7890070038361';

async function planilha(linhas: unknown[][], cabecalho = ['Código de barras*', 'Produto*', 'Preço*', 'Quantidade', 'Categoria', 'Disponível', 'Foto']) {
  const wb = new ExcelJS.Workbook();
  const m = wb.addWorksheet('Mercado');
  m.addRow(['Nome do mercado', 'Mercado Teste']);
  m.addRow(['Endereço', 'Rua A, 1 – São Paulo – SP']);
  const p = wb.addWorksheet('Produtos');
  p.addRow(cabecalho);
  for (const l of linhas) p.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let repo: Repositorio;
beforeEach(() => {
  repo = criarRepositorioMemoria();
});
const admin = { papel: 'admin' } as const;

describe('coluna "Foto" da planilha', () => {
  it('guarda o link de cada produto (para o servidor baixar depois), ligado ao código de barras', async () => {
    const r = await importarPlanilha(repo, await planilha([
      [LEITE, 'Leite 1L', 5.99, '1 L', 'Laticínios', 'sim', 'https://loja.exemplo.com/leite.jpg'],
      [ARROZ, 'Arroz 5kg', 25, '5 kg', 'Mercearia', 'sim', ''], // sem foto
    ]), admin);
    expect(r.importadas).toBe(2);
    expect(r.erros).toEqual([]);
    expect(await repo.acharFoto(LEITE)).toMatchObject({ origem: 'planilha', url: 'https://loja.exemplo.com/leite.jpg', imagem: null, mercadoId: r.mercadoId });
    expect(await repo.acharFoto(ARROZ)).toBeNull();
    expect(await repo.listarFotosParaBaixar(10)).toEqual([{ codigoBarras: LEITE, url: 'https://loja.exemplo.com/leite.jpg' }]);
  });

  it('a coluna é opcional: planilha sem ela continua importando como sempre', async () => {
    const r = await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 5.99, '1 L', 'Laticínios', 'sim']], ['Código de barras*', 'Produto*', 'Preço*', 'Quantidade', 'Categoria', 'Disponível']), admin);
    expect(r).toMatchObject({ importadas: 1, erros: [] });
    expect(await repo.acharFoto(LEITE)).toBeNull();
  });

  it('aceita outros nomes para a coluna ("Imagem", "Link da foto")', async () => {
    for (const nome of ['Imagem', 'Link da foto', 'FOTO']) {
      repo = criarRepositorioMemoria();
      await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 5.99, '', '', '', 'https://loja.exemplo.com/a.jpg']], ['Código de barras', 'Produto', 'Preço', 'Quantidade', 'Categoria', 'Disponível', nome]), admin);
      expect((await repo.acharFoto(LEITE))?.url, nome).toBe('https://loja.exemplo.com/a.jpg');
    }
  });

  it('link inválido (não https, texto solto) não derruba o produto: ele entra, a foto é ignorada e o relatório avisa', async () => {
    const r = await importarPlanilha(repo, await planilha([
      [LEITE, 'Leite 1L', 5.99, '', '', '', 'http://loja.exemplo.com/a.jpg'],
      [ARROZ, 'Arroz 5kg', 25, '', '', '', 'foto do arroz'],
      [FEIJAO, 'Feijão 1kg', 8, '', '', '', 'javascript:alert(1)'],
    ]), admin);
    expect(r.importadas).toBe(3);
    expect(r.erros).toHaveLength(3);
    expect(r.erros[0]!.motivo).toContain('Foto ignorada');
    expect(await repo.listarCodigosComFoto()).toEqual([]);
    expect(await repo.listarFotosParaBaixar(10)).toEqual([]);
  });

  it('linha rejeitada (preço inválido) não registra foto', async () => {
    const r = await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 'abc', '', '', '', 'https://loja.exemplo.com/a.jpg']]), admin);
    expect(r.importadas).toBe(0);
    expect(await repo.acharFoto(LEITE)).toBeNull();
  });

  it('célula com hiperlink do Excel usa o endereço do link, não o texto que aparece', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Mercado').addRows([['Nome do mercado', 'Mercado Teste'], ['Endereço', 'Rua A, 1 – São Paulo – SP']]);
    const p = wb.addWorksheet('Produtos');
    p.addRow(['Código de barras', 'Produto', 'Preço', 'Foto']);
    p.addRow([LEITE, 'Leite 1L', 5.99, { text: 'ver foto', hyperlink: 'https://loja.exemplo.com/leite.jpg' }]);
    await importarPlanilha(repo, Buffer.from(await wb.xlsx.writeBuffer()), admin);
    expect((await repo.acharFoto(LEITE))?.url).toBe('https://loja.exemplo.com/leite.jpg');
  });

  it('a foto que um mercado enviou à mão (já guardada) não é trocada pelo link da planilha', async () => {
    await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 5.99]]), admin);
    const mercado = (await repo.listarMercados())[0]!;
    await repo.salvarFoto({ codigoBarras: LEITE, origem: 'mercado', url: null, imagem: 'data:image/jpeg;base64,MANUAL', mercadoId: mercado.id, atualizadaEm: new Date() });
    await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 5.99, '', '', '', 'https://loja.exemplo.com/leite.jpg']]), admin);
    expect(await repo.acharFoto(LEITE)).toMatchObject({ origem: 'mercado', imagem: 'data:image/jpeg;base64,MANUAL' });
  });

  it('o link da planilha passa na frente da foto achada sozinha (é o produto exato da loja)', async () => {
    await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 5.99]]), admin);
    await repo.salvarFoto({ codigoBarras: LEITE, origem: 'openfoodfacts', url: 'https://images.openfoodfacts.org/x.jpg', imagem: 'data:image/jpeg;base64,OFF', mercadoId: null, atualizadaEm: new Date() });
    await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 5.99, '', '', '', 'https://loja.exemplo.com/leite.jpg']]), admin);
    expect(await repo.acharFoto(LEITE)).toMatchObject({ origem: 'planilha', url: 'https://loja.exemplo.com/leite.jpg', imagem: null });
  });

  it('reenviar a mesma planilha não refaz o download (link igual e já baixado)', async () => {
    const dados = await planilha([[LEITE, 'Leite 1L', 5.99, '', '', '', 'https://loja.exemplo.com/leite.jpg']]);
    await importarPlanilha(repo, dados, admin);
    await repo.salvarFoto({ ...(await repo.acharFoto(LEITE))!, imagem: 'data:image/jpeg;base64,BAIXADA' });
    await importarPlanilha(repo, dados, admin);
    expect((await repo.acharFoto(LEITE))?.imagem).toBe('data:image/jpeg;base64,BAIXADA');
    expect(await repo.listarFotosParaBaixar(10)).toEqual([]);
  });

  it('trocar o link da foto na planilha manda baixar a nova', async () => {
    await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 5.99, '', '', '', 'https://loja.exemplo.com/velha.jpg']]), admin);
    await repo.salvarFoto({ ...(await repo.acharFoto(LEITE))!, imagem: 'data:image/jpeg;base64,VELHA' });
    await importarPlanilha(repo, await planilha([[LEITE, 'Leite 1L', 5.99, '', '', '', 'https://loja.exemplo.com/nova.jpg']]), admin);
    expect(await repo.acharFoto(LEITE)).toMatchObject({ url: 'https://loja.exemplo.com/nova.jpg', imagem: null });
  });
});
