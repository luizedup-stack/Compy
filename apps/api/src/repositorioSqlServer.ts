// Repositório com banco de dados SQL Server / Azure SQL. Faz o mesmo que repositorioMemoria.ts (o contrato de testes
// em repositorio.contrato.ts vale para os dois), mas os dados ficam no banco e não somem quando o servidor reinicia.
//
// Decisões:
// - transacao(): abre uma transação do banco e pega uma trava exclusiva do SQL Server (sp_getapplock) que vale até o
//   fim dela. Assim, duas transações nunca rodam ao mesmo tempo (nem em dois servidores diferentes), como na versão em
//   memória: "ler, alterar e gravar" em duas transações simultâneas dá o resultado certo. Leituras e escritas avulsas
//   (fora de transação) não esperam a trava e só enxergam o que já foi confirmado.
// - A lista usada pela busca (todas as ofertas) fica numa cópia na memória do servidor por poucos segundos e é
//   descartada a cada escrita; sem isso cada busca baixaria o catálogo inteiro do banco pela internet.
import sql from 'mssql';
import { comTentativas } from './banco/conexao';
import {
  ErroEmailJaExiste,
  ErroMercadoDuplicado,
  type BuscaRegistrada,
  type FotoProduto,
  type Mercado,
  type OfertaArmazenada,
  type Repositorio,
  type TipoToken,
  type Usuario,
} from './repositorio';

const TRAVA_TRANSACAO = 'bolso-certo:transacao';
const ESPERA_MAXIMA_TRAVA_MS = 120_000;
/** Por quanto tempo a cópia do catálogo vale sem nenhuma escrita (cobre o caso de outro servidor gravar no banco). */
const VALIDADE_CACHE_MS = 30_000;

type Linha = Record<string, unknown>;
type NovoRequest = () => sql.Request;

// Violação de índice único (2601) ou de restrição única (2627).
const violacaoDeUnico = (e: unknown): boolean => {
  const n = (e as { number?: number; originalError?: { number?: number; info?: { number?: number } } }) ?? {};
  const numero = n.number ?? n.originalError?.number ?? n.originalError?.info?.number;
  return numero === 2601 || numero === 2627;
};

const comoData = (v: unknown): Date => v as Date;
const dataOuNull = (v: unknown): Date | null => (v === null || v === undefined ? null : (v as Date));

function linhaParaUsuario(l: Linha): Usuario {
  const u: Usuario = {
    id: l.id as number,
    email: l.email as string,
    senhaHash: l.senhaHash as string,
    papel: l.papel as Usuario['papel'],
    emailVerificado: Boolean(l.emailVerificado),
  };
  // Como na versão em memória, campo que nunca foi preenchido não aparece (em vez de vir como null).
  if (l.nome !== null && l.nome !== undefined) u.nome = l.nome as string;
  if (l.foto !== null && l.foto !== undefined) u.foto = l.foto as string;
  return u;
}

function linhaParaMercado(l: Linha): Mercado {
  const m: Mercado = {
    id: l.id as number,
    nome: l.nome as string,
    endereco: l.endereco as string,
    nomeNorm: l.nomeNorm as string,
    enderecoNorm: l.enderecoNorm as string,
    status: l.status as Mercado['status'],
    contaSituacao: l.contaSituacao as Mercado['contaSituacao'],
    usuarioId: (l.usuarioId as number | null) ?? null,
  };
  if (l.detalhes !== null && l.detalhes !== undefined) m.detalhes = JSON.parse(l.detalhes as string) as Mercado['detalhes'];
  if (l.telefone !== null && l.telefone !== undefined) m.telefone = l.telefone as string;
  return m;
}

function linhaParaFoto(l: Linha): FotoProduto {
  return {
    codigoBarras: l.codigoBarras as string,
    origem: l.origem as FotoProduto['origem'],
    url: (l.url as string | null) ?? null,
    imagem: (l.imagem as string | null) ?? null,
    mercadoId: (l.mercadoId as number | null) ?? null,
    atualizadaEm: comoData(l.atualizadaEm),
  };
}

function linhaParaOferta(l: Linha): OfertaArmazenada {
  return {
    mercadoId: l.mercadoId as number,
    codigoBarras: l.codigoBarras as string,
    nome: l.nome as string,
    nomeNorm: l.nomeNorm as string,
    preco: l.preco as number,
    quantidadeTexto: (l.quantidadeTexto as string | null) ?? null,
    quantidadeValor: (l.quantidadeValor as number | null) ?? null,
    quantidadeUnidade: (l.quantidadeUnidade as OfertaArmazenada['quantidadeUnidade']) ?? null,
    categoria: (l.categoria as string | null) ?? null,
    disponivel: Boolean(l.disponivel),
    precoAtualizadoEm: comoData(l.precoAtualizadoEm),
    promocaoPreco: (l.promocaoPreco as number | null) ?? null,
    promocaoInicio: dataOuNull(l.promocaoInicio),
    promocaoFim: dataOuNull(l.promocaoFim),
  };
}

const COLUNAS_MERCADO = 'id, nome, endereco, nomeNorm, enderecoNorm, status, contaSituacao, usuarioId, detalhes, telefone';
const COLUNAS_OFERTA =
  'mercadoId, codigoBarras, nome, nomeNorm, preco, quantidadeTexto, quantidadeValor, quantidadeUnidade, categoria, disponivel, precoAtualizadoEm, promocaoPreco, promocaoInicio, promocaoFim';

/** Faz a pergunta e devolve as linhas. */
async function consultar(novo: NovoRequest, texto: string, parametros: (r: sql.Request) => void = () => undefined): Promise<Linha[]> {
  const r = novo();
  parametros(r);
  return (await r.query(texto)).recordset as unknown as Linha[];
}

/** Dados que o usuário pode ter trocado (a lista de colunas é fixa: nunca entra texto de fora no comando SQL). */
function colunasDoUsuario(parcial: Partial<Omit<Usuario, 'id'>>, r: sql.Request): string[] {
  const sets: string[] = [];
  if (parcial.email !== undefined) {
    sets.push('email = @email', 'emailNorm = @emailNorm');
    r.input('email', sql.NVarChar(320), parcial.email);
    r.input('emailNorm', sql.NVarChar(320), parcial.email.toLowerCase());
  }
  if (parcial.senhaHash !== undefined) {
    sets.push('senhaHash = @senhaHash');
    r.input('senhaHash', sql.NVarChar(200), parcial.senhaHash);
  }
  if (parcial.papel !== undefined) {
    sets.push('papel = @papel');
    r.input('papel', sql.VarChar(10), parcial.papel);
  }
  if (parcial.emailVerificado !== undefined) {
    sets.push('emailVerificado = @emailVerificado');
    r.input('emailVerificado', sql.Bit, parcial.emailVerificado);
  }
  if (parcial.nome !== undefined) {
    sets.push('nome = @nome');
    r.input('nome', sql.NVarChar(200), parcial.nome);
  }
  if (parcial.foto !== undefined) {
    sets.push('foto = @foto');
    r.input('foto', sql.NVarChar(sql.MAX), parcial.foto);
  }
  return sets;
}

function colunasDoMercado(parcial: Partial<Omit<Mercado, 'id'>>, r: sql.Request): string[] {
  const sets: string[] = [];
  const texto = (campo: 'nome' | 'endereco' | 'nomeNorm' | 'enderecoNorm') => {
    const v = parcial[campo];
    if (v === undefined) return;
    sets.push(`${campo} = @${campo}`);
    r.input(campo, sql.NVarChar(sql.MAX), v);
  };
  texto('nome');
  texto('endereco');
  texto('nomeNorm');
  texto('enderecoNorm');
  if (parcial.status !== undefined) {
    sets.push('status = @status');
    r.input('status', sql.VarChar(10), parcial.status);
  }
  if (parcial.contaSituacao !== undefined) {
    sets.push('contaSituacao = @contaSituacao');
    r.input('contaSituacao', sql.VarChar(12), parcial.contaSituacao);
  }
  if (parcial.usuarioId !== undefined) {
    sets.push('usuarioId = @usuarioId');
    r.input('usuarioId', sql.Int, parcial.usuarioId);
  }
  if (parcial.detalhes !== undefined) {
    sets.push('detalhes = @detalhes');
    r.input('detalhes', sql.NVarChar(sql.MAX), parcial.detalhes === null ? null : JSON.stringify(parcial.detalhes));
  }
  if (parcial.telefone !== undefined) {
    sets.push('telefone = @telefone');
    r.input('telefone', sql.VarChar(20), parcial.telefone);
  }
  return sets;
}

function parametrosDaOferta(r: sql.Request, o: OfertaArmazenada): void {
  r.input('mercadoId', sql.Int, o.mercadoId);
  r.input('codigoBarras', sql.VarChar(32), o.codigoBarras);
  r.input('nome', sql.NVarChar(sql.MAX), o.nome);
  r.input('nomeNorm', sql.NVarChar(sql.MAX), o.nomeNorm);
  r.input('preco', sql.Decimal(12, 2), o.preco);
  r.input('quantidadeTexto', sql.NVarChar(sql.MAX), o.quantidadeTexto);
  r.input('quantidadeValor', sql.Float, o.quantidadeValor);
  r.input('quantidadeUnidade', sql.VarChar(10), o.quantidadeUnidade);
  r.input('categoria', sql.NVarChar(sql.MAX), o.categoria);
  r.input('disponivel', sql.Bit, o.disponivel);
  r.input('precoAtualizadoEm', sql.DateTime2(3), o.precoAtualizadoEm);
  r.input('promocaoPreco', sql.Decimal(12, 2), o.promocaoPreco);
  r.input('promocaoInicio', sql.DateTime2(3), o.promocaoInicio);
  r.input('promocaoFim', sql.DateTime2(3), o.promocaoFim);
}

const COLUNAS_ATUALIZAVEIS_OFERTA =
  'nome = @nome, nomeNorm = @nomeNorm, preco = @preco, quantidadeTexto = @quantidadeTexto, quantidadeValor = @quantidadeValor, quantidadeUnidade = @quantidadeUnidade, categoria = @categoria, disponivel = @disponivel, precoAtualizadoEm = @precoAtualizadoEm, promocaoPreco = @promocaoPreco, promocaoInicio = @promocaoInicio, promocaoFim = @promocaoFim';

export type RepositorioSqlServer = Repositorio & {
  /** Confere que o banco responde (usado por /saude/banco). */
  ping(): Promise<void>;
  /** Fecha as conexões. */
  fechar(): Promise<void>;
};

export function criarRepositorioSqlServer(pool: sql.ConnectionPool, opcoes: { aviso?: (msg: string) => void } = {}): RepositorioSqlServer {
  // Cópia da lista da busca. `versao` sobe a cada escrita; a cópia só vale se a versão não mudou.
  let versao = 0;
  const cache = new Map<string, { versao: number; ate: number; valor: unknown }>();
  const mudou = () => {
    versao++;
    cache.clear();
  };
  async function comCache<T>(chave: string, carregar: () => Promise<T>): Promise<T> {
    const guardado = cache.get(chave);
    if (guardado && guardado.versao === versao && guardado.ate > Date.now()) return structuredClone(guardado.valor as T);
    const versaoAoIniciar = versao;
    const valor = await carregar();
    if (versaoAoIniciar === versao) cache.set(chave, { versao, ate: Date.now() + VALIDADE_CACHE_MS, valor: structuredClone(valor) });
    return valor;
  }

  /**
   * Todos os comandos do repositório, sobre uma forma de abrir pedidos (`novo`): o conjunto de conexões (chamadas
   * avulsas) ou uma transação aberta. Fora de transação, uma falha de conexão passageira (banco do Azure acordando)
   * é repetida; dentro dela não, porque a transação já foi perdida.
   */
  function montar(novo: NovoRequest, emTransacao: boolean, rodarTransacao: Repositorio['transacao']): Repositorio {
    const tentar = <R>(f: () => Promise<R>): Promise<R> => (emTransacao ? f() : comTentativas(f, { tentativas: 2, esperaInicialMs: 2000, aviso: opcoes.aviso }));
    const q = (texto: string, parametros?: (r: sql.Request) => void) => tentar(() => consultar(novo, texto, parametros));
    const escrever = async (texto: string, parametros?: (r: sql.Request) => void) => {
      const linhas = await q(texto, parametros);
      mudou();
      return linhas;
    };

    return {
      transacao: rodarTransacao,

      async criarUsuario(u) {
        try {
          const l = await escrever(
            `INSERT INTO dbo.Usuarios (email, emailNorm, senhaHash, papel, emailVerificado, nome, foto)
             OUTPUT inserted.id
             VALUES (@email, @emailNorm, @senhaHash, @papel, @emailVerificado, @nome, @foto)`,
            (r) => {
              r.input('email', sql.NVarChar(320), u.email);
              r.input('emailNorm', sql.NVarChar(320), u.email.toLowerCase());
              r.input('senhaHash', sql.NVarChar(200), u.senhaHash);
              r.input('papel', sql.VarChar(10), u.papel);
              r.input('emailVerificado', sql.Bit, u.emailVerificado);
              r.input('nome', sql.NVarChar(200), u.nome ?? null);
              r.input('foto', sql.NVarChar(sql.MAX), u.foto ?? null);
            },
          );
          return { ...structuredClone(u), id: l[0]!.id as number };
        } catch (e) {
          if (violacaoDeUnico(e)) throw new ErroEmailJaExiste();
          throw e;
        }
      },
      async acharUsuarioPorEmail(email) {
        const l = await q('SELECT * FROM dbo.Usuarios WHERE emailNorm = @emailNorm', (r) => r.input('emailNorm', sql.NVarChar(320), email.toLowerCase()));
        return l[0] ? linhaParaUsuario(l[0]) : null;
      },
      async acharUsuario(id) {
        const l = await q('SELECT * FROM dbo.Usuarios WHERE id = @id', (r) => r.input('id', sql.Int, id));
        return l[0] ? linhaParaUsuario(l[0]) : null;
      },
      async atualizarUsuario(id, parcial) {
        const r = novo();
        const sets = colunasDoUsuario(parcial, r);
        if (sets.length === 0) return;
        r.input('id', sql.Int, id);
        try {
          await tentar(() => r.query(`UPDATE dbo.Usuarios SET ${sets.join(', ')} WHERE id = @id`));
          mudou();
        } catch (e) {
          if (violacaoDeUnico(e)) throw new ErroEmailJaExiste();
          throw e;
        }
      },
      async excluirUsuario(id) {
        // Os códigos dele somem junto; os mercados e as buscas ficam, sem ligação com ele (regras da tabela).
        await escrever('DELETE FROM dbo.Usuarios WHERE id = @id', (r) => r.input('id', sql.Int, id));
      },

      async guardarToken(t) {
        // Códigos vencidos não servem mais: saem antes de guardar o novo.
        await q(
          `DELETE FROM dbo.Tokens WHERE expiraEm <= @agora;
           INSERT INTO dbo.Tokens (usuarioId, tipo, tokenHash, expiraEm) VALUES (@usuarioId, @tipo, @tokenHash, @expiraEm);`,
          (r) => {
            r.input('agora', sql.DateTime2(3), new Date());
            r.input('usuarioId', sql.Int, t.usuarioId);
            r.input('tipo', sql.VarChar(20), t.tipo satisfies TipoToken);
            r.input('tokenHash', sql.VarChar(128), t.tokenHash);
            r.input('expiraEm', sql.DateTime2(3), t.expiraEm);
          },
        );
      },
      async consumirToken(tipo, tokenHash, agora) {
        // Apaga e devolve numa só instrução: um código só pode ser usado uma vez, mesmo com dois pedidos ao mesmo tempo.
        const l = await q(
          `DELETE TOP (1) FROM dbo.Tokens OUTPUT deleted.usuarioId
           WHERE tipo = @tipo AND tokenHash = @tokenHash AND expiraEm > @agora`,
          (r) => {
            r.input('tipo', sql.VarChar(20), tipo);
            r.input('tokenHash', sql.VarChar(128), tokenHash);
            r.input('agora', sql.DateTime2(3), agora);
          },
        );
        return l[0] ? (l[0].usuarioId as number) : null;
      },

      async criarMercado(m) {
        try {
          const l = await escrever(
            `INSERT INTO dbo.Mercados (nome, endereco, nomeNorm, enderecoNorm, status, contaSituacao, usuarioId, detalhes, telefone)
             OUTPUT inserted.id
             VALUES (@nome, @endereco, @nomeNorm, @enderecoNorm, @status, @contaSituacao, @usuarioId, @detalhes, @telefone)`,
            (r) => {
              r.input('nome', sql.NVarChar(sql.MAX), m.nome);
              r.input('endereco', sql.NVarChar(sql.MAX), m.endereco);
              r.input('nomeNorm', sql.NVarChar(sql.MAX), m.nomeNorm);
              r.input('enderecoNorm', sql.NVarChar(sql.MAX), m.enderecoNorm);
              r.input('status', sql.VarChar(10), m.status);
              r.input('contaSituacao', sql.VarChar(12), m.contaSituacao);
              r.input('usuarioId', sql.Int, m.usuarioId);
              r.input('detalhes', sql.NVarChar(sql.MAX), m.detalhes == null ? null : JSON.stringify(m.detalhes));
              r.input('telefone', sql.VarChar(20), m.telefone ?? null);
            },
          );
          return { ...structuredClone(m), id: l[0]!.id as number };
        } catch (e) {
          if (violacaoDeUnico(e)) throw new ErroMercadoDuplicado();
          throw e;
        }
      },
      async acharMercado(id) {
        const l = await q(`SELECT ${COLUNAS_MERCADO} FROM dbo.Mercados WHERE id = @id`, (r) => r.input('id', sql.Int, id));
        return l[0] ? linhaParaMercado(l[0]) : null;
      },
      async acharMercadoPorChave(nomeNorm, enderecoNorm) {
        const l = await q(
          `SELECT ${COLUNAS_MERCADO} FROM dbo.Mercados
           WHERE chave = CONVERT(binary(64), HASHBYTES('SHA2_256', @nomeNorm) + HASHBYTES('SHA2_256', @enderecoNorm))
             AND nomeNorm = @nomeNorm AND enderecoNorm = @enderecoNorm`,
          (r) => {
            r.input('nomeNorm', sql.NVarChar(sql.MAX), nomeNorm);
            r.input('enderecoNorm', sql.NVarChar(sql.MAX), enderecoNorm);
          },
        );
        return l[0] ? linhaParaMercado(l[0]) : null;
      },
      async acharMercadoDoUsuario(usuarioId) {
        const l = await q(`SELECT TOP (1) ${COLUNAS_MERCADO} FROM dbo.Mercados WHERE usuarioId = @usuarioId ORDER BY id`, (r) => r.input('usuarioId', sql.Int, usuarioId));
        return l[0] ? linhaParaMercado(l[0]) : null;
      },
      async listarMercadosDoUsuario(usuarioId) {
        const l = await q(`SELECT ${COLUNAS_MERCADO} FROM dbo.Mercados WHERE usuarioId = @usuarioId ORDER BY id`, (r) => r.input('usuarioId', sql.Int, usuarioId));
        return l.map(linhaParaMercado);
      },
      async atualizarMercado(id, parcial) {
        const r = novo();
        const sets = colunasDoMercado(parcial, r);
        if (sets.length === 0) return;
        r.input('id', sql.Int, id);
        try {
          await tentar(() => r.query(`UPDATE dbo.Mercados SET ${sets.join(', ')} WHERE id = @id`));
          mudou();
        } catch (e) {
          if (violacaoDeUnico(e)) throw new ErroMercadoDuplicado();
          throw e;
        }
      },
      listarMercados() {
        return comCache('mercados', async () => (await q(`SELECT ${COLUNAS_MERCADO} FROM dbo.Mercados ORDER BY id`)).map(linhaParaMercado));
      },

      async salvarOferta(o) {
        // Atualiza se existe, senão insere. As travas (UPDLOCK, SERIALIZABLE) evitam que dois pedidos iguais ao mesmo
        // tempo tentem inserir o mesmo produto.
        await escrever(
          `BEGIN TRAN;
           UPDATE dbo.Ofertas WITH (UPDLOCK, SERIALIZABLE) SET ${COLUNAS_ATUALIZAVEIS_OFERTA} WHERE mercadoId = @mercadoId AND codigoBarras = @codigoBarras;
           IF @@ROWCOUNT = 0
             INSERT INTO dbo.Ofertas (${COLUNAS_OFERTA})
             VALUES (@mercadoId, @codigoBarras, @nome, @nomeNorm, @preco, @quantidadeTexto, @quantidadeValor, @quantidadeUnidade, @categoria, @disponivel, @precoAtualizadoEm, @promocaoPreco, @promocaoInicio, @promocaoFim);
           COMMIT;`,
          (r) => parametrosDaOferta(r, o),
        );
      },
      async salvarOfertas(ofertas) {
        // Em lotes: cada lote vai ao banco como UM texto JSON (uma ida só), que o SQL Server abre com OPENJSON. Primeiro atualiza o que já
        // existe, depois insere o que falta NA ORDEM de entrada (a coluna seq, que dá a ordem da lista do painel).
        const COLUNAS_JSON =
          "ord int '$.ord', mercadoId int '$.mercadoId', codigoBarras varchar(32) '$.codigoBarras', nome nvarchar(max) '$.nome', nomeNorm nvarchar(max) '$.nomeNorm', preco decimal(12,2) '$.preco', quantidadeTexto nvarchar(max) '$.quantidadeTexto', quantidadeValor float '$.quantidadeValor', quantidadeUnidade varchar(10) '$.quantidadeUnidade', categoria nvarchar(max) '$.categoria', disponivel bit '$.disponivel', precoAtualizadoEm datetime2(3) '$.precoAtualizadoEm', promocaoPreco decimal(12,2) '$.promocaoPreco', promocaoInicio datetime2(3) '$.promocaoInicio', promocaoFim datetime2(3) '$.promocaoFim'";
        for (let i = 0; i < ofertas.length; i += 500) {
          const json = JSON.stringify(
            ofertas.slice(i, i + 500).map((o, ord) => ({
              ord, mercadoId: o.mercadoId, codigoBarras: o.codigoBarras, nome: o.nome, nomeNorm: o.nomeNorm, preco: o.preco,
              quantidadeTexto: o.quantidadeTexto, quantidadeValor: o.quantidadeValor, quantidadeUnidade: o.quantidadeUnidade, categoria: o.categoria,
              disponivel: o.disponivel, precoAtualizadoEm: o.precoAtualizadoEm.toISOString(), promocaoPreco: o.promocaoPreco,
              promocaoInicio: o.promocaoInicio?.toISOString() ?? null, promocaoFim: o.promocaoFim?.toISOString() ?? null,
            })),
          );
          await escrever(
            `DECLARE @o TABLE (ord int, mercadoId int, codigoBarras varchar(32), nome nvarchar(max), nomeNorm nvarchar(max), preco decimal(12,2), quantidadeTexto nvarchar(max), quantidadeValor float, quantidadeUnidade varchar(10), categoria nvarchar(max), disponivel bit, precoAtualizadoEm datetime2(3), promocaoPreco decimal(12,2), promocaoInicio datetime2(3), promocaoFim datetime2(3));
             INSERT INTO @o SELECT ord, mercadoId, codigoBarras, nome, nomeNorm, preco, quantidadeTexto, quantidadeValor, quantidadeUnidade, categoria, disponivel, precoAtualizadoEm, promocaoPreco, promocaoInicio, promocaoFim FROM OPENJSON(@json) WITH (${COLUNAS_JSON});
             BEGIN TRAN;
             UPDATE t SET t.nome = s.nome, t.nomeNorm = s.nomeNorm, t.preco = s.preco, t.quantidadeTexto = s.quantidadeTexto, t.quantidadeValor = s.quantidadeValor, t.quantidadeUnidade = s.quantidadeUnidade, t.categoria = s.categoria, t.disponivel = s.disponivel, t.precoAtualizadoEm = s.precoAtualizadoEm, t.promocaoPreco = s.promocaoPreco, t.promocaoInicio = s.promocaoInicio, t.promocaoFim = s.promocaoFim
               FROM dbo.Ofertas t WITH (UPDLOCK, SERIALIZABLE) JOIN @o s ON s.mercadoId = t.mercadoId AND s.codigoBarras = t.codigoBarras;
             INSERT INTO dbo.Ofertas (${COLUNAS_OFERTA})
               SELECT s.mercadoId, s.codigoBarras, s.nome, s.nomeNorm, s.preco, s.quantidadeTexto, s.quantidadeValor, s.quantidadeUnidade, s.categoria, s.disponivel, s.precoAtualizadoEm, s.promocaoPreco, s.promocaoInicio, s.promocaoFim
               FROM @o s WHERE NOT EXISTS (SELECT 1 FROM dbo.Ofertas t WITH (UPDLOCK, SERIALIZABLE) WHERE t.mercadoId = s.mercadoId AND t.codigoBarras = s.codigoBarras)
               ORDER BY s.ord;
             COMMIT;`,
            (r) => r.input('json', sql.NVarChar(sql.MAX), json),
          );
        }
      },
      async acharOferta(mercadoId, codigoBarras) {
        const l = await q(`SELECT ${COLUNAS_OFERTA} FROM dbo.Ofertas WHERE mercadoId = @mercadoId AND codigoBarras = @codigoBarras`, (r) => {
          r.input('mercadoId', sql.Int, mercadoId);
          r.input('codigoBarras', sql.VarChar(32), codigoBarras);
        });
        return l[0] ? linhaParaOferta(l[0]) : null;
      },
      async removerOferta(mercadoId, codigoBarras) {
        const l = await escrever(
          'DELETE FROM dbo.Ofertas OUTPUT deleted.codigoBarras WHERE mercadoId = @mercadoId AND codigoBarras = @codigoBarras',
          (r) => {
            r.input('mercadoId', sql.Int, mercadoId);
            r.input('codigoBarras', sql.VarChar(32), codigoBarras);
          },
        );
        return l.length > 0;
      },
      async listarOfertasDoMercado(mercadoId) {
        const l = await q(`SELECT ${COLUNAS_OFERTA} FROM dbo.Ofertas WHERE mercadoId = @mercadoId ORDER BY seq`, (r) => r.input('mercadoId', sql.Int, mercadoId));
        return l.map(linhaParaOferta);
      },
      listarOfertasParaBusca() {
        return comCache('busca', async () => {
          const l = await q(
            `SELECT ${COLUNAS_OFERTA.split(', ').map((c) => `o.${c}`).join(', ')},
                    m.id AS m_id, m.nome AS m_nome, m.endereco AS m_endereco, m.nomeNorm AS m_nomeNorm, m.enderecoNorm AS m_enderecoNorm,
                    m.status AS m_status, m.contaSituacao AS m_contaSituacao, m.usuarioId AS m_usuarioId, m.detalhes AS m_detalhes, m.telefone AS m_telefone
             FROM dbo.Ofertas o JOIN dbo.Mercados m ON m.id = o.mercadoId
             WHERE o.disponivel = 1 AND m.status = 'ativo'
             ORDER BY o.seq`,
          );
          return l.map((x) => ({
            oferta: linhaParaOferta(x),
            mercado: linhaParaMercado({
              id: x.m_id, nome: x.m_nome, endereco: x.m_endereco, nomeNorm: x.m_nomeNorm, enderecoNorm: x.m_enderecoNorm, status: x.m_status,
              contaSituacao: x.m_contaSituacao, usuarioId: x.m_usuarioId, detalhes: x.m_detalhes, telefone: x.m_telefone,
            }),
          }));
        });
      },

      async salvarFoto(f) {
        // Só a lista de códigos com foto é descartada: gravar fotos (a busca automática grava muitas) não pode apagar o cache das ofertas.
        await q(
          `BEGIN TRAN;
           UPDATE dbo.FotosProduto WITH (UPDLOCK, SERIALIZABLE)
             SET origem = @origem, url = @url, imagem = @imagem, mercadoId = @mercadoId, atualizadaEm = @atualizadaEm
             WHERE codigoBarras = @codigoBarras;
           IF @@ROWCOUNT = 0
             INSERT INTO dbo.FotosProduto (codigoBarras, origem, url, imagem, mercadoId, atualizadaEm)
             VALUES (@codigoBarras, @origem, @url, @imagem, @mercadoId, @atualizadaEm);
           COMMIT;`,
          (r) => {
            r.input('codigoBarras', sql.VarChar(32), f.codigoBarras);
            r.input('origem', sql.VarChar(15), f.origem);
            r.input('url', sql.NVarChar(1000), f.url);
            r.input('imagem', sql.NVarChar(sql.MAX), f.imagem);
            r.input('mercadoId', sql.Int, f.mercadoId);
            r.input('atualizadaEm', sql.DateTime2(3), f.atualizadaEm);
          },
        );
        cache.delete('codigosComFoto');
        cache.delete('codigosIlustrativos');
      },
      async salvarFotosDaPlanilha(fotos, mercadoId, atualizadaEm) {
        for (let i = 0; i < fotos.length; i += 500) {
          const json = JSON.stringify(fotos.slice(i, i + 500).map(([codigoBarras, url]) => ({ codigoBarras, url })));
          await q(
            `DECLARE @f TABLE (codigoBarras varchar(32), url nvarchar(1000));
             INSERT INTO @f SELECT codigoBarras, url FROM OPENJSON(@json) WITH (codigoBarras varchar(32) '$.codigoBarras', url nvarchar(1000) '$.url');
             BEGIN TRAN;
             UPDATE t SET t.origem = 'planilha', t.url = s.url, t.imagem = NULL, t.mercadoId = @mercadoId, t.atualizadaEm = @atualizadaEm
               FROM dbo.FotosProduto t WITH (UPDLOCK, SERIALIZABLE) JOIN @f s ON s.codigoBarras = t.codigoBarras
               WHERE NOT (t.origem = 'mercado' AND t.imagem IS NOT NULL) AND NOT (t.origem = 'planilha' AND t.url = s.url);
             INSERT INTO dbo.FotosProduto (codigoBarras, origem, url, imagem, mercadoId, atualizadaEm)
               SELECT s.codigoBarras, 'planilha', s.url, NULL, @mercadoId, @atualizadaEm FROM @f s
               WHERE NOT EXISTS (SELECT 1 FROM dbo.FotosProduto t WITH (UPDLOCK, SERIALIZABLE) WHERE t.codigoBarras = s.codigoBarras);
             COMMIT;`,
            (r) => {
              r.input('json', sql.NVarChar(sql.MAX), json);
              r.input('mercadoId', sql.Int, mercadoId);
              r.input('atualizadaEm', sql.DateTime2(3), atualizadaEm);
            },
          );
        }
        cache.delete('codigosComFoto');
        cache.delete('codigosIlustrativos');
      },
      async acharFoto(codigoBarras) {
        const l = await q('SELECT * FROM dbo.FotosProduto WHERE codigoBarras = @codigoBarras', (r) => r.input('codigoBarras', sql.VarChar(32), codigoBarras));
        return l[0] ? linhaParaFoto(l[0]) : null;
      },
      async removerFoto(codigoBarras) {
        const l = await q(
          'DELETE FROM dbo.FotosProduto OUTPUT deleted.codigoBarras WHERE codigoBarras = @codigoBarras',
          (r) => r.input('codigoBarras', sql.VarChar(32), codigoBarras),
        );
        cache.delete('codigosComFoto');
        cache.delete('codigosIlustrativos');
        return l.length > 0;
      },
      async listarResumoDeFotos(codigos) {
        if (codigos.length === 0) return [];
        const l = await q(
          `SELECT f.codigoBarras, f.origem
           FROM dbo.FotosProduto f
           JOIN OPENJSON(@codigos) WITH (c varchar(32) '$') j ON j.c = f.codigoBarras
           WHERE f.imagem IS NOT NULL OR (f.origem = 'openfoodfacts' AND f.url IS NOT NULL)
           ORDER BY f.codigoBarras`,
          (r) => r.input('codigos', sql.NVarChar(sql.MAX), JSON.stringify(codigos)),
        );
        return l.map((x) => ({ codigoBarras: x.codigoBarras as string, origem: x.origem as FotoProduto['origem'] }));
      },
      async acharNomeDoProduto(codigoBarras) {
        const l = await q('SELECT TOP (1) nome FROM dbo.Ofertas WHERE codigoBarras = @codigoBarras ORDER BY LEN(nome) DESC, mercadoId', (r) => r.input('codigoBarras', sql.VarChar(32), codigoBarras));
        return l[0] ? (l[0].nome as string) : null;
      },
      async listarFotosParaBaixar(limite) {
        const l = await q(
          'SELECT TOP (@limite) codigoBarras, url FROM dbo.FotosProduto WHERE url IS NOT NULL AND imagem IS NULL ORDER BY codigoBarras',
          (r) => r.input('limite', sql.Int, Math.max(0, limite)),
        );
        return l.map((x) => ({ codigoBarras: x.codigoBarras as string, url: x.url as string }));
      },
      listarCodigosComFotoIlustrativa() {
        return comCache('codigosIlustrativos', async () =>
          (await q("SELECT codigoBarras FROM dbo.FotosProduto WHERE origem = 'ilustrativa' AND imagem IS NOT NULL ORDER BY codigoBarras")).map((x) => x.codigoBarras as string),
        );
      },
      listarCodigosComFoto() {
        return comCache('codigosComFoto', async () =>
          (await q("SELECT codigoBarras FROM dbo.FotosProduto WHERE imagem IS NOT NULL OR (origem = 'openfoodfacts' AND url IS NOT NULL) ORDER BY codigoBarras")).map((x) => x.codigoBarras as string),
        );
      },
      async listarCodigosSemFoto(limite, tentarDeNovoAntesDe) {
        const l = await q(
          `SELECT TOP (@limite) o.codigoBarras
           FROM (SELECT DISTINCT codigoBarras FROM dbo.Ofertas) o
           LEFT JOIN dbo.FotosProduto f ON f.codigoBarras = o.codigoBarras
           WHERE f.codigoBarras IS NULL OR (((f.url IS NULL AND f.imagem IS NULL) OR f.origem = 'ilustrativa') AND f.atualizadaEm < @antes)
           ORDER BY o.codigoBarras`,
          (r) => {
            r.input('limite', sql.Int, Math.max(0, limite));
            r.input('antes', sql.DateTime2(3), tentarDeNovoAntesDe);
          },
        );
        return l.map((x) => x.codigoBarras as string);
      },

      async acharConfiguracao(chave) {
        const l = await q('SELECT valor FROM dbo.Configuracao WHERE chave = @chave', (r) => r.input('chave', sql.NVarChar(100), chave));
        return l[0] ? (l[0].valor as string) : null;
      },
      async salvarConfiguracao(chave, valor) {
        await q(
          `BEGIN TRAN;
           UPDATE dbo.Configuracao WITH (UPDLOCK, SERIALIZABLE) SET valor = @valor WHERE chave = @chave;
           IF @@ROWCOUNT = 0 INSERT INTO dbo.Configuracao (chave, valor) VALUES (@chave, @valor);
           COMMIT;`,
          (r) => {
            r.input('chave', sql.NVarChar(100), chave);
            r.input('valor', sql.NVarChar(sql.MAX), valor);
          },
        );
      },
      async listarConfiguracoes(prefixo) {
        const l = await q('SELECT chave, valor FROM dbo.Configuracao WHERE LEFT(chave, LEN(@prefixo)) = @prefixo ORDER BY chave', (r) =>
          r.input('prefixo', sql.NVarChar(100), prefixo),
        );
        return l.map((x) => ({ chave: x.chave as string, valor: x.valor as string }));
      },

      async registrarBusca(b) {
        await q(
          'INSERT INTO dbo.Buscas (usuarioId, termo, resultados, mercadosDistintos) VALUES (@usuarioId, @termo, @resultados, @mercadosDistintos)',
          (r) => {
            r.input('usuarioId', sql.Int, b.usuarioId);
            r.input('termo', sql.NVarChar(400), b.termo.slice(0, 400));
            r.input('resultados', sql.Int, b.resultados);
            r.input('mercadosDistintos', sql.Int, b.mercadosDistintos);
          },
        );
      },
      async listarBuscas() {
        const l = await q('SELECT usuarioId, termo, resultados, mercadosDistintos FROM dbo.Buscas ORDER BY id');
        return l.map((x): BuscaRegistrada => ({
          usuarioId: (x.usuarioId as number | null) ?? null,
          termo: x.termo as string,
          resultados: x.resultados as number,
          mercadosDistintos: x.mercadosDistintos as number,
        }));
      },
    };
  }

  const avulso = montar(
    () => new sql.Request(pool),
    false,
    async <R>(fn: (r: Repositorio) => Promise<R>): Promise<R> => {
      const tx = await comTentativas(
        async () => {
          const t = new sql.Transaction(pool);
          await t.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
          return t;
        },
        { tentativas: 4, esperaInicialMs: 3000, aviso: opcoes.aviso },
      );
      try {
        const trava = await new sql.Request(tx)
          .input('recurso', sql.NVarChar(255), TRAVA_TRANSACAO)
          .input('espera', sql.Int, ESPERA_MAXIMA_TRAVA_MS)
          .query(`DECLARE @r int; EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @espera; SELECT @r AS codigo;`);
        if ((trava.recordset[0]?.codigo as number) < 0) throw new Error('O banco está ocupado com outra operação; tente de novo.');
        const dentro: Repositorio = montar(() => new sql.Request(tx), true, (f) => f(dentro));
        const resultado = await fn(dentro);
        await tx.commit();
        mudou();
        return resultado;
      } catch (e) {
        await tx.rollback().catch(() => undefined);
        mudou();
        throw e;
      }
    },
  );

  return {
    ...avulso,
    async ping() {
      await comTentativas(async () => void (await new sql.Request(pool).query('SELECT 1 AS ok')), { tentativas: 6, esperaInicialMs: 5000, aviso: opcoes.aviso });
    },
    async fechar() {
      await pool.close();
    },
  };
}
