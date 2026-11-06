// Descobre com qual mercado o usuário (papel "mercado") está trabalhando.
// Um usuário pode ter vários mercados: o painel manda `?mercadoId=` com o que ele escolheu. Sem isso vale o primeiro.
// REGRA DE SEGURANÇA: o mercado escolhido precisa ser DO usuário; nunca se confia só no número vindo do navegador.
import type { Mercado, Repositorio } from '../repositorio';

export const MSG_SEM_MERCADO = 'Sua conta não está ligada a um mercado ativo';
export const MSG_MERCADO_ALHEIO = 'Você não tem acesso a esse mercado';
const MSG_ID_INVALIDO = 'mercadoId inválido';

export type Escolha = { ok: true; mercado: Mercado } | { ok: false; status: 400 | 403; erro: string };

export async function mercadoEscolhidoDoUsuario(repo: Repositorio, usuarioId: number, bruto: unknown): Promise<Escolha> {
  const ativos = (await repo.listarMercadosDoUsuario(usuarioId)).filter((m) => m.status === 'ativo');
  if (bruto === undefined) {
    return ativos.length > 0 ? { ok: true, mercado: ativos[0] } : { ok: false, status: 403, erro: MSG_SEM_MERCADO };
  }
  if (typeof bruto !== 'string' || !/^\d+$/.test(bruto)) return { ok: false, status: 400, erro: MSG_ID_INVALIDO };
  const escolhido = ativos.find((m) => m.id === Number(bruto));
  if (!escolhido) {
    return { ok: false, status: 403, erro: ativos.length === 0 ? MSG_SEM_MERCADO : MSG_MERCADO_ALHEIO };
  }
  return { ok: true, mercado: escolhido };
}
