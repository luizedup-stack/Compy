import {
  ErroEmailJaExiste,
  ErroMercadoDuplicado,
  type BuscaRegistrada,
  type Mercado,
  type OfertaArmazenada,
  type Repositorio,
  type TipoToken,
  type Usuario,
} from './repositorio';

interface TokenArmazenado {
  usuarioId: number;
  tipo: TipoToken;
  tokenHash: string;
  expiraEm: Date;
}

interface Dados {
  usuarios: Map<number, Usuario>;
  tokens: TokenArmazenado[];
  mercados: Map<number, Mercado>;
  ofertas: Map<string, OfertaArmazenada>;
  buscas: BuscaRegistrada[];
  proximoUsuarioId: number;
  proximoMercadoId: number;
}

function dadosVazios(): Dados {
  return {
    usuarios: new Map(),
    tokens: [],
    mercados: new Map(),
    ofertas: new Map(),
    buscas: [],
    proximoUsuarioId: 1,
    proximoMercadoId: 1,
  };
}

const copia = <T>(valor: T): T => structuredClone(valor);
const chaveOferta = (mercadoId: number, codigoBarras: string) => `${mercadoId}:${codigoBarras}`;
const emailNorm = (email: string) => email.toLowerCase();

/** Repositório em memória que também sabe guardar e restaurar tudo como texto (usado pelo programa de computador para não perder os dados ao fechar). */
export type RepositorioMemoria = Repositorio & {
  /** Todo o estado como texto JSON; espera as transações em andamento terminarem. */
  exportarEstado(): Promise<string>;
  /** Troca o estado atual pelo texto gerado por exportarEstado. Lança erro se o texto não for válido. */
  importarEstado(texto: string): void;
};

// Datas e mapas não existem em JSON: viram objetos etiquetados e voltam ao normal na leitura.
function paraTexto(estado: unknown): string {
  return JSON.stringify(
    { versao: 1, dados: estado },
    function (this: Record<string, unknown>, chave: string, valor: unknown) {
      const original = this[chave];
      if (original instanceof Date) return { $data: Number.isNaN(original.getTime()) ? null : original.toISOString() };
      if (valor instanceof Map) return { $mapa: [...valor] };
      return valor;
    },
  );
}

function deTexto(texto: string): Dados {
  const lido = JSON.parse(texto, (_chave, valor: unknown) => {
    if (valor && typeof valor === 'object') {
      const o = valor as Record<string, unknown>;
      if ('$data' in o) return o.$data === null ? new Date(NaN) : new Date(o.$data as string);
      if ('$mapa' in o) return new Map(o.$mapa as [unknown, unknown][]);
    }
    return valor;
  }) as { versao?: number; dados?: Dados };
  const d = lido.dados;
  if (
    lido.versao !== 1 ||
    !d ||
    !(d.usuarios instanceof Map) ||
    !(d.mercados instanceof Map) ||
    !(d.ofertas instanceof Map) ||
    !Array.isArray(d.tokens) ||
    !Array.isArray(d.buscas) ||
    typeof d.proximoUsuarioId !== 'number' ||
    typeof d.proximoMercadoId !== 'number'
  ) {
    throw new Error('Estado salvo inválido');
  }
  return d;
}

export function criarRepositorioMemoria(): RepositorioMemoria {
  let dados = dadosVazios();
  let fila: Promise<unknown> = Promise.resolve();
  // O registro de buscas só cresce, então fica fora da cópia de segurança da transacao (R32): o custo
  // dela não aumenta com o número de buscas. Durante uma transacao, o que muda nas buscas fica anotado
  // aqui para ser desfeito num rollback.
  let desfazerBuscas: (() => void)[] | null = null;

  function achaColisaoDeMercado(nomeNorm: string, enderecoNorm: string, ignorarId?: number) {
    for (const m of dados.mercados.values()) {
      if (m.id !== ignorarId && m.nomeNorm === nomeNorm && m.enderecoNorm === enderecoNorm) return m;
    }
    return undefined;
  }

  function achaUsuarioPorEmail(email: string, ignorarId?: number) {
    const alvo = emailNorm(email);
    for (const u of dados.usuarios.values()) {
      if (u.id !== ignorarId && emailNorm(u.email) === alvo) return u;
    }
    return undefined;
  }

  // Repositório entregue às funções de transacao: sua transacao() roda inline (reentrante).
  const dentroDaTransacao: Repositorio = {
    transacao: (fn) => fn(dentroDaTransacao),

    async criarUsuario(u) {
      if (achaUsuarioPorEmail(u.email)) throw new ErroEmailJaExiste();
      const usuario: Usuario = { ...copia(u), id: dados.proximoUsuarioId++ };
      dados.usuarios.set(usuario.id, usuario);
      return copia(usuario);
    },
    async acharUsuarioPorEmail(email) {
      const u = achaUsuarioPorEmail(email);
      return u ? copia(u) : null;
    },
    async acharUsuario(id) {
      const u = dados.usuarios.get(id);
      return u ? copia(u) : null;
    },
    async atualizarUsuario(id, parcial) {
      const u = dados.usuarios.get(id);
      if (!u) return;
      if (parcial.email !== undefined && achaUsuarioPorEmail(parcial.email, id)) {
        throw new ErroEmailJaExiste();
      }
      Object.assign(u, copia(parcial));
    },
    async excluirUsuario(id) {
      dados.usuarios.delete(id);
      dados.tokens = dados.tokens.filter((t) => t.usuarioId !== id);
      for (const m of dados.mercados.values()) {
        if (m.usuarioId === id) m.usuarioId = null;
      }
      for (const b of dados.buscas) {
        if (b.usuarioId !== id) continue;
        b.usuarioId = null;
        desfazerBuscas?.push(() => {
          b.usuarioId = id;
        });
      }
    },

    async guardarToken(t) {
      // Tokens vencidos não servem mais (os usados já saíram em consumirToken): descarta antes de guardar.
      const agora = Date.now();
      dados.tokens = dados.tokens.filter((x) => x.expiraEm.getTime() > agora);
      dados.tokens.push(copia(t));
    },
    async consumirToken(tipo, tokenHash, agora) {
      const i = dados.tokens.findIndex(
        (t) => t.tipo === tipo && t.tokenHash === tokenHash && t.expiraEm.getTime() > agora.getTime(),
      );
      if (i === -1) return null;
      const [token] = dados.tokens.splice(i, 1);
      return token!.usuarioId;
    },

    async criarMercado(m) {
      if (achaColisaoDeMercado(m.nomeNorm, m.enderecoNorm)) throw new ErroMercadoDuplicado();
      const mercado: Mercado = { ...copia(m), id: dados.proximoMercadoId++ };
      dados.mercados.set(mercado.id, mercado);
      return copia(mercado);
    },
    async acharMercado(id) {
      const m = dados.mercados.get(id);
      return m ? copia(m) : null;
    },
    async acharMercadoPorChave(nomeNorm, enderecoNorm) {
      const m = achaColisaoDeMercado(nomeNorm, enderecoNorm);
      return m ? copia(m) : null;
    },
    async acharMercadoDoUsuario(usuarioId) {
      for (const m of dados.mercados.values()) {
        if (m.usuarioId === usuarioId) return copia(m);
      }
      return null;
    },
    async listarMercadosDoUsuario(usuarioId) {
      return [...dados.mercados.values()].filter((x) => x.usuarioId === usuarioId).sort((a, b) => a.id - b.id).map(copia);
    },
    async atualizarMercado(id, parcial) {
      const m = dados.mercados.get(id);
      if (!m) return;
      const nomeNorm = parcial.nomeNorm ?? m.nomeNorm;
      const enderecoNorm = parcial.enderecoNorm ?? m.enderecoNorm;
      if (achaColisaoDeMercado(nomeNorm, enderecoNorm, id)) throw new ErroMercadoDuplicado();
      Object.assign(m, copia(parcial));
    },
    async listarMercados() {
      return [...dados.mercados.values()].map(copia);
    },

    async salvarOferta(o) {
      dados.ofertas.set(chaveOferta(o.mercadoId, o.codigoBarras), copia(o));
    },
    async acharOferta(mercadoId, codigoBarras) {
      const o = dados.ofertas.get(chaveOferta(mercadoId, codigoBarras));
      return o ? copia(o) : null;
    },
    async removerOferta(mercadoId, codigoBarras) {
      return dados.ofertas.delete(chaveOferta(mercadoId, codigoBarras));
    },
    async listarOfertasDoMercado(mercadoId) {
      return [...dados.ofertas.values()].filter((o) => o.mercadoId === mercadoId).map(copia);
    },
    async listarOfertasParaBusca() {
      const itens: { oferta: OfertaArmazenada; mercado: Mercado }[] = [];
      for (const oferta of dados.ofertas.values()) {
        const mercado = dados.mercados.get(oferta.mercadoId);
        if (oferta.disponivel && mercado?.status === 'ativo') {
          itens.push({ oferta: copia(oferta), mercado: copia(mercado) });
        }
      }
      return itens;
    },

    async registrarBusca(b) {
      dados.buscas.push(copia(b));
      desfazerBuscas?.push(() => {
        dados.buscas.pop();
      });
    },
    async listarBuscas() {
      return dados.buscas.map(copia);
    },
  };

  // Fila única: transações de nível superior e chamadas avulsas ao repositório externo
  // passam por ela, uma por vez. Assim, uma escrita feita fora de uma transação espera
  // a transação em andamento terminar e nunca é descartada por um rollback.
  function enfileirar<R>(tarefa: () => Promise<R>): Promise<R> {
    const execucao = fila.then(tarefa);
    fila = execucao.catch(() => undefined);
    return execucao;
  }

  const externo = {} as Record<string, unknown>;
  for (const [nome, metodo] of Object.entries(dentroDaTransacao)) {
    if (nome === 'transacao') continue;
    externo[nome] = (...args: unknown[]) =>
      enfileirar(() => (metodo as (...a: unknown[]) => Promise<unknown>)(...args));
  }

  return {
    ...(externo as unknown as Omit<Repositorio, 'transacao'>),
    exportarEstado: () => enfileirar(async () => paraTexto(dados)),
    importarEstado(texto: string): void {
      dados = deTexto(texto);
    },
    // Se fn lançar erro, os dados voltam ao estado anterior (incluindo os contadores de id).
    transacao<R>(fn: (r: Repositorio) => Promise<R>): Promise<R> {
      return enfileirar(async () => {
        const { buscas, ...resto } = dados;
        const antes = copia(resto);
        const desfazer: (() => void)[] = [];
        desfazerBuscas = desfazer;
        try {
          return await fn(dentroDaTransacao);
        } catch (erro) {
          for (const passo of desfazer.reverse()) passo();
          dados = { ...antes, buscas };
          throw erro;
        } finally {
          desfazerBuscas = null;
        }
      });
    },
  };
}
