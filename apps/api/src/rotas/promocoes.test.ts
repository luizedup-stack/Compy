import { normalizarTexto } from '@mercado/shared';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { lerDia, lerLinhaDeDesconto } from '../promocoes/pedidos';
import type { Mercado } from '../repositorio';
import { type Ambiente, comToken, criarAmbiente, enviarPlanilha } from './apoioTeste';

// Planilha com a aba "Descontos": retida até o pagamento (Pix manual), administração dos valores e aplicação ao pagar.

/** EAN-13 válido a partir dos 12 primeiros dígitos (acrescenta o dígito verificador, como o importador confere). */
function ean(doze: string): string {
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(doze[i]) * (i % 2 === 0 ? 1 : 3);
  return doze + String((10 - (soma % 10)) % 10);
}
const ARROZ = ean('789100000001');
const FEIJAO = ean('789100000002');
const SEM_CADASTRO = ean('789100000003');

/** Dia de hoje + n dias, no formato dia/mês/ano que o comércio digita. */
function dia(n: number): string {
  const d = new Date(Date.now() + n * 86400000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

async function planilha(produtos: (string | number)[][], descontos?: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const m = wb.addWorksheet('Mercado');
  m.addRow(['Nome do mercado', 'Qualquer']);
  m.addRow(['Endereço', 'Qualquer']);
  const p = wb.addWorksheet('Produtos');
  p.addRow(['Código de barras*', 'Produto*', 'Preço*', 'Quantidade', 'Categoria', 'Disponível']);
  for (const l of produtos) p.addRow(l);
  if (descontos) {
    const d = wb.addWorksheet('Descontos');
    d.addRow(['Código de barras*', 'Preço promocional*', 'Válido de', 'Válido até*']);
    for (const l of descontos) d.addRow(l);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let amb: Ambiente;
let comercio: Mercado;
let tokenC: string;
let admin: { token: string };

const get = (url: string, token: string) => amb.app.inject({ method: 'GET', url, headers: comToken(token) });
const post = (url: string, token: string, payload?: object) => amb.app.inject({ method: 'POST', url, headers: comToken(token), ...(payload ? { payload } : {}) });
const put = (url: string, token: string, payload: object) => amb.app.inject({ method: 'PUT', url, headers: comToken(token), payload });

beforeEach(async () => {
  amb = await criarAmbiente();
  const { id, token } = await amb.criarComPapel('mercado', 'comercio@exemplo.com');
  tokenC = token;
  comercio = await amb.repo.criarMercado({
    nome: 'Comércio A', endereco: 'Rua A, 1', nomeNorm: normalizarTexto('Comércio A'), enderecoNorm: normalizarTexto('Rua A, 1'),
    status: 'ativo', contaSituacao: 'gratuita', usuarioId: id,
  });
  admin = await amb.criarComPapel('admin', 'admin@exemplo.com');
});

const PRODUTOS = [[ARROZ, 'Arroz 5kg', 25, '5 kg'], [FEIJAO, 'Feijão 1kg', 9, '1 kg']];

describe('lerDia e lerLinhaDeDesconto', () => {
  it('lê datas em dia/mês/ano, ISO e número do Excel; recusa dias que não existem', () => {
    expect(lerDia('25/12/2026')).toEqual({ a: 2026, m: 12, d: 25 });
    expect(lerDia('5/1/27')).toEqual({ a: 2027, m: 1, d: 5 });
    expect(lerDia('2026-12-25T00:00:00.000Z')).toEqual({ a: 2026, m: 12, d: 25 });
    expect(lerDia(46016)).toEqual({ a: 2025, m: 12, d: 25 }); // série do Excel
    for (const ruim of ['31/02/2026', '32/01/2026', '2026-13-01', 'amanhã', '', '12-25-2026']) expect(lerDia(ruim), ruim).toBeNull();
    expect(lerDia(null)).toBeNull();
  });

  it('o fim da promoção é o último instante do dia em Brasília e o início, a primeira hora do dia', () => {
    const agora = new Date('2026-11-10T12:00:00.000Z');
    const r = lerLinhaDeDesconto(2, { codigo: ARROZ, preco: '4,99', de: '11/11/2026', ate: '12/11/2026' }, agora);
    expect(r).toMatchObject({ ok: true, desconto: { codigoBarras: ARROZ, precoPromocional: 4.99, inicio: '2026-11-11T03:00:00.000Z', fim: '2026-11-13T02:59:59.999Z' } });
  });

  it('recusa: sem "Válido até", data no passado, início depois do fim, preço inválido e prazo longe demais', () => {
    const agora = new Date('2026-11-10T12:00:00.000Z');
    const motivo = (campos: object) => {
      const r = lerLinhaDeDesconto(2, { codigo: ARROZ, preco: '4,99', de: null, ate: '12/11/2026', ...campos }, agora);
      return r.ok ? null : r.motivo;
    };
    expect(motivo({ ate: null })).toContain('Preencha "Válido até"');
    expect(motivo({ ate: '01/11/2026' })).toContain('já acabou');
    expect(motivo({ de: '20/11/2026' })).toContain('"Válido de" não pode ser depois');
    expect(motivo({ preco: 'abc' })).toContain('Preço promocional inválido');
    expect(motivo({ ate: '01/01/2030' })).toContain('longe demais');
    expect(motivo({ codigo: '123' })).not.toBeNull();
    expect(motivo({})).toBeNull();
  });
});

describe('planilha com a aba Descontos (comércio)', () => {
  it('fica RETIDA: nada é salvo, volta 202 com o valor a pagar (R$ 5,00 por promoção)', async () => {
    const arquivo = await planilha(PRODUTOS, [[ARROZ, '19,90', '', dia(5)], [FEIJAO, '7,50', '', dia(5)]]);
    const res = await enviarPlanilha(amb.app, tokenC, arquivo);
    expect(res.statusCode).toBe(202);
    const corpo = res.json() as { retida: boolean; importadas: number; pedido: { id: number; quantidade: number; valorUnitarioCentavos: number; totalCentavos: number } };
    expect(corpo).toMatchObject({ retida: true, importadas: 0, pedido: { quantidade: 2, valorUnitarioCentavos: 500, totalCentavos: 1000 } });
    expect(await amb.repo.listarOfertasDoMercado(comercio.id)).toHaveLength(0); // nada foi para o ar
    expect(await amb.repo.listarPedidosPromocao({ mercadoId: comercio.id })).toHaveLength(1);
  });

  it('sem a aba Descontos (ou vazia) tudo é salvo na hora, sem cobrança', async () => {
    const sem = await enviarPlanilha(amb.app, tokenC, await planilha(PRODUTOS));
    expect(sem.statusCode).toBe(200);
    expect(await amb.repo.listarOfertasDoMercado(comercio.id)).toHaveLength(2);
    const vazia = await enviarPlanilha(amb.app, tokenC, await planilha(PRODUTOS, []));
    expect(vazia.statusCode).toBe(200);
    expect(await amb.repo.listarPedidosPromocao()).toHaveLength(0);
  });

  it('linha com problema é recusada com o motivo; as válidas viram o pedido (só elas são cobradas)', async () => {
    const arquivo = await planilha(PRODUTOS, [
      [ARROZ, '19,90', '', dia(5)], // ok
      [FEIJAO, '9,00', '', dia(5)], // não é desconto (igual ao normal)
      [SEM_CADASTRO, '1,00', '', dia(5)], // produto não cadastrado
      [FEIJAO, '5,00', '', ''], // sem "Válido até"
    ]);
    const res = await enviarPlanilha(amb.app, tokenC, arquivo);
    expect(res.statusCode).toBe(202);
    const corpo = res.json() as { erros: { linha: number; motivo: string }[]; pedido: { quantidade: number } };
    expect(corpo.pedido.quantidade).toBe(1);
    const motivos = corpo.erros.map((e) => e.motivo).join(' | ');
    expect(motivos).toContain('precisa ser menor que o preço normal');
    expect(motivos).toContain('não está cadastrado');
    expect(motivos).toContain('Preencha "Válido até"');
  });

  it('o produto da promoção pode já estar cadastrado (não precisa estar na aba Produtos)', async () => {
    await enviarPlanilha(amb.app, tokenC, await planilha(PRODUTOS)); // cadastra
    const res = await enviarPlanilha(amb.app, tokenC, await planilha([], [[ARROZ, '19,90', '', dia(3)]]));
    expect(res.statusCode).toBe(202);
  });

  it('só linhas inválidas na aba Descontos: salva os produtos normalmente e avisa dos erros (nada a pagar)', async () => {
    const res = await enviarPlanilha(amb.app, tokenC, await planilha(PRODUTOS, [[ARROZ, '99,00', '', dia(5)]]));
    expect(res.statusCode).toBe(200);
    expect((res.json() as { erros: unknown[] }).erros).toHaveLength(1);
    expect(await amb.repo.listarOfertasDoMercado(comercio.id)).toHaveLength(2);
    expect(await amb.repo.listarPedidosPromocao()).toHaveLength(0);
  });

  it('valor por promoção em R$ 0: não há o que cobrar, as promoções entram na hora', async () => {
    await put('/admin/promocoes/config', admin.token, { valorCentavos: 0 });
    const res = await enviarPlanilha(amb.app, tokenC, await planilha(PRODUTOS, [[ARROZ, '19,90', '', dia(5)]]));
    expect(res.statusCode).toBe(200);
    expect((await amb.repo.acharOferta(comercio.id, ARROZ))?.promocaoPreco).toBe(19.9);
    expect(await amb.repo.listarPedidosPromocao()).toHaveLength(0);
  });

  it('o administrador envia planilha com descontos e eles entram na hora (sem cobrança)', async () => {
    // o administrador escolhe o comércio pelo nome e endereço da aba Mercado
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Mercado').addRows([['Nome do mercado', 'Comércio A'], ['Endereço', 'Rua A, 1']]);
    wb.addWorksheet('Produtos').addRows([['Código de barras*', 'Produto*', 'Preço*'], [ARROZ, 'Arroz 5kg', 25]]);
    wb.addWorksheet('Descontos').addRows([['Código de barras*', 'Preço promocional*', 'Válido de', 'Válido até*'], [ARROZ, '19,90', '', dia(5)]]);
    const res = await enviarPlanilha(amb.app, admin.token, Buffer.from(await wb.xlsx.writeBuffer()));
    expect(res.statusCode).toBe(200);
    expect((res.json() as { promocoes: number }).promocoes).toBe(1);
    expect((await amb.repo.acharOferta(comercio.id, ARROZ))?.promocaoPreco).toBe(19.9);
  });
});

describe('o comércio acompanha o pedido', () => {
  async function criarPedido() {
    const res = await enviarPlanilha(amb.app, tokenC, await planilha(PRODUTOS, [[ARROZ, '19,90', '', dia(5)]]));
    return (res.json() as { pedido: { id: number } }).pedido.id;
  }

  it('vê o valor, a chave Pix e os pedidos; "Já paguei" só avisa', async () => {
    await put('/admin/promocoes/config', admin.token, { pixChave: 'dona@exemplo.com' });
    const id = await criarPedido();
    const lista = (await get('/painel/promocoes', tokenC)).json() as { config: { valorCentavos: number; pixChave: string }; pedidos: { id: number; situacao: string; avisouPagamentoEm: string | null }[] };
    expect(lista.config).toEqual({ valorCentavos: 500, pixChave: 'dona@exemplo.com' });
    expect(lista.pedidos[0]).toMatchObject({ id, situacao: 'aguardando', avisouPagamentoEm: null });

    const aviso = await post(`/painel/promocoes/${id}/avisar`, tokenC);
    expect(aviso.statusCode).toBe(200);
    expect((await amb.repo.acharPedidoPromocao(id))?.avisouPagamentoEm).not.toBeNull();
    expect((await amb.repo.acharPedidoPromocao(id))?.situacao).toBe('aguardando'); // quem libera é a dona
    expect(await amb.repo.listarOfertasDoMercado(comercio.id)).toHaveLength(0);
  });

  it('cancelar descarta a planilha retida', async () => {
    const id = await criarPedido();
    expect((await post(`/painel/promocoes/${id}/cancelar`, tokenC)).statusCode).toBe(200);
    expect(await amb.repo.acharPedidoPromocao(id)).toMatchObject({ situacao: 'cancelado', planilha: '' });
    expect((await post(`/painel/promocoes/${id}/cancelar`, tokenC)).statusCode).toBe(409);
  });

  it('um comércio não mexe no pedido de outro (404) e cliente não entra (403)', async () => {
    const id = await criarPedido();
    const outro = await amb.criarComPapel('mercado', 'outro@exemplo.com');
    await amb.repo.criarMercado({ nome: 'Comércio B', endereco: 'Rua B, 2', nomeNorm: 'comercio b', enderecoNorm: 'rua b, 2', status: 'ativo', contaSituacao: 'gratuita', usuarioId: outro.id });
    expect((await post(`/painel/promocoes/${id}/avisar`, outro.token)).statusCode).toBe(404);
    expect((await post(`/painel/promocoes/${id}/cancelar`, outro.token)).statusCode).toBe(404);
    const cliente = await amb.criarComPapel('cliente', 'c@exemplo.com');
    expect((await get('/painel/promocoes', cliente.token)).statusCode).toBe(403);
    expect((await get('/painel/promocoes', '')).statusCode).toBe(401);
  });
});

describe('administração das promoções', () => {
  async function pedido(token = tokenC, produtos = PRODUTOS, descontos: (string | number)[][] = [[ARROZ, '19,90', '', dia(5)]]) {
    const res = await enviarPlanilha(amb.app, token, await planilha(produtos, descontos));
    return (res.json() as { pedido: { id: number } }).pedido.id;
  }

  it('marcar como PAGO aplica a planilha retida (produtos e promoções) e não duplica se for repetido', async () => {
    const id = await pedido();
    const res = await post(`/admin/promocoes/${id}/pagar`, admin.token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ importadas: 2, promocoes: 1, pedido: { situacao: 'pago' } });
    const arroz = await amb.repo.acharOferta(comercio.id, ARROZ);
    expect(arroz).toMatchObject({ preco: 25, promocaoPreco: 19.9 });
    expect(arroz?.promocaoFim).toBeInstanceOf(Date);
    expect(await amb.repo.acharPedidoPromocao(id)).toMatchObject({ situacao: 'pago', planilha: '' });
    expect((await post(`/admin/promocoes/${id}/pagar`, admin.token)).statusCode).toBe(409);
  });

  it('depois de pago, a promoção aparece na busca do cliente com o preço promocional', async () => {
    const id = await pedido();
    await post(`/admin/promocoes/${id}/pagar`, admin.token);
    const busca = (await amb.app.inject({ method: 'GET', url: '/busca?q=arroz' })).json() as { ofertas: { preco: number; precoOriginal?: number }[] }[];
    expect(busca[0]!.ofertas[0]).toMatchObject({ preco: 19.9, precoOriginal: 25 });
  });

  it('reenviar a planilha sem desconto NÃO apaga uma promoção que ainda vale', async () => {
    await post(`/admin/promocoes/${await pedido()}/pagar`, admin.token);
    await enviarPlanilha(amb.app, tokenC, await planilha(PRODUTOS));
    expect((await amb.repo.acharOferta(comercio.id, ARROZ))?.promocaoPreco).toBe(19.9);
    // mas se o preço normal cair abaixo da promoção, ela deixa de valer
    await enviarPlanilha(amb.app, tokenC, await planilha([[ARROZ, 'Arroz 5kg', 15, '5 kg']]));
    expect((await amb.repo.acharOferta(comercio.id, ARROZ))?.promocaoPreco).toBeNull();
  });

  it('cancelar um pedido da administração; pagar um cancelado é 409; pedido que não existe é 404', async () => {
    const id = await pedido();
    expect((await post(`/admin/promocoes/${id}/cancelar`, admin.token)).statusCode).toBe(200);
    expect((await post(`/admin/promocoes/${id}/pagar`, admin.token)).statusCode).toBe(409);
    expect((await post('/admin/promocoes/999/pagar', admin.token)).statusCode).toBe(404);
    expect((await post('/admin/promocoes/abc/pagar', admin.token)).statusCode).toBe(404);
  });

  it('não libera o pedido de um comércio sem acesso', async () => {
    const id = await pedido();
    await amb.repo.atualizarMercado(comercio.id, { status: 'removido' });
    const res = await post(`/admin/promocoes/${id}/pagar`, admin.token);
    expect(res.statusCode).toBe(409);
    expect((await amb.repo.acharPedidoPromocao(id))?.situacao).toBe('aguardando');
  });

  it('o resumo mostra quem pagou, quem deve, quantas promoções e os valores', async () => {
    const id1 = await pedido();
    await post(`/admin/promocoes/${id1}/pagar`, admin.token); // 1 promoção paga: R$ 5
    await pedido(tokenC, PRODUTOS, [[ARROZ, '18,00', '', dia(4)], [FEIJAO, '7,00', '', dia(4)]]); // 2 promoções aguardando: R$ 10
    const r = (await get('/admin/promocoes', admin.token)).json() as {
      config: { valorCentavos: number; pixChave: string | null };
      resumo: Record<string, number>;
      porComercio: { nome: string; pagas: number; aguardando: number; recebidoCentavos: number; devidoCentavos: number }[];
      pedidos: { mercadoNome: string; situacao: string }[];
    };
    expect(r.config).toEqual({ valorCentavos: 500, pixChave: null });
    expect(r.resumo).toMatchObject({ pagas: 1, aguardando: 1, canceladas: 0, promocoesPagas: 1, promocoesAguardando: 2, recebidoCentavos: 500, aReceberCentavos: 1000 });
    expect(r.porComercio).toEqual([{ mercadoId: comercio.id, nome: 'Comércio A', pagas: 1, aguardando: 1, recebidoCentavos: 500, devidoCentavos: 1000 }]);
    expect(r.pedidos.map((p) => p.situacao)).toEqual(['aguardando', 'pago']); // do mais novo para o mais antigo
    expect(r.pedidos[0]!.mercadoNome).toBe('Comércio A');
  });

  it('mudar o valor por promoção vale só para pedidos novos', async () => {
    const antigo = await pedido();
    const cfg = await put('/admin/promocoes/config', admin.token, { valorCentavos: 750, pixChave: '  11999998888  ' });
    expect(cfg.json()).toEqual({ valorCentavos: 750, pixChave: '11999998888' });
    const novo = await pedido(tokenC, PRODUTOS, [[FEIJAO, '7,00', '', dia(4)]]);
    expect((await amb.repo.acharPedidoPromocao(antigo))?.valorUnitarioCentavos).toBe(500);
    expect((await amb.repo.acharPedidoPromocao(novo))).toMatchObject({ valorUnitarioCentavos: 750, totalCentavos: 750 });
  });

  it('valores inválidos na configuração: 400; só o administrador mexe (403 para comércio, 401 sem login)', async () => {
    for (const ruim of [{ valorCentavos: -1 }, { valorCentavos: 5.5 }, { valorCentavos: '500' }, { valorCentavos: 2_000_000 }, { pixChave: 'x'.repeat(141) }, { pixChave: 5 }]) {
      expect((await put('/admin/promocoes/config', admin.token, ruim)).statusCode, JSON.stringify(ruim)).toBe(400);
    }
    expect((await put('/admin/promocoes/config', tokenC, { valorCentavos: 100 })).statusCode).toBe(403);
    expect((await get('/admin/promocoes', tokenC)).statusCode).toBe(403);
    expect((await get('/admin/promocoes', '')).statusCode).toBe(401);
    expect((await post('/admin/promocoes/1/pagar', tokenC)).statusCode).toBe(403);
  });
});

describe('promoção manual no painel (editar/cadastrar produto, sem planilha)', () => {
  async function criarOferta(preco = 25) {
    await post(
      '/painel/produtos',
      tokenC,
      { codigoBarras: ARROZ, nome: 'Arroz 5kg', preco: String(preco).replace('.', ','), quantidade: '5 kg' } as unknown as object,
    );
  }

  it('fica retida (202) até a aprovação; com o valor por promoção em R$ 0, aplica na hora (200)', async () => {
    await criarOferta();
    const res = await post(`/painel/produtos/${ARROZ}/promocao`, tokenC, { precoPromocional: '19,90', validoAte: dia(5) });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ retida: true, pedido: { quantidade: 1, valorUnitarioCentavos: 500, totalCentavos: 500 } });
    expect((await amb.repo.acharOferta(comercio.id, ARROZ))?.promocaoPreco).toBeNull(); // ainda não vale

    await put('/admin/promocoes/config', admin.token, { valorCentavos: 0 });
    const res2 = await post(`/painel/produtos/${ARROZ}/promocao`, tokenC, { precoPromocional: '18,00', validoAte: dia(5) });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toMatchObject({ retida: false, promocoes: 1 });
    expect((await amb.repo.acharOferta(comercio.id, ARROZ))?.promocaoPreco).toBe(18);
  });

  it('a mesma rota funciona logo depois de cadastrar um produto novo', async () => {
    const criado = await post(
      '/painel/produtos',
      tokenC,
      { codigoBarras: FEIJAO, nome: 'Feijão 1kg', preco: '9,00', quantidade: '1 kg' } as unknown as object,
    );
    expect(criado.statusCode).toBe(201);
    const res = await post(`/painel/produtos/${FEIJAO}/promocao`, tokenC, { precoPromocional: '6,50', validoAte: dia(3) });
    expect(res.statusCode).toBe(202);
  });

  it('recusa: produto não encontrado, preço promocional maior/igual ao normal, ou sem "Válido até"', async () => {
    await criarOferta(25);
    expect((await post(`/painel/produtos/${FEIJAO}/promocao`, tokenC, { precoPromocional: '5,00', validoAte: dia(3) })).statusCode).toBe(404);
    const caro = await post(`/painel/produtos/${ARROZ}/promocao`, tokenC, { precoPromocional: '30,00', validoAte: dia(3) });
    expect(caro.statusCode).toBe(400);
    expect((caro.json() as { erro: string }).erro).toContain('menor que o preço normal');
    const semData = await post(`/painel/produtos/${ARROZ}/promocao`, tokenC, { precoPromocional: '10,00' });
    expect(semData.statusCode).toBe(400);
  });

  it('um comércio não cria promoção no produto de outro (404); exige login de mercado', async () => {
    await criarOferta();
    const outro = await amb.criarComPapel('mercado', 'outro3@exemplo.com');
    await amb.repo.criarMercado({ nome: 'B', endereco: 'Rua B, 2', nomeNorm: 'b', enderecoNorm: 'rua b, 2', status: 'ativo', contaSituacao: 'gratuita', usuarioId: outro.id });
    expect((await post(`/painel/produtos/${ARROZ}/promocao`, outro.token, { precoPromocional: '10,00', validoAte: dia(3) })).statusCode).toBe(404);
    expect((await post(`/painel/produtos/${ARROZ}/promocao`, '', { precoPromocional: '10,00', validoAte: dia(3) })).statusCode).toBe(401);
  });
});

describe('aviso por e-mail quando a promoção é aprovada', () => {
  async function pedidoPendente() {
    await post('/painel/produtos', tokenC, { codigoBarras: ARROZ, nome: 'Arroz 5kg', preco: '25,00', quantidade: '5 kg' } as unknown as object);
    const res = await post(`/painel/produtos/${ARROZ}/promocao`, tokenC, { precoPromocional: '19,90', validoAte: dia(5) });
    return (res.json() as { pedido: { id: number } }).pedido.id;
  }

  it('o comércio começa avisado por padrão (GET /painel/promocoes) e recebe o e-mail ao ser aprovado', async () => {
    expect((await get('/painel/promocoes', tokenC)).json()).toMatchObject({ avisarPorEmail: true });
    const id = await pedidoPendente();
    await post(`/admin/promocoes/${id}/pagar`, admin.token);
    expect(amb.emailsEnviados).toHaveLength(1);
    expect(amb.emailsEnviados[0]).toMatchObject({ para: 'comercio@exemplo.com', assunto: 'Sua promoção foi aprovada' });
    expect(amb.emailsEnviados[0]!.texto).toContain('Comércio A');
  });

  it('desligando o aviso ("Meu comércio"), nenhum e-mail é mandado ao aprovar', async () => {
    const desligar = await put('/painel/promocoes/aviso', tokenC, { avisar: false });
    expect(desligar.statusCode).toBe(200);
    expect(desligar.json()).toEqual({ avisarPorEmail: false });
    expect((await get('/painel/promocoes', tokenC)).json()).toMatchObject({ avisarPorEmail: false });

    const id = await pedidoPendente();
    await post(`/admin/promocoes/${id}/pagar`, admin.token);
    expect(amb.emailsEnviados).toHaveLength(0);
  });

  it('"avisar" precisa ser verdadeiro ou falso; exige login de mercado', async () => {
    expect((await put('/painel/promocoes/aviso', tokenC, { avisar: 'sim' })).statusCode).toBe(400);
    expect((await put('/painel/promocoes/aviso', admin.token, { avisar: true })).statusCode).toBe(403);
  });
});
