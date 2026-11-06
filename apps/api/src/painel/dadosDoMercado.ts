// Leitura e validação dos dados de um mercado (nome, endereço completo e telefone) vindos do painel.
// Usado ao criar um mercado ("Adicionar mercado") e ao editar o "Meu mercado".
import {
  UFS,
  montarEndereco,
  normalizarTexto,
  validarCep,
  validarTelefone,
  type EnderecoMercado,
} from '@mercado/shared';
import type { Mercado } from '../repositorio';

export type Leitura<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** Campos que o painel envia. Todos texto; o servidor valida e normaliza. */
const CAMPOS = ['nome', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'telefone'] as const;
type Campo = (typeof CAMPOS)[number];

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Limites de tamanho e mensagem de cada campo de texto simples. */
const REGRAS_TEXTO: Record<'nome' | 'logradouro' | 'numero' | 'bairro' | 'cidade', { min: number; max: number; erro: string }> = {
  nome: { min: 2, max: 100, erro: 'Informe o nome do mercado' },
  logradouro: { min: 3, max: 120, erro: 'Informe a rua ou avenida' },
  numero: { min: 1, max: 10, erro: 'Informe o número (ou S/N)' },
  bairro: { min: 2, max: 60, erro: 'Informe o bairro' },
  cidade: { min: 2, max: 60, erro: 'Informe a cidade' },
};
const MSG_UF = 'Informe o estado (UF), por exemplo SP';
const MSG_COMPLEMENTO = 'O complemento é longo demais';

/** Dados já validados, prontos para gravar. */
export interface DadosMercado {
  nome: string;
  detalhes: EnderecoMercado;
  telefone: string;
}

/** Texto aparado, ou `undefined` se não é texto. */
const texto = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined);

/** Valida um conjunto completo de dados (nome + endereço + telefone). `base` completa o que não veio no corpo. */
function validar(entrada: Partial<Record<Campo, unknown>>): Leitura<DadosMercado> {
  const simples: Record<string, string> = {};
  for (const [campo, regra] of Object.entries(REGRAS_TEXTO)) {
    const valor = texto(entrada[campo as Campo]);
    if (valor === undefined || valor.length < regra.min || valor.length > regra.max) {
      return { ok: false, erro: regra.erro };
    }
    simples[campo] = valor;
  }
  const complementoBruto = entrada.complemento;
  if (complementoBruto !== undefined && complementoBruto !== null && typeof complementoBruto !== 'string') {
    return { ok: false, erro: MSG_COMPLEMENTO };
  }
  const complemento = typeof complementoBruto === 'string' ? complementoBruto.trim() : '';
  if (complemento.length > 60) return { ok: false, erro: MSG_COMPLEMENTO };

  const uf = texto(entrada.uf)?.toUpperCase();
  if (uf === undefined || !(UFS as readonly string[]).includes(uf)) return { ok: false, erro: MSG_UF };

  const cep = validarCep(texto(entrada.cep) ?? '');
  if (!cep.ok) return { ok: false, erro: cep.motivo };
  const telefone = validarTelefone(texto(entrada.telefone) ?? '');
  if (!telefone.ok) return { ok: false, erro: telefone.motivo };

  return {
    ok: true,
    valor: {
      nome: simples.nome,
      telefone: telefone.valor,
      detalhes: {
        logradouro: simples.logradouro,
        numero: simples.numero,
        complemento: complemento === '' ? null : complemento,
        bairro: simples.bairro,
        cidade: simples.cidade,
        uf,
        cep: cep.valor,
      },
    },
  };
}

/** Corpo do "Adicionar mercado": todos os campos são obrigatórios (menos o complemento). */
export function lerMercadoNovo(corpo: unknown): Leitura<DadosMercado> {
  if (!ehObjeto(corpo)) return { ok: false, erro: 'Corpo inválido' };
  for (const chave of Object.keys(corpo)) {
    if (!(CAMPOS as readonly string[]).includes(chave)) return { ok: false, erro: `Campo não permitido: ${chave}` };
  }
  return validar(corpo);
}

/** O que gravar no mercado a partir de dados validados: nome, partes do endereço, o texto único do endereço e o telefone. */
export function paraGravar(d: DadosMercado): Pick<Mercado, 'nome' | 'nomeNorm' | 'endereco' | 'enderecoNorm' | 'detalhes' | 'telefone'> {
  const endereco = montarEndereco(d.detalhes);
  return {
    nome: d.nome,
    nomeNorm: normalizarTexto(d.nome),
    endereco,
    enderecoNorm: normalizarTexto(endereco),
    detalhes: d.detalhes,
    telefone: d.telefone,
  };
}

/**
 * Corpo do "Salvar" do Meu mercado: só os campos que mudam, e o resultado precisa ficar completo.
 * Para não perder o que já estava salvo, junta o que veio com o que o mercado já tem (`atual`).
 * Aceita também `endereco` (texto único), só por compatibilidade: grava o texto e zera as partes do endereço.
 */
export function lerEdicaoMercado(corpo: unknown, atual: Mercado): Leitura<Partial<Mercado>> {
  if (corpo === undefined || corpo === null) return { ok: false, erro: 'Nada para alterar' };
  if (!ehObjeto(corpo)) return { ok: false, erro: 'Corpo inválido' };
  const chaves = Object.keys(corpo);
  if (chaves.length === 0) return { ok: false, erro: 'Nada para alterar' };

  const legado = chaves.includes('endereco');
  const permitidas: readonly string[] = [...CAMPOS, 'endereco'];
  for (const chave of chaves) {
    if (!permitidas.includes(chave)) return { ok: false, erro: `Campo não pode ser alterado: ${chave}` };
  }
  if (legado && chaves.some((c) => c !== 'endereco' && c !== 'nome')) {
    return { ok: false, erro: 'Use os campos do endereço por partes' };
  }

  if (legado) {
    const parcial: Partial<Mercado> = {};
    if ('nome' in corpo) {
      const nome = texto(corpo.nome);
      if (!nome) return { ok: false, erro: 'Nome inválido' };
      parcial.nome = nome;
      parcial.nomeNorm = normalizarTexto(nome);
    }
    const endereco = texto(corpo.endereco);
    if (!endereco) return { ok: false, erro: 'Endereço inválido' };
    parcial.endereco = endereco;
    parcial.enderecoNorm = normalizarTexto(endereco);
    parcial.detalhes = null;
    return { ok: true, valor: parcial };
  }

  // Valores atuais (para o que não foi enviado). Mercado criado só por planilha não tem as partes: ficam vazias
  // e o mercado precisa preencher tudo de uma vez.
  const d = atual.detalhes;
  const mesclado: Partial<Record<Campo, unknown>> = {
    nome: atual.nome,
    logradouro: d?.logradouro,
    numero: d?.numero,
    complemento: d?.complemento,
    bairro: d?.bairro,
    cidade: d?.cidade,
    uf: d?.uf,
    cep: d?.cep,
    telefone: atual.telefone ?? undefined,
    ...(corpo as Partial<Record<Campo, unknown>>),
  };
  const lido = validar(mesclado);
  if (!lido.ok) return lido;
  return { ok: true, valor: paraGravar(lido.valor) };
}
