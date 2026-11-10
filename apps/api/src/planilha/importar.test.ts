import { readFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { LIMITE_BYTES, LIMITE_LINHAS, normalizarTexto } from '@mercado/shared';
import { describe, expect, it } from 'vitest';
import type { Mercado, Repositorio } from '../repositorio';
import { criarRepositorioMemoria } from '../repositorioMemoria';
import { conferirZip, LIMITE_ATRIBUTOS_XML } from './conferirZip';
import { ErroPlanilha, importarPlanilha, LIMITE_ENTRADA_BYTES, LIMITE_TOTAL_BYTES } from './importar';
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

  it('a aba Mercado da planilha NÃO muda o próprio mercado (nome, endereço e telefone ficam em "Meu mercado")', async () => {
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
    expect(relatorio).toMatchObject({ mercadoId: meu.id, mercadoCriado: false, importadas: 1 });
    expect(await repo.acharMercado(meu.id)).toMatchObject({ nome: 'Nome Antigo', endereco: 'Rua Antiga, 5' });
    expect(await mercadosGravados(repo)).toHaveLength(1);
  });

  it('nome/endereço da aba iguais aos de outro mercado não atrapalham: os produtos vão para o próprio mercado', async () => {
    const repo = criarRepositorioMemoria();
    await novoMercado(repo, 'Mercado Teste', 'Rua A, 1');
    const meu = await novoMercado(repo, 'Meu Mercado', 'Rua B, 2');
    const relatorio = await importarPlanilha(repo, await montar({ produtos: [linhaBoa(EAN_A)] }), {
      papel: 'mercado',
      mercadoId: meu.id,
    });
    expect(relatorio.mercadoId).toBe(meu.id);
    expect(await repo.listarOfertasDoMercado(meu.id)).toHaveLength(1);
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

  it('tem as abas Mercado, Produtos, Descontos e Instruções com rótulos e sem dados', async () => {
    const wb = await ler(await gerarModelo());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Mercado', 'Produtos', 'Descontos', 'Instruções']);

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
      'Foto', // opcional: link da imagem do produto
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

describe('importarPlanilha: limites de leitura do arquivo (R14)', () => {
  const MENSAGEM = 'grande demais';

  function adicionarMesclagem(buffer: Buffer, ref: string): Buffer {
    const arquivos = unzipSync(new Uint8Array(buffer));
    const nome = 'xl/worksheets/sheet1.xml';
    let xml = strFromU8(arquivos[nome]!);
    const mescla = `<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells>`;
    // Ordem do OOXML: mergeCells vem depois de sheetData e antes de pageMargins.
    xml = xml.includes('<pageMargins')
      ? xml.replace('<pageMargins', `${mescla}<pageMargins`)
      : xml.replace('</worksheet>', `${mescla}</worksheet>`);
    arquivos[nome] = strToU8(xml);
    return Buffer.from(zipSync(arquivos));
  }

  it('mesclagem gigante (A1:Z1000000) é recusada rápido e nada é gravado', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = adicionarMesclagem(await montar({ produtos: [linhaBoa(EAN_A)] }), 'A1:Z1000000');
    const inicio = Date.now();
    const promessa = importarPlanilha(repo, buffer, ADMIN);
    await expect(promessa).rejects.toBeInstanceOf(ErroPlanilha);
    await expect(promessa).rejects.toThrow(MENSAGEM);
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(await mercadosGravados(repo)).toHaveLength(0);
  });

  it('a mesclagem remendada é uma planilha legítima: sem o limite, o arquivo seria carregável', async () => {
    // Garante que o teste acima falha por causa do limite, e não por um zip malformado.
    const buffer = adicionarMesclagem(await montar({ produtos: [linhaBoa(EAN_A)] }), 'D1:E2');
    const relatorio = await importarPlanilha(criarRepositorioMemoria(), buffer, ADMIN);
    expect(relatorio.importadas).toBe(1);
  });

  it('várias mesclagens que somam mais de 50.000 células são recusadas', async () => {
    const repo = criarRepositorioMemoria();
    const wb = new ExcelJS.Workbook();
    const mercado = wb.addWorksheet('Mercado');
    MERCADO_PADRAO.forEach((linha) => mercado.addRow(linha));
    wb.addWorksheet('Produtos').addRow(CABECALHO);
    const extra = wb.addWorksheet('Instruções');
    // 6 mesclagens de 9.000 células (54.000 no total), cada uma abaixo do limite individual.
    for (let i = 0; i < 6; i++) extra.mergeCells(`${String.fromCharCode(65 + i)}1:${String.fromCharCode(65 + i)}9000`);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(importarPlanilha(repo, buffer, ADMIN)).rejects.toThrow(MENSAGEM);
  });

  it('entrada de 40 MiB de zeros (poucos KB compactados) é recusada sem ser lida pelo exceljs', async () => {
    const repo = criarRepositorioMemoria();
    const bomba = Buffer.from(zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(40 * 1024 * 1024) }));
    expect(bomba.length).toBeLessThan(LIMITE_BYTES);
    const inicio = Date.now();
    const promessa = importarPlanilha(repo, bomba, ADMIN);
    await expect(promessa).rejects.toBeInstanceOf(ErroPlanilha);
    await expect(promessa).rejects.toThrow(MENSAGEM);
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(await mercadosGravados(repo)).toHaveLength(0);
  });

  it('várias entradas que somam mais de 30 MiB são recusadas', async () => {
    const repo = criarRepositorioMemoria();
    const arquivos: Record<string, Uint8Array> = {};
    for (let i = 0; i < 4; i++) arquivos[`xl/extra${i}.bin`] = new Uint8Array(10 * 1024 * 1024);
    await expect(importarPlanilha(repo, Buffer.from(zipSync(arquivos)), ADMIN)).rejects.toThrow(MENSAGEM);
  });

  it('mesclagem pequena (A1:C1 numa aba de instruções) continua aceita', async () => {
    const repo = criarRepositorioMemoria();
    const wb = new ExcelJS.Workbook();
    const mercado = wb.addWorksheet('Mercado');
    MERCADO_PADRAO.forEach((linha) => mercado.addRow(linha));
    const produtos = wb.addWorksheet('Produtos');
    produtos.addRow(CABECALHO);
    produtos.addRow(linhaBoa(EAN_A));
    const instrucoes = wb.addWorksheet('Instruções');
    instrucoes.addRow(['Título longo']);
    instrucoes.mergeCells('A1:C1');
    const relatorio = await importarPlanilha(repo, Buffer.from(await wb.xlsx.writeBuffer()), ADMIN);
    expect(relatorio).toMatchObject({ importadas: 1, erros: [] });
  });
});

describe('importarPlanilha: casos de borda', () => {
  it('5000 linhas de dados intercaladas com linhas em branco são aceitas', async () => {
    const repo = criarRepositorioMemoria();
    const produtos: unknown[][] = [];
    for (let i = 0; i < LIMITE_LINHAS; i++) {
      produtos.push(linhaBoa(ean13(String(100000000000 + i)), `Produto ${i}`, 1), [null, null, null]);
    }
    const relatorio = await importarPlanilha(repo, await montar({ produtos }), ADMIN);
    expect(relatorio.importadas).toBe(LIMITE_LINHAS);
    expect(relatorio.erros).toEqual([]);
  }, 60000);

  it('uma única célula na linha 1.000.000 vira erro de linha, sem travar', async () => {
    const repo = criarRepositorioMemoria();
    const wb = new ExcelJS.Workbook();
    const mercado = wb.addWorksheet('Mercado');
    MERCADO_PADRAO.forEach((linha) => mercado.addRow(linha));
    const produtos = wb.addWorksheet('Produtos');
    produtos.addRow(CABECALHO);
    produtos.getCell('B1000000').value = 'solto';
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const inicio = Date.now();
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(relatorio.importadas).toBe(0);
    expect(relatorio.erros).toHaveLength(1);
    expect(relatorio.erros[0]!.linha).toBe(1000000);
  });

  it('duplicado posterior inválido: a primeira linha continua salva e só a segunda vira erro', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [linhaBoa(EAN_A, 'Arroz', 10), [EAN_A, 'Arroz de novo', 'abc', null, null, null]],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.importadas).toBe(1);
    expect(relatorio.erros).toHaveLength(1);
    expect(relatorio.erros[0]!.linha).toBe(3);
    expect(relatorio.erros[0]!.motivo).not.toContain('duplicado');
    expect(await repo.acharOferta(relatorio.mercadoId, EAN_A)).toMatchObject({ nome: 'Arroz', preco: 10 });
  });

  it('código de barras texto com espaços nas pontas é aceito', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({ produtos: [[' 7890070035629 ', 'Papel Fox', 20, null, null, null]] });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.erros).toEqual([]);
    expect(await repo.acharOferta(relatorio.mercadoId, '7890070035629')).not.toBeNull();
  });

  it('preço numérico com ruído de ponto flutuante (0.1 + 0.2) é guardado como 0.3', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({ produtos: [[EAN_A, 'Bala', 0.1 + 0.2, null, null, null]] });
    const { mercadoId } = await importarPlanilha(repo, buffer, ADMIN);
    expect((await repo.acharOferta(mercadoId, EAN_A))!.preco).toBe(0.3);
  });

  it('célula booleana real em Disponível: true = sim, false = não', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [
        [EAN_A, 'Arroz', 10, null, null, true],
        [EAN_B, 'Feijão', 8, null, null, false],
      ],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.erros).toEqual([]);
    expect((await repo.acharOferta(relatorio.mercadoId, EAN_A))!.disponivel).toBe(true);
    expect((await repo.acharOferta(relatorio.mercadoId, EAN_B))!.disponivel).toBe(false);
  });

  it('fórmula cujo resultado em cache é erro (#N/A) na coluna Preço vira erro de linha', async () => {
    const repo = criarRepositorioMemoria();
    const buffer = await montar({
      produtos: [
        [EAN_A, 'Arroz', { formula: 'NA()', result: { error: '#N/A' } }, null, null, null],
        linhaBoa(EAN_B, 'Feijão', 8),
      ],
    });
    const relatorio = await importarPlanilha(repo, buffer, ADMIN);
    expect(relatorio.importadas).toBe(1);
    expect(relatorio.erros).toHaveLength(1);
    expect(relatorio.erros[0]!.linha).toBe(2);
    expect(relatorio.erros[0]!.motivo).toContain('Preço');
    expect(await repo.acharOferta(relatorio.mercadoId, EAN_A)).toBeNull();
  });
});

describe('conferirZip (R16): lê o zip como o exceljs e limita a descompressão em fluxo', () => {
  const MENSAGEM = 'grande demais';

  /** Troca o elemento mergeCells da planilha por um trecho livre (para escrever variações de sintaxe). */
  async function comTrecho(trecho: string, nomeParte = 'xl/worksheets/sheet1.xml', nomeFinal = nomeParte) {
    const arquivos = unzipSync(new Uint8Array(await montar({ produtos: [linhaBoa(EAN_A)] })));
    let xml = strFromU8(arquivos[nomeParte] ?? new Uint8Array());
    if (xml === '') xml = '<worksheet><sheetData/></worksheet>';
    xml = xml.includes('<pageMargins')
      ? xml.replace('<pageMargins', `${trecho}<pageMargins`)
      : xml.replace('</worksheet>', `${trecho}</worksheet>`);
    delete arquivos[nomeParte];
    arquivos[nomeFinal] = strToU8(xml);
    return Buffer.from(zipSync(arquivos));
  }

  async function recusa(buffer: Buffer) {
    const repo = criarRepositorioMemoria();
    const inicio = Date.now();
    const promessa = importarPlanilha(repo, buffer, ADMIN);
    await expect(promessa).rejects.toBeInstanceOf(ErroPlanilha);
    await expect(promessa).rejects.toThrow(MENSAGEM);
    expect(Date.now() - inicio).toBeLessThan(3000);
    expect(await repo.listarMercados()).toHaveLength(0);
  }

  it('bomba de 64 MiB de zeros (DEFLATE, alguns KB) é recusada em poucos segundos', async () => {
    const bomba = Buffer.from(zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(64 * 1024 * 1024) }, { level: 9 }));
    expect(bomba.length).toBeLessThan(200 * 1024);
    await recusa(bomba);
  });

  it('a descompressão para cedo: bem menos bytes contados do que o tamanho real da entrada', async () => {
    const tamanhoReal = 64 * 1024 * 1024;
    const bomba = Buffer.from(zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(tamanhoReal) }, { level: 9 }));
    const contador = { bytes: 0 };
    await expect(conferirZip(bomba, contador)).rejects.toBeInstanceOf(ErroPlanilha);
    expect(contador.bytes).toBeGreaterThan(LIMITE_ENTRADA_BYTES);
    // Passou do limite por poucos pedaços, nunca pelo tamanho da bomba.
    expect(contador.bytes).toBeLessThan(LIMITE_ENTRADA_BYTES + 4 * 1024 * 1024);
    expect(contador.bytes).toBeLessThan(tamanhoReal / 2);
  });

  it('o total entre entradas também para cedo', async () => {
    const arquivos: Record<string, Uint8Array> = {};
    for (let i = 0; i < 6; i++) arquivos[`xl/extra${i}.bin`] = new Uint8Array(15 * 1024 * 1024);
    const contador = { bytes: 0 };
    await expect(conferirZip(Buffer.from(zipSync(arquivos)), contador)).rejects.toThrow(MENSAGEM);
    expect(contador.bytes).toBeLessThan(LIMITE_TOTAL_BYTES + 4 * 1024 * 1024);
  });

  it.each([
    ['espaços ao redor do "="', '<mergeCells count="1"><mergeCell ref = "A1:Z4000"/></mergeCells>'],
    ['aspas simples', "<mergeCells count=\"1\"><mergeCell ref='A1:Z4000'/></mergeCells>"],
    ['prefixo de namespace x:', '<x:mergeCells count="1"><x:mergeCell ref="A1:Z4000"/></x:mergeCells>'],
    ['ref depois de outro atributo, com quebra de linha', '<mergeCells><mergeCell\n  id="1"\n  ref\n=\n"A1:Z4000"/></mergeCells>'],
    ['referências absolutas com $', '<mergeCells><mergeCell ref="$A$1:$Z$4000"/></mergeCells>'],
  ])('mesclagem grande escrita com %s é recusada', async (_nome, trecho) => {
    await recusa(await comTrecho(trecho));
  });

  it('planilha guardada com nome de entrada começando por "/" também é conferida', async () => {
    const buffer = await comTrecho(
      '<mergeCells count="1"><mergeCell ref="A1:Z4000"/></mergeCells>',
      'xl/worksheets/sheet1.xml',
      '/xl/worksheets/sheet1.xml',
    );
    await recusa(buffer);
  });

  it('a conferência cobre qualquer parte .xml, mesmo fora de xl/worksheets', async () => {
    const buffer = await comTrecho(
      '<mergeCells count="1"><mergeCell ref="A1:Z4000"/></mergeCells>',
      'xl/outra/parte-estranha.xml',
    );
    await recusa(buffer);
  });

  it.each([
    ['soma de colunas e linhas que estoura a conta ingênua', 'A1:' + 'Z'.repeat(400) + '99999999999999999999'],
    ['colunas idênticas gigantes (Infinity - Infinity)', 'A'.repeat(400) + '1:' + 'A'.repeat(400) + '2'],
    ['linhas com centenas de dígitos', 'A1:B' + '9'.repeat(400)],
  ])('mesclagem cuja área estoura a aritmética (%s) é recusada', async (_nome, ref) => {
    await recusa(await comTrecho(`<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells>`));
  });

  it('referência que não é faixa nem célula é recusada (falha fechada, R18a)', async () => {
    await recusa(await comTrecho('<mergeCells count="1"><mergeCell ref="isto-nao-e-faixa"/></mergeCells>'));
  });

  it('um .xml sem fim de tag e com milhares de "<mergeCell " não trava a conferência (regex limitada)', async () => {
    const lixo = '<mergeCell '.repeat(200_000);
    const buffer = Buffer.from(zipSync({ 'xl/lixo.xml': strToU8(lixo) }));
    const inicio = Date.now();
    await expect(conferirZip(buffer)).resolves.toBeUndefined();
    expect(Date.now() - inicio).toBeLessThan(3000);
  });

  it('zip sem entradas e arquivo que não é zip dão "Arquivo inválido"', async () => {
    await expect(conferirZip(Buffer.from(zipSync({})))).rejects.toThrow('Arquivo inválido');
    await expect(conferirZip(Buffer.from('não sou um zip'))).rejects.toThrow('Arquivo inválido');
  });
});

describe('conferirZip (R17): tokenizador XML do exceljs em toda entrada, qualquer nome', () => {
  const MENSAGEM = 'grande demais';
  const MESCLAGEM_GRANDE = '<mergeCells count="1"><mergeCell ref="A1:Z400"/></mergeCells>'; // 10.400 células

  async function arquivosDoModelo() {
    return unzipSync(new Uint8Array(await montar({ produtos: [linhaBoa(EAN_A)] })));
  }

  function comTrecho(arquivos: Record<string, Uint8Array>, trecho: string): Record<string, Uint8Array> {
    const xml = strFromU8(arquivos['xl/worksheets/sheet1.xml']!);
    const novo = xml.includes('<pageMargins')
      ? xml.replace('<pageMargins', `${trecho}<pageMargins`)
      : xml.replace('</worksheet>', `${trecho}</worksheet>`);
    return { ...arquivos, 'xl/worksheets/sheet1.xml': strToU8(novo) };
  }

  async function recusa(arquivos: Record<string, Uint8Array>, mensagem = MENSAGEM) {
    const repo = criarRepositorioMemoria();
    const inicio = Date.now();
    const promessa = importarPlanilha(repo, Buffer.from(zipSync(arquivos)), ADMIN);
    await expect(promessa).rejects.toBeInstanceOf(ErroPlanilha);
    await expect(promessa).rejects.toThrow(mensagem);
    expect(Date.now() - inicio).toBeLessThan(3000);
    expect(await repo.listarMercados()).toHaveLength(0);
  }

  it('entrada sheet1.xml.rels carregando a mesclagem e apontada pelo rels do workbook é recusada', async () => {
    const arquivos = await arquivosDoModelo();
    const sheet = comTrecho(arquivos, MESCLAGEM_GRANDE)['xl/worksheets/sheet1.xml']!;
    const rels = strFromU8(arquivos['xl/_rels/workbook.xml.rels']!).replace(
      'worksheets/sheet1.xml',
      'worksheets/sheet1.xml.rels',
    );
    const mudado: Record<string, Uint8Array> = { ...arquivos, 'xl/_rels/workbook.xml.rels': strToU8(rels), 'xl/worksheets/sheet1.xml.rels': sheet };
    delete mudado['xl/worksheets/sheet1.xml'];
    expect(rels).toContain('sheet1.xml.rels');
    await recusa(mudado);
  });

  it('entradas com sufixos estranhos (.xmlx, .xml.bin, .dat) também são conferidas', async () => {
    const arquivos = await arquivosDoModelo();
    for (const nome of ['xl/worksheets/sheet1.xmlx', 'xl/worksheets/sheet1.xml.bin', 'xl/qualquer.dat', 'Sem-Extensao']) {
      await recusa({ ...arquivos, [nome]: strToU8(`<worksheet>${MESCLAGEM_GRANDE}</worksheet>`) });
    }
  });

  it.each([
    ['referência de caractere numérico no valor (Z&#52;00 = Z400)', '<mergeCell ref="A1:Z&#52;00"/>'],
    ['referência de caractere hexadecimal (&#x34;)', '<mergeCell ref="A1:Z&#x34;00"/>'],
    ['">" dentro de outro atributo', '<mergeCell x=">" ref="A1:Z400"/>'],
    ['ref depois de 1.100 caracteres de outros atributos', `<mergeCell x="${'a'.repeat(1100)}" ref="A1:Z400"/>`],
    ['espaços ao redor do "="', '<mergeCell ref = "A1:Z400"/>'],
    ['aspas simples', "<mergeCell ref='A1:Z400'/>"],
    ['prefixo de namespace x:', '<x:mergeCell xmlns:x="http://exemplo" ref="A1:Z400"/>'],
    ['referências absolutas com $', '<mergeCell ref="$A$1:$Z$400"/>'],
    ['area que estoura a aritmética', `<mergeCell ref="A1:${'Z'.repeat(400)}99999999999999999999"/>`],
    ['colunas idênticas gigantes', `<mergeCell ref="${'A'.repeat(400)}1:${'A'.repeat(400)}2"/>`],
  ])('mesclagem grande com %s é recusada', async (_nome, elemento) => {
    const arquivos = await arquivosDoModelo();
    await recusa(comTrecho(arquivos, `<mergeCells count="1">${elemento}</mergeCells>`));
  });

  it('o elemento mergeCell dentro de comentário ou CDATA não conta', async () => {
    const repo = criarRepositorioMemoria();
    const arquivos = await arquivosDoModelo();
    const comComentario = comTrecho(arquivos, `<!-- ${MESCLAGEM_GRANDE} -->`);
    comComentario['xl/custom/dados.xml'] = strToU8(`<raiz><![CDATA[${MESCLAGEM_GRANDE}]]></raiz>`);
    const relatorio = await importarPlanilha(repo, Buffer.from(zipSync(comComentario)), ADMIN);
    expect(relatorio).toMatchObject({ importadas: 1, erros: [] });
    await expect(conferirZip(Buffer.from(zipSync(comComentario)))).resolves.toBeUndefined();
  });

  it('uma entrada binária qualquer (imagem) não atrapalha uma importação válida', async () => {
    const repo = criarRepositorioMemoria();
    const arquivos = await arquivosDoModelo();
    const aleatorio = new Uint8Array(50_000);
    let semente = 12345;
    for (let i = 0; i < aleatorio.length; i++) {
      semente = (semente * 1103515245 + 12345) & 0x7fffffff;
      aleatorio[i] = semente & 0xff;
    }
    const relatorio = await importarPlanilha(
      repo,
      Buffer.from(zipSync({ ...arquivos, 'xl/media/image1.png': aleatorio })),
      ADMIN,
    );
    expect(relatorio).toMatchObject({ importadas: 1, erros: [] });
  });

  it.each([
    ['XML não fechado', '<worksheet><sheetData>'],
    ['texto que não é XML', 'isto não é uma planilha'],
    ['sem elemento raiz', ''],
  ])('planilha reconhecida pelo exceljs que não é XML bem formado (%s) é "Arquivo inválido"', async (_nome, conteudo) => {
    const arquivos = await arquivosDoModelo();
    await recusa({ ...arquivos, 'xl/worksheets/sheet1.xml': strToU8(conteudo) }, 'Arquivo inválido');
  });

  it('a mesma regra vale para o nome com barra inicial', async () => {
    const arquivos = await arquivosDoModelo();
    await recusa({ ...arquivos, '/xl/worksheets/sheet2.xml': strToU8('<worksheet>') }, 'Arquivo inválido');
  });

  it('parte não reconhecida pelo exceljs com XML malformado é ignorada', async () => {
    const arquivos = await arquivosDoModelo();
    await expect(
      conferirZip(Buffer.from(zipSync({ ...arquivos, 'xl/custom/quebrado.xml': strToU8('<a><b></a>') }))),
    ).resolves.toBeUndefined();
  });
});

describe('conferirZip (R18): referências estritas e profundidade limitada', () => {
  async function arquivosDoModelo() {
    return unzipSync(new Uint8Array(await montar({ produtos: [linhaBoa(EAN_A)] })));
  }

  function comTrecho(arquivos: Record<string, Uint8Array>, trecho: string): Record<string, Uint8Array> {
    const xml = strFromU8(arquivos['xl/worksheets/sheet1.xml']!);
    const novo = xml.includes('<pageMargins')
      ? xml.replace('<pageMargins', `${trecho}<pageMargins`)
      : xml.replace('</worksheet>', `${trecho}</worksheet>`);
    return { ...arquivos, 'xl/worksheets/sheet1.xml': strToU8(novo) };
  }

  async function recusa(arquivos: Record<string, Uint8Array>, mensagem: string, limiteMs = 3000) {
    const repo = criarRepositorioMemoria();
    const inicio = Date.now();
    const promessa = importarPlanilha(repo, Buffer.from(zipSync(arquivos)), ADMIN);
    await expect(promessa).rejects.toBeInstanceOf(ErroPlanilha);
    await expect(promessa).rejects.toThrow(mensagem);
    expect(Date.now() - inicio).toBeLessThan(limiteMs);
    expect(await repo.listarMercados()).toHaveLength(0);
  }

  // O exceljs (colCache.decodeAddress) lê cada uma destas como A1:Z400 (10.400 células) ou pior.
  it.each([
    'A1:Z400x',
    'A1:Z400;',
    'A1:Z400,',
    'A1:Z400#',
    'Sheet1!A1:Z400',
    '!A1:Z400',
    'A1B:Z400',
    'A1:Z400:A2',
    'A1:Z400:B5',
    'A1:XFD1048576x',
  ])('referência fora da forma estrita (%s) recusa o arquivo como "grande demais"', async (ref) => {
    const arquivos = await arquivosDoModelo();
    await recusa(comTrecho(arquivos, `<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells>`), 'grande demais');
  });

  it.each(['a1:b2', ' A1:B2', 'A1:B2 ', 'A0:B2', 'XFE1', 'A1048577', 'A01:B2', ''])(
    'outras referências não estritas (%j) também são recusadas',
    async (ref) => {
      const arquivos = await arquivosDoModelo();
      await expect(
        conferirZip(Buffer.from(zipSync(comTrecho(arquivos, `<mergeCells><mergeCell ref="${ref}"/></mergeCells>`)))),
      ).rejects.toThrow('grande demais');
    },
  );

  it('mergeCell sem atributo ref não recusa o arquivo', async () => {
    const arquivos = await arquivosDoModelo();
    await expect(
      conferirZip(Buffer.from(zipSync(comTrecho(arquivos, '<mergeCells count="1"><mergeCell/></mergeCells>')))),
    ).resolves.toBeUndefined();
  });

  it.each(['A1', '$A$1:$C$3', 'XFD1048576', 'A1:A10000'])('referência estrita pequena (%s) passa', async (ref) => {
    const arquivos = await arquivosDoModelo();
    await expect(
      conferirZip(Buffer.from(zipSync(comTrecho(arquivos, `<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells>`)))),
    ).resolves.toBeUndefined();
  });

  it('faixa estrita que cobre a planilha toda (A1:XFD1048576) é recusada', async () => {
    const arquivos = await arquivosDoModelo();
    await recusa(comTrecho(arquivos, '<mergeCells count="1"><mergeCell ref="A1:XFD1048576"/></mergeCells>'), 'grande demais');
  });

  const BOMBA_ANINHADA = '<a>'.repeat(Math.floor((2 * 1024 * 1024) / 3)); // ~2 MiB, ~700 mil níveis

  it.each(['x/a.bin', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet7.xml'])(
    'bomba de aninhamento na entrada %s é "Arquivo inválido" em pouco tempo',
    async (nome) => {
      const arquivos = await arquivosDoModelo();
      const comBomba = { ...arquivos, [nome]: strToU8(BOMBA_ANINHADA) };
      const inicio = Date.now();
      await expect(conferirZip(Buffer.from(zipSync(comBomba)))).rejects.toThrow('Arquivo inválido');
      expect(Date.now() - inicio).toBeLessThan(1000);
      await recusa(comBomba, 'Arquivo inválido', 2000);
    },
  );

  it('documento profundo mas razoável (100 níveis) e o limite exato (128) passam; 129 é recusado', async () => {
    const arquivos = await arquivosDoModelo();
    const aninhado = (n: number) => strToU8('<a>'.repeat(n) + 'x' + '</a>'.repeat(n));
    await expect(conferirZip(Buffer.from(zipSync({ ...arquivos, 'x/a.bin': aninhado(100) })))).resolves.toBeUndefined();
    await expect(conferirZip(Buffer.from(zipSync({ ...arquivos, 'x/a.bin': aninhado(128) })))).resolves.toBeUndefined();
    await expect(conferirZip(Buffer.from(zipSync({ ...arquivos, 'x/a.bin': aninhado(129) })))).rejects.toThrow(
      'Arquivo inválido',
    );
  });

  it('muitos elementos irmãos rasos não são recusados e a conferência é rápida', async () => {
    const arquivos = await arquivosDoModelo();
    const raso = strToU8('<r>' + '<a b="c"/>'.repeat(200_000) + '</r>');
    const inicio = Date.now();
    await expect(conferirZip(Buffer.from(zipSync({ ...arquivos, 'x/a.bin': raso })))).resolves.toBeUndefined();
    expect(Date.now() - inicio).toBeLessThan(3000);
  });
});

describe('conferirZip (R30): atributos repetidos e limite de atributos por elemento', () => {
  async function arquivosDoModelo() {
    return unzipSync(new Uint8Array(await montar({ produtos: [linhaBoa(EAN_A)] })));
  }
  const BOMBA_ATRIBUTOS = '<r><a ' + 'b=""  '.repeat(400_000) + '/></r>';
  const comAtributos = (n: number) =>
    '<r><a ' + Array.from({ length: n }, (_, i) => `b${i}="${i}"`).join(' ') + '/></r>';

  it('o limite é exportado e vale 256', () => {
    expect(LIMITE_ATRIBUTOS_XML).toBe(256);
  });

  it.each(['x/a.bin', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml'])(
    '400 mil atributos repetidos na entrada %s: "Arquivo inválido" em pouco tempo, nada gravado',
    async (nome) => {
      const arquivos = await arquivosDoModelo();
      const comBomba = Buffer.from(zipSync({ ...arquivos, [nome]: strToU8(BOMBA_ATRIBUTOS) }));
      let inicio = Date.now();
      await expect(conferirZip(comBomba)).rejects.toThrow('Arquivo inválido: envie uma planilha .xlsx');
      expect(Date.now() - inicio).toBeLessThan(3000);

      const repo = criarRepositorioMemoria();
      inicio = Date.now();
      await expect(importarPlanilha(repo, comBomba, ADMIN)).rejects.toThrow('Arquivo inválido');
      expect(Date.now() - inicio).toBeLessThan(3000);
      expect(await repo.listarMercados()).toHaveLength(0);
    },
  );

  it('200 atributos distintos (abaixo do limite) passam, o limite exato (256) passa e 257 é recusado', async () => {
    const arquivos = await arquivosDoModelo();
    const com = (n: number) => Buffer.from(zipSync({ ...arquivos, 'x/a.bin': strToU8(comAtributos(n)) }));
    await expect(conferirZip(com(200))).resolves.toBeUndefined();
    await expect(conferirZip(com(256))).resolves.toBeUndefined();
    await expect(conferirZip(com(257))).rejects.toThrow('Arquivo inválido');
  });

  it('o contador recomeça a cada elemento: muitos elementos com poucos atributos passam', async () => {
    const arquivos = await arquivosDoModelo();
    const muitos = '<r>' + `<a ${Array.from({ length: 200 }, (_, i) => `b${i}="1"`).join(' ')}/>`.repeat(100) + '</r>';
    await expect(conferirZip(Buffer.from(zipSync({ ...arquivos, 'x/a.bin': strToU8(muitos) })))).resolves.toBeUndefined();
  });

  it('erro de sintaxe numa entrada que não é planilha só para a leitura dela; numa planilha recusa', async () => {
    const arquivos = await arquivosDoModelo();
    const quebrado = strToU8('<r><a b="1" b="2"/></r>');
    await expect(conferirZip(Buffer.from(zipSync({ ...arquivos, 'x/a.bin': quebrado })))).resolves.toBeUndefined();
    await expect(
      conferirZip(Buffer.from(zipSync({ ...arquivos, 'xl/worksheets/sheet1.xml': quebrado }))),
    ).rejects.toThrow('Arquivo inválido: envie uma planilha .xlsx');
  });
});

describe('conferirZip (R30a): o primeiro erro de sintaxe interrompe o tokenizador', () => {
  it('numa entrada que não é planilha, nada depois do primeiro erro é tokenizado', async () => {
    const arquivos = unzipSync(new Uint8Array(await montar({ produtos: [linhaBoa(EAN_A)] })));
    // Sem a interrupção, o tokenizador seguiria e acharia a mesclagem gigante logo depois do erro.
    const xml = '<r><a b="1" b="2"/><mergeCells><mergeCell ref="A1:XFD1048576"/></mergeCells></r>';
    await expect(conferirZip(Buffer.from(zipSync({ ...arquivos, 'x/a.bin': strToU8(xml) })))).resolves.toBeUndefined();
  });
});
