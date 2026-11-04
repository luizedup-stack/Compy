import { readFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { LIMITE_BYTES, LIMITE_LINHAS, normalizarTexto } from '@mercado/shared';
import { describe, expect, it } from 'vitest';
import type { Mercado, Repositorio } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { ErroPlanilha, importarPlanilha } from './importar';
import { gerarModelo } from './modelo';

const PASTA_DADOS = path.resolve(__dirname, '../../../../dados-de-teste');
const ADMIN = { papel: 'admin' } as const;

const CABECALHO = ['Código de barras*', 'Produto*', 'Preço*', 'Quantidade', 'Categoria', 'Disponível'];
const MERCADO_PADRAO: unknown[][] = [
  ['Nome do mercado*', 'Mercado Teste'],
  ['Endereço*', 'Rua A, 1'],
];

// EAN-13 válido a partir de 12 dígitos.
function ean13(base12: string): string {
  const soma = [...base12].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + String((10 - (soma % 10)) % 10);
}
const EAN_A = ean13('789007003562');
const EAN_B = ean13('789007003563');
const EAN_C = ean13('789007003564');

interface Montagem {
  mercado?: unknown[][] | null;
  cabecalho?: unknown[];
  produtos?: unknown[][] | null;
  abaProdutos?: string;
  abaExtra?: boolean;
}

async function montar({
  mercado = MERCADO_PADRAO,
  cabecalho = CABECALHO,
  produtos = [],
  abaProdutos = 'Produtos',
  abaExtra = false,
}: Montagem = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  if (abaExtra) wb.addWorksheet('Instruções').addRow(['texto', 'Mercado']);
  if (mercado) {
    const aba = wb.addWorksheet('Mercado');
    mercado.forEach((linha) => aba.addRow(linha));
  }
  if (produtos) {
    const aba = wb.addWorksheet(abaProdutos);
    aba.addRow(cabecalho);
    produtos.forEach((linha) => aba.addRow(linha));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const linhaBoa = (codigo: string, nome = 'Produto bom', preco: unknown = 9.9): unknown[] => [
  codigo,
  nome,
  preco,
  '1 kg',
  'Mercearia',
  'sim',
];

async function mercadosGravados(repo: Repositorio): Promise<Mercado[]> {
  return repo.listarMercados();
}

describe('importarPlanilha: arquivos reais', () => {
  const casos: [string, number][] = [
    ['mercado-1-bom-preco.xlsx', 26],
    ['mercado-2-estrela-da-vila.xlsx', 29],
    ['mercado-3-emporio-sonia.xlsx', 29],
    ['mercado-4-atacarejo-economico.xlsx', 29],
  ];

  it.each(casos)('importa %s sem erros', async (arquivo, esperadas) => {
    const repo = criarRepositorioMemoria();
    const buffer = readFileSync(path.join(PASTA_DADOS, arquivo));
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.mercadoCriado).toBe(true);
    expect(relatorio.importadas).toBe(esperadas);
    expect(relatorio.erros).toEqual([]);
    expect(await repo.listarOfertasDoMercado(relatorio.mercadoId)).toHaveLength(esperadas);
  });

  it('no Empório Sonia, só o óleo de soja está indisponível', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = readFileSync(path.join(PASTA_DADOS, 'mercado-3-emporio-sonia.xlsx'));
    const { mercadoId } = await importarPlanilha(repo, buffer, ADMIN);
    const indisponiveis = (await repo.listarOfertasDoMercado(mercadoId)).filter((o) => !o.disponivel);
    expect(indisponiveis).toHaveLength(1);
    expect(indisponiveis[0]!.nomeNorm).toContain('oleo');
  });

  it('o mercado criado fica ativo, gratuito e sem usuário', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = readFileSync(path.join(PASTA_DADOS, 'mercado-1-bom-preco.xlsx'));
    const { mercadoId } = await importarPlanilha(repo, buffer, ADMIN);
    const mercado = await repo.acharMercado(mercadoId);
    expect(mercado).toMatchObject({
      nome: 'Mercado Bom Preço',
      nomeNorm: normalizarTexto('Mercado Bom Preço'),
      status: 'ativo',
      contaSituacao: 'gratuita',
      usuarioId: null,
    });
  });

  it('importar de novo reaproveita o mercado, mantém as ofertas e avança precoAtualizadoEm', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = readFileSync(path.join(PASTA_DADOS, 'mercado-1-bom-preco.xlsx'));
    const primeira = await importarPlanilha(repo, buffer, ADMIN);
    const antes = await repo.listarOfertasDoMercado(primeira.mercadoId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const segunda = await importarPlanilha(repo, buffer, ADMIN);
    const depois = await repo.listarOfertasDoMercado(primeira.mercadoId);

    expect(segunda.mercadoCriado).toBe(false);
    expect(segunda.mercadoId).toBe(primeira.mercadoId);
    expect(depois).toHaveLength(antes.length);
    expect(await mercadosGravados(repo)).toHaveLength(1);
    const oferta = antes[0]!;
    const nova = depois.find((o) => o.codigoBarras === oferta.codigoBarras)!;
    expect(nova.preco).toBe(oferta.preco);
    expect(nova.precoAtualizadoEm.getTime()).toBeGreaterThan(oferta.precoAtualizadoEm.getTime());
  });

  it('dois importarPlanilha simultâneos da mesma planilha deixam 1 mercado e 26 ofertas', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = readFileSync(path.join(PASTA_DADOS, 'mercado-1-bom-preco.xlsx'));
    const [a, b] = await Promise.all([
      importarPlanilha(repo, buffer, ADMIN),
      importarPlanilha(repo, buffer, ADMIN),
    ]);
    expect(a.mercadoId).toBe(b.mercadoId);
    expect([a.mercadoCriado, b.mercadoCriado].sort()).toEqual([false, true]);
    expect(await mercadosGravados(repo)).toHaveLength(1);
    expect(await repo.listarOfertasDoMercado(a.mercadoId)).toHaveLength(26);
  });
});

describe('importarPlanilha: a planilha vence', () => {
  it('reimportar desfaz o preço alterado à mão e preserva ofertas fora da planilha nova', async () => {
    const repo = criarRepositorioMemoria();
    const inicial = await montar({ produtos: [linhaBoa(EAN_A, 'Arroz', 10), linhaBoa(EAN_B, 'Feijão', 8)] });
    const { mercadoId } = await importarPlanilha(repo, inicial, ADMIN);

    const manual = (await repo.acharOferta(mercadoId, EAN_A))!;
    await repo.salvarOferta({ ...manual, preco: 99 });

    const nova = await montar({ produtos: [linhaBoa(EAN_A, 'Arroz', 10), linhaBoa(EAN_C, 'Sal', 3)] });
    await importarPlanilha(repo, nova, ADMIN);

    expect((await repo.acharOferta(mercadoId, EAN_A))!.preco).toBe(10);
    expect(await repo.acharOferta(mercadoId, EAN_B)).not.toBeNull();
    expect(await repo.acharOferta(mercadoId, EAN_C)).not.toBeNull();
  });
});

describe('importarPlanilha: Disponível', () => {
  it('não vira false, talvez vira erro de linha, em branco vira true', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [
        [EAN_A, 'Arroz', 10, null, null, 'não'],
        [EAN_B, 'Feijão', 8, null, null, 'talvez'],
        [EAN_C, 'Sal', 3, null, null, null],
      ],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.importadas).toBe(2);
    expect(relatorio.erros).toHaveLength(1);
    expect(relatorio.erros[0]).toMatchObject({ linha: 3 });
    expect(relatorio.erros[0]!.motivo).toContain('Disponível');
    expect((await repo.acharOferta(relatorio.mercadoId, EAN_A))!.disponivel).toBe(false);
    expect(await repo.acharOferta(relatorio.mercadoId, EAN_B)).toBeNull();
    expect((await repo.acharOferta(relatorio.mercadoId, EAN_C))!.disponivel).toBe(true);
  });

  it.each([
    ['SIM', true],
    ['s', true],
    ['true', true],
    [1, true],
    ['Não', false],
    ['nao', false],
    ['N', false],
    ['false', false],
    [0, false],
  ])('aceita %j como %s', async (valor, esperado) => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({ produtos: [[EAN_A, 'Arroz', 10, null, null, valor]] });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.erros).toEqual([]);
    expect((await repo.acharOferta(relatorio.mercadoId, EAN_A))!.disponivel).toBe(esperado);
  });
});

describe('importarPlanilha: linhas ruins', () => {
  it('cada linha ruim vira { linha, motivo } e as boas entram', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [
        linhaBoa(EAN_A, 'Arroz', 10), // linha 2: boa
        ['', 'Sem código', 5, null, null, null], // linha 3
        [EAN_B.slice(0, 12) + ((Number(EAN_B[12]) + 1) % 10), 'Dígito errado', 5, null, null, null], // linha 4
        [EAN_C, 'Preço ruim', 'abc', null, null, null], // linha 5
        [ean13('789007003565'), 'Preço zero', 0, null, null, null], // linha 6
        [ean13('789007003566'), '', 5, null, null, null], // linha 7
        linhaBoa(ean13('789007003567'), 'Feijão', 7), // linha 8: boa
      ],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);

    expect(relatorio.importadas).toBe(2);
    expect(relatorio.erros.map((e) => e.linha)).toEqual([3, 4, 5, 6, 7]);
    for (const erro of relatorio.erros) expect(erro.motivo.length).toBeGreaterThan(0);
    expect(relatorio.erros[0]!.motivo).toContain('Código de barras');
    expect(relatorio.erros[1]!.motivo).toContain('verificador');
    expect(relatorio.erros[2]!.motivo).toContain('Preço');
    expect(relatorio.erros[3]!.motivo).toContain('Preço');
    expect(relatorio.erros[4]!.motivo).toContain('Produto');
    expect(await repo.listarOfertasDoMercado(relatorio.mercadoId)).toHaveLength(2);
  });

  it('mesmo código duas vezes: vale a última e a primeira vira erro "duplicado"', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [linhaBoa(EAN_A, 'Arroz velho', 10), linhaBoa(EAN_B, 'Feijão', 8), linhaBoa(EAN_A, 'Arroz novo', 12)],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);

    expect(relatorio.importadas).toBe(2);
    expect(relatorio.erros).toHaveLength(1);
    expect(relatorio.erros[0]!.linha).toBe(2);
    expect(relatorio.erros[0]!.motivo).toContain('duplicado');
    expect(relatorio.erros[0]!.motivo).toContain('4');
    const oferta = (await repo.acharOferta(relatorio.mercadoId, EAN_A))!;
    expect(oferta.nome).toBe('Arroz novo');
    expect(oferta.preco).toBe(12);
  });

  it('linhas totalmente vazias são ignoradas (nem erro, nem contadas)', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [linhaBoa(EAN_A), [null, null, null, null, null, null], ['  ', '', null], linhaBoa(EAN_B)],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.importadas).toBe(2);
    expect(relatorio.erros).toEqual([]);
  });
});

describe('importarPlanilha: valores das células', () => {
  it('código numérico entra; notação científica vira erro de linha', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [
        [7890070035629, 'Papel Fox', 20, null, null, null],
        [7.89007e12, 'Notação científica', 5, null, null, null],
        ['7.89007E+12', 'Texto científico', 5, null, null, null],
      ],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.importadas).toBe(1);
    expect(await repo.acharOferta(relatorio.mercadoId, '7890070035629')).not.toBeNull();
    expect(relatorio.erros.map((e) => e.linha)).toEqual([3, 4]);
    expect(relatorio.erros[1]!.motivo).toContain('científica');
  });

  it('aceita texto rico, resultado de fórmula, hiperlink e preço como texto brasileiro', async () => {
    const repo = criarRepositorioMemoria();
    const wb = new ExcelJS.Workbook();
    const mercado = wb.addWorksheet('Mercado');
    mercado.addRow(['Nome do mercado*', { richText: [{ text: 'Mercado ' }, { text: 'Rico' }] }]);
    mercado.addRow(['Endereço*', { formula: '"Rua "&"B"', result: 'Rua B' }]);
    const produtos = wb.addWorksheet('Produtos');
    produtos.addRow(CABECALHO);
    produtos.addRow([
      EAN_A,
      { text: 'Arroz com link', hyperlink: 'https://exemplo.com' },
      'R$ 1.234,50',
      { richText: [{ text: '5 ' }, { text: 'kg' }] },
      null,
      null,
    ]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.erros).toEqual([]);
    const mercadoSalvo = (await repo.acharMercado(relatorio.mercadoId))!;
    expect(mercadoSalvo.nome).toBe('Mercado Rico');
    expect(mercadoSalvo.endereco).toBe('Rua B');
    const oferta = (await repo.acharOferta(relatorio.mercadoId, EAN_A))!;
    expect(oferta.nome).toBe('Arroz com link');
    expect(oferta.preco).toBe(1234.5);
    expect(oferta.quantidadeTexto).toBe('5 kg');
  });

  it('quantidade: guarda o texto original e só preenche valor/unidade quando entende', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [
        [EAN_A, 'Leite', 5, '  1,5 L ', 'Laticínios', null],
        [EAN_B, 'Coisa', 5, 'um pacotão', null, null],
        [EAN_C, 'Sem quantidade', 5, null, null, null],
      ],
    });
    const { mercadoId } = await importarPlanilha(repo, buffer, ADMIN);
    const leite = (await repo.acharOferta(mercadoId, EAN_A))!;
    expect(leite).toMatchObject({
      quantidadeTexto: '1,5 L',
      quantidadeValor: 1.5,
      quantidadeUnidade: 'L',
      categoria: 'Laticínios',
      nome: 'Leite',
      nomeNorm: 'leite',
      promocaoPreco: null,
      promocaoInicio: null,
      promocaoFim: null,
    });
    expect(await repo.acharOferta(mercadoId, EAN_B)).toMatchObject({
      quantidadeTexto: 'um pacotão',
      quantidadeValor: null,
      quantidadeUnidade: null,
      categoria: null,
    });
    expect(await repo.acharOferta(mercadoId, EAN_C)).toMatchObject({
      quantidadeTexto: null,
      quantidadeValor: null,
      quantidadeUnidade: null,
    });
  });
});

describe('importarPlanilha: erros do arquivo inteiro (nada é gravado)', () => {
  async function esperaErro(buffer: Buffer, trecho: string, ator: Parameters<typeof importarPlanilha>[2] = ADMIN) {
    const repo = criarRepositorioMemoria();
    const promessa = importarPlanilha(repo, buffer, ator);
    await expect(promessa).rejects.toBeInstanceOf(ErroPlanilha);
    await expect(promessa).rejects.toThrow(trecho);
    expect(await mercadosGravados(repo)).toHaveLength(0);
    expect(await repo.listarOfertasParaBusca()).toHaveLength(0);
  }

  it('cabeçalhos sem asterisco, sem acento e em maiúsculas funcionam', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      cabecalho: ['codigo de barras', 'PRODUTO', 'preço', 'quantidade', 'CATEGORIA', 'disponivel'],
      produtos: [linhaBoa(EAN_A)],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.importadas).toBe(1);
  });

  it('rótulos da aba Mercado sem asterisco e abas desconhecidas são aceitos/ignorados', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      mercado: [
        ['nome do mercado', 'Mercado X'],
        ['ENDERECO', 'Rua Z, 9'],
      ],
      produtos: [linhaBoa(EAN_A)],
      abaExtra: true,
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.importadas).toBe(1);
    expect((await repo.acharMercado(relatorio.mercadoId))!.nome).toBe('Mercado X');
  });

  it('aba Produtos ausente', async () => {
    await esperaErro(await montar({ produtos: null }), 'Produtos');
  });

  it('aba Mercado ausente', async () => {
    await esperaErro(await montar({ mercado: null, produtos: [linhaBoa(EAN_A)] }), 'Mercado');
  });

  it('coluna Preço ausente', async () => {
    const buffer = await montar({
      cabecalho: ['Código de barras*', 'Produto*', 'Quantidade'],
      produtos: [[EAN_A, 'Arroz', '1 kg']],
    });
    await esperaErro(buffer, 'Preço');
  });

  it('aba Mercado sem endereço', async () => {
    await esperaErro(
      await montar({ mercado: [['Nome do mercado*', 'Mercado Teste']], produtos: [linhaBoa(EAN_A)] }),
      'Endereço',
    );
  });

  it('aba Mercado com endereço em branco', async () => {
    await esperaErro(
      await montar({
        mercado: [
          ['Nome do mercado*', 'Mercado Teste'],
          ['Endereço*', '  '],
        ],
        produtos: [linhaBoa(EAN_A)],
      }),
      'Endereço',
    );
  });

  it('aba Mercado com nome em branco', async () => {
    await esperaErro(
      await montar({
        mercado: [
          ['Nome do mercado*', null],
          ['Endereço*', 'Rua A, 1'],
        ],
        produtos: [linhaBoa(EAN_A)],
      }),
      'Nome do mercado',
    );
  });

  it('um .txt renomeado para .xlsx', async () => {
    await esperaErro(Buffer.from('isto não é uma planilha, só texto'), 'Arquivo inválido: envie uma planilha .xlsx');
  });

  it('buffer maior que 5 MB', async () => {
    await esperaErro(Buffer.alloc(LIMITE_BYTES + 1), '5 MB');
  });

  it('5001 linhas de dados', async () => {
    const produtos: unknown[][] = [];
    for (let i = 0; i < LIMITE_LINHAS + 1; i++) {
      produtos.push(linhaBoa(ean13(String(100000000000 + i)), `Produto ${i}`, 1));
    }
    await esperaErro(await montar({ produtos }), String(LIMITE_LINHAS));
  });

  it('exatamente 5000 linhas de dados são aceitas', async () => {
    const repo = criarRepositorioMemoria();
    const produtos: unknown[][] = [];
    for (let i = 0; i < LIMITE_LINHAS; i++) {
      produtos.push(linhaBoa(ean13(String(100000000000 + i)), `Produto ${i}`, 1));
    }
    const relatorio = await importarPlanilha(repo, await montar({ produtos }), ADMIN);
    expect(relatorio.importadas).toBe(LIMITE_LINHAS);
    expect(relatorio.erros).toEqual([]);
  }, 60000);

  it('mercado removido (ator admin)', async () => {
    const repo = criarRepositorioMemoria();
    await repo.criarMercado({
      nome: 'Mercado Teste',
      endereco: 'Rua A, 1',
      nomeNorm: normalizarTexto('Mercado Teste'),
      enderecoNorm: normalizarTexto('Rua A, 1'),
      status: 'removido',
      contaSituacao: 'gratuita',
      usuarioId: null,
    });
    const promessa = importarPlanilha(repo, await montar({ produtos: [linhaBoa(EAN_A)] }), ADMIN);
    await expect(promessa).rejects.toBeInstanceOf(ErroPlanilha);
    expect(await repo.listarOfertasDoMercado(1)).toHaveLength(0);
  });
});

describe('importarPlanilha: ator mercado', () => {
  async function novoMercado(repo: Repositorio, nome: string, endereco: string, status: 'ativo' | 'removido' = 'ativo') {
    return repo.criarMercado({
      nome,
      endereco,
      nomeNorm: normalizarTexto(nome),
      enderecoNorm: normalizarTexto(endereco),
      status,
      contaSituacao: 'ativa',
      usuarioId: null,
    });
  }

  it('grava as ofertas no próprio mercado, sem criar outro', async () => {
    const repo = criarRepositorioMemoria();
    const meu = await novoMercado(repo, 'Mercado Teste', 'Rua A, 1');
    const relatorio = await importarPlanilha(
      repo,
      await montar({ produtos: [linhaBoa(EAN_A)] }),
      { papel: 'mercado', mercadoId: meu.id },
    );
    expect(relatorio).toMatchObject({ mercadoId: meu.id, mercadoCriado: false, importadas: 1, erros: [] });
    expect(await mercadosGravados(repo)).toHaveLength(1);
  });

  it('nome/endereço diferentes na aba atualizam o próprio mercado', async () => {
    const repo = criarRepositorioMemoria();
    const meu = await novoMercado(repo, 'Nome Antigo', 'Rua Antiga, 5');
    const relatorio = await importarPlanilha(
      repo,
      await montar({
        mercado: [
          ['Nome do mercado*', 'Mercado Novo'],
          ['Endereço*', 'Avenida Nova, 10'],
        ],
        produtos: [linhaBoa(EAN_A)],
      }),
      { papel: 'mercado', mercadoId: meu.id },
    );
    expect(relatorio.mercadoId).toBe(meu.id);
    expect(relatorio.mercadoCriado).toBe(false);
    expect(await repo.acharMercado(meu.id)).toMatchObject({
      nome: 'Mercado Novo',
      endereco: 'Avenida Nova, 10',
      nomeNorm: 'mercado novo',
      enderecoNorm: 'avenida nova 10',
      status: 'ativo',
      contaSituacao: 'ativa',
    });
  });

  it('nome/endereço de outro mercado existente: ErroPlanilha e nada gravado', async () => {
    const repo = criarRepositorioMemoria();
    await novoMercado(repo, 'Mercado Teste', 'Rua A, 1');
    const meu = await novoMercado(repo, 'Meu Mercado', 'Rua B, 2');
    const promessa = importarPlanilha(repo, await montar({ produtos: [linhaBoa(EAN_A)] }), {
      papel: 'mercado',
      mercadoId: meu.id,
    });
    await expect(promessa).rejects.toBeInstanceOf(ErroPlanilha);
    expect(await repo.acharMercado(meu.id)).toMatchObject({ nome: 'Meu Mercado', endereco: 'Rua B, 2' });
    expect(await repo.listarOfertasDoMercado(meu.id)).toHaveLength(0);
  });

  it('mercado inexistente ou removido: ErroPlanilha', async () => {
    const repo = criarRepositorioMemoria();
    const removido = await novoMercado(repo, 'Mercado Teste', 'Rua A, 1', 'removido');
    const buffer = await montar({ produtos: [linhaBoa(EAN_A)] });
    await expect(importarPlanilha(repo, buffer, { papel: 'mercado', mercadoId: removido.id })).rejects.toBeInstanceOf(
      ErroPlanilha,
    );
    await expect(importarPlanilha(repo, buffer, { papel: 'mercado', mercadoId: 999 })).rejects.toBeInstanceOf(
      ErroPlanilha,
    );
  });
});

describe('gerarModelo', () => {
  async function ler(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  }

  it('tem as abas Mercado, Produtos e Instruções com rótulos e sem dados', async () => {
    const wb = await ler(await gerarModelo());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Mercado', 'Produtos', 'Instruções']);

    const mercado = wb.getWorksheet('Mercado')!;
    expect(mercado.getCell('A1').value).toBe('Nome do mercado*');
    expect(mercado.getCell('A2').value).toBe('Endereço*');
    expect(mercado.getCell('B1').value ?? null).toBeNull();
    expect(mercado.getCell('B2').value ?? null).toBeNull();

    const produtos = wb.getWorksheet('Produtos')!;
    expect(produtos.getRow(1).values).toEqual([
      undefined,
      'Código de barras*',
      'Produto*',
      'Preço*',
      'Quantidade',
      'Categoria',
      'Disponível',
    ]);
    expect(produtos.actualRowCount).toBe(1);

    const instrucoes = wb.getWorksheet('Instruções')!;
    const texto = JSON.stringify(instrucoes.getSheetValues());
    expect(texto).toContain('Bolso Certo');
    expect(instrucoes.actualRowCount).toBeGreaterThan(2);
  });

  it('o modelo em branco é recusado pelo importador (falta nome e endereço) e nada é gravado', async () => {
    const repo = criarRepositorioMemoria();
    await expect(importarPlanilha(repo, await gerarModelo(), ADMIN)).rejects.toBeInstanceOf(ErroPlanilha);
    expect(await mercadosGravados(repo)).toHaveLength(0);
  });

  it('o modelo com nome e endereço preenchidos importa 0 produtos (o exemplo não é importado)', async () => {
    const repo = criarRepositorioMemoria();
    const wb = await ler(await gerarModelo());
    const mercado = wb.getWorksheet('Mercado')!;
    mercado.getCell('B1').value = 'Mercado do Modelo';
    mercado.getCell('B2').value = 'Rua do Modelo, 3';
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio).toMatchObject({ mercadoCriado: true, importadas: 0, erros: [] });
  });
});
