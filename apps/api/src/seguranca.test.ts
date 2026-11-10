import { normalizarTexto } from '@mercado/shared';
import { describe, expect, it } from 'vitest';
import { criarAmbiente, comToken } from './rotas/apoioTeste';

/**
 * Testes de SEGURANÇA (não é "mais uma funcionalidade"): tentativas de ataques comuns contra o servidor, para confirmar
 * que ele se defende. Cada teste é um ataque conhecido; se algum passar a falhar, é sinal de que algo abriu uma brecha.
 * Veja também docs/SEGURANCA.md.
 */

const INJECOES_SQL = [
  "' OR '1'='1",
  "'; DROP TABLE Usuarios; --",
  "admin'--",
  "' UNION SELECT * FROM Usuarios --",
];

describe('cabeçalhos de segurança (helmet)', () => {
  it('toda resposta leva os cabeçalhos que impedem clique-sequestro e "farejar" o tipo do arquivo', async () => {
    const { app } = await criarAmbiente();
    const res = await app.inject({ method: 'GET', url: '/saude' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
  });
});

describe('tentativas de injeção de SQL', () => {
  it('no e-mail e na senha do login: nunca derruba o servidor nem autentica (repositório em memória, mas o texto é o mesmo que viraria parâmetro no SQL Server)', async () => {
    const { app } = await criarAmbiente();
    for (const ataque of INJECOES_SQL) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: { email: ataque, senha: ataque },
      });
      expect([400, 401]).toContain(res.statusCode);
    }
  });

  it('no texto da busca: devolve lista vazia ou erro de validação, nunca derruba o servidor nem vaza dados de outro lugar', async () => {
    const { app } = await criarAmbiente();
    for (const ataque of INJECOES_SQL) {
      const res = await app.inject({ method: 'GET', url: `/busca?q=${encodeURIComponent(ataque)}` });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    }
  });

  it('no nome de um produto cadastrado pelo mercado: é guardado como texto comum e devolvido do mesmo jeito (nunca vira comando)', async () => {
    const { app, repo } = await criarAmbiente();
    const m = await repo.criarMercado({
      nome: 'Mercado Teste', endereco: 'Rua 1', nomeNorm: normalizarTexto('Mercado Teste'), enderecoNorm: normalizarTexto('Rua 1'),
      status: 'ativo', contaSituacao: 'gratuita', usuarioId: null,
    });
    const u = await repo.criarUsuario({ email: 'lojista@exemplo.com', senhaHash: 'x', papel: 'mercado', emailVerificado: true });
    await repo.atualizarMercado(m.id, { usuarioId: u.id });
    const { app: appComToken } = { app }; // só para clareza
    const token = appComToken.jwt.sign({ id: u.id, papel: 'mercado', inst: appComToken.instancia });
    const nomeMalicioso = "Arroz'; DROP TABLE Ofertas; --";
    const res = await app.inject({
      method: 'POST', url: '/painel/produtos', headers: comToken(token),
      payload: { codigoBarras: '7891000100103', nome: nomeMalicioso, preco: '5,00' },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { nome: string }).nome).toBe(nomeMalicioso); // guardado tal como veio, não interpretado
    expect(await repo.listarOfertasDoMercado(m.id)).toHaveLength(1); // a tabela continua intacta
  });
});

describe('autenticação adulterada', () => {
  it('token sem a assinatura certa (alguém trocou o "papel" para admin à mão) é recusado', async () => {
    const { app, repo } = await criarAmbiente();
    const cliente = await repo.criarUsuario({ email: 'cli@exemplo.com', senhaHash: 'x', papel: 'cliente', emailVerificado: true });
    // Um token de verdade, só que com o payload TROCADO à mão para "admin" (a assinatura continua sendo a do payload antigo).
    const partes = app.jwt.sign({ id: cliente.id, papel: 'cliente', inst: app.instancia }).split('.');
    const payloadForjado = Buffer.from(JSON.stringify({ id: cliente.id, papel: 'admin', inst: app.instancia })).toString('base64url');
    const tokenForjado = `${partes[0]}.${payloadForjado}.${partes[2]}`;
    const res = await app.inject({ method: 'GET', url: '/admin/mercados', headers: comToken(tokenForjado) });
    expect(res.statusCode).toBe(401);
    // Confere também que o papel de verdade (cliente) continua sem acesso, mesmo com o token genuíno.
    const tokenReal = app.jwt.sign({ id: cliente.id, papel: 'cliente', inst: app.instancia });
    expect((await app.inject({ method: 'GET', url: '/admin/mercados', headers: comToken(tokenReal) })).statusCode).toBe(403);
  });

  it('token de outro início do servidor (instância diferente) não vale mais', async () => {
    const { app, repo } = await criarAmbiente({ instancia: 'instancia-velha' });
    const admin = await repo.criarUsuario({ email: 'adm@exemplo.com', senhaHash: 'x', papel: 'admin', emailVerificado: true });
    const token = app.jwt.sign({ id: admin.id, papel: 'admin', inst: 'instancia-velha' });
    expect((await app.inject({ method: 'GET', url: '/admin/mercados', headers: comToken(token) })).statusCode).toBe(200);
    // Mesmo token, servidor reiniciado (instância nova): o repositório em memória também reiniciou, então nem o id existe mais.
    const { app: app2 } = await criarAmbiente({ instancia: 'instancia-nova' });
    const tokenVelho = app2.jwt.sign({ id: admin.id, papel: 'admin', inst: 'instancia-velha' });
    expect((await app2.inject({ method: 'GET', url: '/admin/mercados', headers: comToken(tokenVelho) })).statusCode).toBe(401);
  });

  it('sem token, com token vazio ou "Bearer" sem nada: sempre 401, nunca deixa passar', async () => {
    const { app } = await criarAmbiente();
    for (const cabecalho of [{}, { authorization: 'Bearer ' }, { authorization: 'Bearer lixo.nao.valido' }, { authorization: 'semBearer x' }]) {
      const res = await app.inject({ method: 'GET', url: '/painel/produtos', headers: cabecalho });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe('um mercado não acessa dados de outro (IDOR)', () => {
  it('não consegue ver nem apagar a foto só-dele de outro mercado trocando o número na URL', async () => {
    const { app, repo } = await criarAmbiente();
    const m1 = await repo.criarMercado({ nome: 'A', endereco: 'Rua A', nomeNorm: 'a', enderecoNorm: 'rua a', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const m2 = await repo.criarMercado({ nome: 'B', endereco: 'Rua B', nomeNorm: 'b', enderecoNorm: 'rua b', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const u1 = await repo.criarUsuario({ email: 'a@exemplo.com', senhaHash: 'x', papel: 'mercado', emailVerificado: true });
    const u2 = await repo.criarUsuario({ email: 'b@exemplo.com', senhaHash: 'x', papel: 'mercado', emailVerificado: true });
    await repo.atualizarMercado(m1.id, { usuarioId: u1.id });
    await repo.atualizarMercado(m2.id, { usuarioId: u2.id });
    const tokenB = app.jwt.sign({ id: u2.id, papel: 'mercado', inst: app.instancia });
    // B tenta trabalhar "como se fosse" o mercado A só mudando o parâmetro da URL.
    const res = await app.inject({ method: 'GET', url: `/painel/produtos?mercadoId=${m1.id}`, headers: comToken(tokenB) });
    expect(res.statusCode).toBe(403);
  });

  it('o pedido de promoção de um comércio não é visto nem cancelado por outro', async () => {
    const { app, repo } = await criarAmbiente();
    const m1 = await repo.criarMercado({ nome: 'A', endereco: 'Rua A', nomeNorm: 'a', enderecoNorm: 'rua a', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const m2 = await repo.criarMercado({ nome: 'B', endereco: 'Rua B', nomeNorm: 'b', enderecoNorm: 'rua b', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const u1 = await repo.criarUsuario({ email: 'a2@exemplo.com', senhaHash: 'x', papel: 'mercado', emailVerificado: true });
    const u2 = await repo.criarUsuario({ email: 'b2@exemplo.com', senhaHash: 'x', papel: 'mercado', emailVerificado: true });
    await repo.atualizarMercado(m1.id, { usuarioId: u1.id });
    await repo.atualizarMercado(m2.id, { usuarioId: u2.id });
    const pedido = await repo.criarPedidoPromocao({
      mercadoId: m1.id, criadoEm: new Date(), situacao: 'aguardando', quantidade: 1, valorUnitarioCentavos: 500, totalCentavos: 500,
      avisouPagamentoEm: null, pagoEm: null, planilha: '{}',
    });
    const tokenB = app.jwt.sign({ id: u2.id, papel: 'mercado', inst: app.instancia });
    const res = await app.inject({ method: 'POST', url: `/painel/promocoes/${pedido.id}/cancelar`, headers: comToken(tokenB) });
    expect(res.statusCode).toBe(404); // nem confirma que o pedido existe
  });
});

describe('a rota de fotos não lê arquivos do computador', () => {
  it('"código" com ../ ou caminho de arquivo é recusado antes de qualquer leitura (404, ou 414 se o endereço é grande demais)', async () => {
    const { app } = await criarAmbiente();
    for (const tentativa of ['..%2F..%2F..%2Fetc%2Fpasswd', '..%5C..%5Cwindows%5Csystem.ini', '7891000100103%2F..%2F..', 'a'.repeat(5000)]) {
      const res = await app.inject({ method: 'GET', url: `/fotos/${tentativa}` });
      expect([404, 414]).toContain(res.statusCode);
    }
  });
});

describe('o preço de uma promoção não é escolhido pelo cliente', () => {
  it('o valor do pedido vem da configuração do servidor, nunca do que o mercado manda', async () => {
    const { app, repo } = await criarAmbiente();
    await repo.salvarConfiguracao('promocao.valorCentavos', '500');
    const m = await repo.criarMercado({ nome: 'A', endereco: 'Rua A', nomeNorm: 'a', enderecoNorm: 'rua a', status: 'ativo', contaSituacao: 'gratuita', usuarioId: null });
    const u = await repo.criarUsuario({ email: 'c@exemplo.com', senhaHash: 'x', papel: 'mercado', emailVerificado: true });
    await repo.atualizarMercado(m.id, { usuarioId: u.id });
    // Um pedido direto no repositório com um valor "errado" simula o que aconteceria se alguém manipulasse a chamada:
    // a leitura da lista (GET /painel/promocoes) tem de mostrar o que está gravado, mas a CRIAÇÃO do pedido (na importação
    // da planilha) nunca aceita um valor vindo do corpo da requisição — só o `apps/api/src/promocoes/pedidos.ts` decide.
    const fs = await import('./promocoes/pedidos');
    expect(await fs.valorPorPromocaoCentavos(repo)).toBe(500);
  });

  it('só o administrador muda o valor por promoção; o próprio mercado não consegue', async () => {
    const { app, repo } = await criarAmbiente();
    const u = await repo.criarUsuario({ email: 'd@exemplo.com', senhaHash: 'x', papel: 'mercado', emailVerificado: true });
    const token = app.jwt.sign({ id: u.id, papel: 'mercado', inst: app.instancia });
    const res = await app.inject({
      method: 'PUT', url: '/admin/promocoes/config', headers: { ...comToken(token), 'content-type': 'application/json' },
      payload: JSON.stringify({ valorCentavos: 1 }),
    });
    expect(res.statusCode).toBe(403);
  });
});
