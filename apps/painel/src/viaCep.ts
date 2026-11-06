// Consulta de CEP no ViaCEP (https://viacep.com.br), serviço público e gratuito dos Correios/comunidade.
// Usado no formulário do mercado: ao digitar o CEP, rua, bairro, cidade e estado são preenchidos sozinhos.
// A consulta leva só o CEP (nada de dados do mercado ou da conta). Se o serviço estiver fora do ar ou sem internet,
// o formulário continua funcionando: a pessoa digita o endereço à mão.

/** As partes do endereço que o CEP informa (o número e o complemento a pessoa digita). */
export interface EnderecoDoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/** Resultado da consulta: achou o endereço, o CEP não existe, ou não foi possível consultar (rede/serviço). */
export type ResultadoCep =
  | { situacao: 'achou'; endereco: EnderecoDoCep }
  | { situacao: 'nao-achou' }
  | { situacao: 'falhou' };

/** Tempo máximo de espera pela resposta, para o formulário não ficar "buscando" para sempre. */
const TEMPO_MAXIMO_MS = 8000;

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Busca o endereço de um CEP com 8 dígitos (só números). Nunca lança erro: devolve `falhou` se não deu para consultar.
 * O ViaCEP responde `{ "erro": true }` (ou sem cidade) para CEP que não existe.
 */
export async function buscarCep(cep: string): Promise<ResultadoCep> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_MAXIMO_MS);
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controle.signal });
    // O ViaCEP responde 400 para CEP com formato inválido: para o formulário é o mesmo que "não achou".
    if (resposta.status === 400) return { situacao: 'nao-achou' };
    if (!resposta.ok) return { situacao: 'falhou' };
    const dados = (await resposta.json()) as Record<string, unknown> | null;
    if (!dados || typeof dados !== 'object' || dados.erro) return { situacao: 'nao-achou' };
    const cidade = texto(dados.localidade);
    if (cidade === '') return { situacao: 'nao-achou' };
    return {
      situacao: 'achou',
      endereco: { logradouro: texto(dados.logradouro), bairro: texto(dados.bairro), cidade, uf: texto(dados.uf).toUpperCase() },
    };
  } catch {
    return { situacao: 'falhou' };
  } finally {
    clearTimeout(relogio);
  }
}
