import ExcelJS from 'exceljs';
import { LIMITE_BYTES } from '@mercado/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Ambiente,
  comToken,
  criarAmbiente,
  enviarPlanilha,
  lerPlanilha,
  TIPO_XLSX,
} from './apoioTeste';

let amb: Ambiente;

beforeEach(async () => {
  amb = await criarAmbiente();
});

describe('POST /planilhas: acesso', () => {
  it('sem token → 401', async () => {
    const res = await enviarPlanilha(amb.app, null, lerPlanilha('mercado-1-bom-preco.xlsx'));
    expect(res.statusCode).toBe(401);
  });

  it('cliente → 403', async () => {
    const { token } = await amb.criarComPapel('cliente');
    const res = await enviarPlanilha(amb.app, token, lerPlanilha('mercado-1-bom-preco.xlsx'));
    expect(res.statusCode).toBe(403);
    expect(await amb.repo.listarMercados()).toHaveLength(0);
  });

  it('usuário mercado sem mercado ligado → 403 com mensagem própria', async () => {
    const { token } = await amb.criarComPapel('mercado');
    const res = await enviarPlanilha(amb.app, token, lerPlanilha('mercado-1-bom-preco.xlsx'));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ erro: 'Sua conta não está ligada a um mercado' });
  });
});

describe('POST /planilhas: importação', () => {
  it('admin envia o arquivo real e recebe o relatório com 26 importadas', async () => {
    const { token } = await amb.criarComPapel('admin');
    const res = await enviarPlanilha(amb.app, token, lerPlanilha('mercado-1-bom-preco.xlsx'));
    expect(res.statusCode).toBe(200);
    const corpo = res.json();
    expect(corpo).toMatchObject({ mercadoCriado: true, importadas: 26 });
    expect(Array.isArray(corpo.erros)).toBe(true);
    expect(await amb.repo.listarOfertasDoMercado(corpo.mercadoId)).toHaveLength(26);
  });

  it('mercado com login envia planilha de outro nome e continua sendo o mesmo mercado', async () => {
    const admin = await amb.criarComPapel('admin');
    const primeira = await enviarPlanilha(amb.app, admin.token, lerPlanilha('mercado-1-bom-preco.xlsx'));
    const mercadoId = primeira.json().mercadoId as number;
    const dono = await amb.criarComPapel('mercado', 'dono@exemplo.com');
    await amb.repo.atualizarMercado(mercadoId, { usuarioId: dono.id });

    const res = await enviarPlanilha(amb.app, dono.token, lerPlanilha('mercado-2-estrela-da-vila.xlsx'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mercadoId, mercadoCriado: false });
    const mercados = await amb.repo.listarMercados();
    expect(mercados).toHaveLength(1);
    expect(mercados[0]).toMatchObject({ id: mercadoId, usuarioId: dono.id });
  });

  it('arquivo corrompido → 422 com mensagem', async () => {
    const { token } = await amb.criarComPapel('admin');
    const res = await enviarPlanilha(amb.app, token, Buffer.from('isto não é uma planilha'));
    expect(res.statusCode).toBe(422);
    expect(typeof res.json().erro).toBe('string');
    expect(res.json().erro.length).toBeGreaterThan(0);
  });

  it('sem o campo arquivo → 400', async () => {
    const { token } = await amb.criarComPapel('admin');
    const res = await enviarPlanilha(amb.app, token, lerPlanilha('mercado-1-bom-preco.xlsx'), 'outro');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: "Envie a planilha no campo 'arquivo'" });
  });

  it('corpo que não é multipart → 400', async () => {
    const { token } = await amb.criarComPapel('admin');
    const res = await amb.app.inject({
      method: 'POST',
      url: '/planilhas',
      payload: { arquivo: 'x' },
      headers: comToken(token),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: "Envie a planilha no campo 'arquivo'" });
  });

  it('arquivo acima do limite → 422', async () => {
    const { token } = await amb.criarComPapel('admin');
    const res = await enviarPlanilha(amb.app, token, Buffer.alloc(LIMITE_BYTES + 1024, 1));
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ erro: 'Planilha grande demais para ser importada' });
    expect(await amb.repo.listarMercados()).toHaveLength(0);
  });
});

describe('GET /planilhas/modelo', () => {
  it('sem token → 401; cliente → 403', async () => {
    expect((await amb.app.inject({ method: 'GET', url: '/planilhas/modelo' })).statusCode).toBe(401);
    const { token } = await amb.criarComPapel('cliente');
    const res = await amb.app.inject({ method: 'GET', url: '/planilhas/modelo', headers: comToken(token) });
    expect(res.statusCode).toBe(403);
  });

  it('devolve o xlsx com os cabeçalhos de download', async () => {
    const { token } = await amb.criarComPapel('mercado');
    const res = await amb.app.inject({ method: 'GET', url: '/planilhas/modelo', headers: comToken(token) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(TIPO_XLSX);
    expect(res.headers['content-disposition']).toBe('attachment; filename="modelo-bolso-certo.xlsx"');
    expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('em branco → 422 reclamando do nome do mercado; preenchido → importa 1 produto sem erros', async () => {
    const { token } = await amb.criarComPapel('admin');
    const modelo = await amb.app.inject({ method: 'GET', url: '/planilhas/modelo', headers: comToken(token) });
    const emBranco = await enviarPlanilha(amb.app, token, modelo.rawPayload);
    expect(emBranco.statusCode).toBe(422);
    expect(emBranco.json().erro).toContain('Nome do mercado');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(modelo.rawPayload as unknown as ArrayBuffer);
    const aba = wb.getWorksheet('Mercado')!;
    aba.getCell('B1').value = 'Mercado do Modelo';
    aba.getCell('B2').value = 'Rua do Modelo, 10';
    wb.getWorksheet('Produtos')!.addRow(['7891000100103', 'Leite integral', 5.49, '1 L', 'Laticínios', 'sim']);
    const preenchido = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await enviarPlanilha(amb.app, token, preenchido);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ importadas: 1, erros: [], mercadoCriado: true });
  });
});
