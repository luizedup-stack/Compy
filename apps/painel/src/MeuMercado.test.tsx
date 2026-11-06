// Testes da tela "Meu mercado": cadastrar o mercado (endereço completo + telefone), editar, e adicionar outro mercado.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, resposta, simularApi, type Chamada } from './ajudantesTeste';

const ENDERECO = 'Rua das Flores, 100 - Vila Sônia, São Paulo - SP, CEP 05501-000';
const detalhes = { logradouro: 'Rua das Flores', numero: '100', complemento: null, bairro: 'Vila Sônia', cidade: 'São Paulo', uf: 'SP', cep: '05501000' };

/** O mercado como o servidor devolve em GET /painel/mercado. */
const mercado = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  nome: 'Mercado Central',
  endereco: ENDERECO,
  telefone: '11912345678',
  detalhes,
  perfilCompleto: true,
  totalProdutos: 12,
  produtosDesatualizados: 0,
  ...extra,
});

/** Um mercado na lista "meus mercados". */
const resumo = (extra: Record<string, unknown> = {}) => ({ id: 1, nome: 'Mercado Central', endereco: ENDERECO, totalProdutos: 12, perfilCompleto: true, ...extra });

interface Roteiro {
  lista?: unknown[];
  mercado?: Record<string, unknown>;
  patch?: (c: Chamada) => Response;
  post?: (c: Chamada) => Response;
}

/** Simula o servidor: lista de mercados da conta, mercado em uso, e o que fazer com PATCH e POST. */
function servidor({ lista = [resumo()], mercado: m = mercado(), patch, post }: Roteiro = {}) {
  let listaAtual = lista;
  return simularApi(
    async (c) => {
      if (c.caminho.startsWith('/painel/meus-mercados')) {
        if (c.metodo === 'POST') {
          const r = post ? post(c) : resposta(resumo({ id: 2, nome: 'Novo' }), 201);
          // Mercado criado: passa a constar na lista da conta (como o servidor de verdade faz).
          if (r.status === 201) listaAtual = [...listaAtual, (await r.clone().json()) as ReturnType<typeof resumo>];
          return r;
        }
        return resposta(listaAtual);
      }
      if (c.metodo === 'PATCH') return patch ? patch(c) : resposta(m);
      return resposta(m);
    },
    { meusMercados: 'responder' },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Preenche os campos de um formulário de mercado (dentro de `dentro`, ou da tela toda). */
async function preencher(usuario: ReturnType<typeof userEvent.setup>, dentro: HTMLElement | null, extra: Record<string, string> = {}) {
  const base = within(dentro ?? document.body);
  const { uf = 'SP', ...camposDeTexto } = extra;
  const valores: Record<string, string> = {
    'Nome do mercado': 'Mercado Novo',
    CEP: '05501-000',
    'Rua ou avenida': 'Rua Nova',
    Número: '55',
    Bairro: 'Centro',
    Cidade: 'Campinas',
    'Telefone (com DDD)': '(19) 91234-5678',
    ...camposDeTexto,
  };
  for (const [rotulo, valor] of Object.entries(valores)) {
    const campo = base.getByLabelText(rotulo);
    await usuario.clear(campo);
    await usuario.type(campo, valor);
  }
  await usuario.selectOptions(base.getByLabelText('Estado (UF)'), uf);
}

describe('mostrar o mercado em uso', () => {
  it('mostra nome, endereço por partes (CEP e telefone formatados) e a contagem de produtos', async () => {
    servidor({ mercado: mercado({ totalProdutos: 1 }) });
    abrir('/meu-mercado');

    expect(await screen.findByLabelText('Nome do mercado')).toHaveValue('Mercado Central');
    expect(screen.getByLabelText('CEP')).toHaveValue('05501-000');
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('Rua das Flores');
    expect(screen.getByLabelText('Número')).toHaveValue('100');
    expect(screen.getByLabelText('Bairro')).toHaveValue('Vila Sônia');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('Estado (UF)')).toHaveValue('SP');
    expect(screen.getByLabelText('Telefone (com DDD)')).toHaveValue('(11) 91234-5678');
    expect(screen.getByText('1 produto')).toBeInTheDocument();
    expect(screen.queryByText(/Complete o endereço/)).not.toBeInTheDocument();
  });

  it('mercado que veio só de planilha (sem endereço por partes) pede para completar', async () => {
    servidor({ mercado: mercado({ detalhes: null, telefone: null, perfilCompleto: false }) });
    abrir('/meu-mercado');
    expect(await screen.findByText('Complete o endereço e o telefone do seu mercado e salve.')).toBeInTheDocument();
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('');
  });
});

describe('faixa de preços antigos (usa DIAS_PRECO_VELHO do pacote compartilhado)', () => {
  it('aparece com 3 produtos, com o número de dias vindo da constante, e leva a /produtos', async () => {
    servidor({ mercado: mercado({ produtosDesatualizados: 3 }) });
    abrir('/meu-mercado');
    expect(await screen.findByText('3 produtos com preço de mais de 7 dias')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver produtos' })).toHaveAttribute('href', '/produtos');
  });

  it('usa o singular para 1 produto', async () => {
    servidor({ mercado: mercado({ produtosDesatualizados: 1 }) });
    abrir('/meu-mercado');
    expect(await screen.findByText('1 produto com preço de mais de 7 dias')).toBeInTheDocument();
  });

  it('some quando não há produtos desatualizados', async () => {
    servidor();
    abrir('/meu-mercado');
    await screen.findByText('12 produtos');
    expect(screen.queryByText(/com preço de mais de/)).not.toBeInTheDocument();
  });
});

describe('editar o mercado', () => {
  it('envia os dados do formulário (CEP e telefone como digitados) e mostra Dados atualizados', async () => {
    const chamadas = servidor({ patch: () => resposta(mercado({ nome: 'Mercado Central Novo' })) });
    abrir('/meu-mercado');
    const usuario = userEvent.setup();
    const nome = await screen.findByLabelText('Nome do mercado');
    await usuario.clear(nome);
    await usuario.type(nome, 'Mercado Central Novo');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Dados atualizados')).toBeInTheDocument();
    const patch = chamadas.find((c) => c.metodo === 'PATCH')!;
    expect(patch.caminho).toBe('/painel/mercado');
    expect(patch.autorizacao).toBe('Bearer tok-123');
    expect(patch.corpo).toMatchObject({ nome: 'Mercado Central Novo', cep: '05501-000', telefone: '(11) 91234-5678', uf: 'SP', numero: '100' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['CEP', '12', 'CEP inválido (use 8 números, por exemplo 05501-000)'],
    ['Telefone (com DDD)', '12345', 'Telefone inválido (use DDD + número, por exemplo (11) 91234-5678)'],
    ['Número', '', 'Informe o número (ou S/N)'],
    ['Cidade', '', 'Informe a cidade'],
  ])('confere %s no próprio formulário, sem chamar o servidor', async (rotulo, valor, mensagem) => {
    const chamadas = servidor();
    abrir('/meu-mercado');
    const usuario = userEvent.setup();
    const campo = await screen.findByLabelText(rotulo);
    await usuario.clear(campo);
    if (valor) await usuario.type(campo, valor);
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem);
    expect(chamadas.filter((c) => c.metodo === 'PATCH')).toHaveLength(0);
  });

  it('erro 409 do servidor aparece em um alerta e não mostra sucesso', async () => {
    servidor({ patch: () => resposta({ erro: 'Já existe um mercado com esse nome e endereço' }, 409) });
    abrir('/meu-mercado');
    const usuario = userEvent.setup();
    const nome = await screen.findByLabelText('Nome do mercado');
    await usuario.clear(nome);
    await usuario.type(nome, 'Outro');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um mercado com esse nome e endereço');
    expect(screen.queryByText('Dados atualizados')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nome do mercado')).toHaveValue('Outro');
  });
});

describe('cadastrar o primeiro mercado (conta nova)', () => {
  it('sem nenhum mercado, mostra o formulário "Cadastre o seu mercado"', async () => {
    servidor({ lista: [] });
    abrir('/meu-mercado');
    expect(await screen.findByRole('heading', { level: 2, name: 'Cadastre o seu mercado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cadastrar mercado' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar outro mercado' })).not.toBeInTheDocument();
  });

  it('envia o endereço completo e o telefone, passa a trabalhar no mercado novo e avisa', async () => {
    const chamadas = servidor({ lista: [], post: () => resposta(resumo({ id: 7, nome: 'Mercado Novo' }), 201) });
    abrir('/meu-mercado');
    const usuario = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: 'Cadastre o seu mercado' });
    await preencher(usuario, null, { uf: 'SP' });
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mercado' }));

    expect(await screen.findByText(/Mercado cadastrado: Mercado Novo/)).toBeInTheDocument();
    const post = chamadas.find((c) => c.metodo === 'POST')!;
    expect(post.caminho).toBe('/painel/meus-mercados');
    expect(post.corpo).toEqual({
      nome: 'Mercado Novo',
      cep: '05501-000',
      logradouro: 'Rua Nova',
      numero: '55',
      complemento: '',
      bairro: 'Centro',
      cidade: 'Campinas',
      uf: 'SP',
      telefone: '(19) 91234-5678',
    });
    expect(localStorage.getItem('bolso-certo:mercado-escolhido')).toBe('7');
  });

  it('erro do servidor aparece no formulário e nada é guardado', async () => {
    servidor({ lista: [], post: () => resposta({ erro: 'Já existe um mercado com esse nome e endereço' }, 409) });
    abrir('/meu-mercado');
    const usuario = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: 'Cadastre o seu mercado' });
    await preencher(usuario, null);
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar mercado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um mercado com esse nome e endereço');
    expect(localStorage.getItem('bolso-certo:mercado-escolhido')).toBeNull();
  });
});

describe('adicionar outro mercado', () => {
  it('lista os mercados da conta, marca o que está em uso e tem o botão "Adicionar outro mercado"', async () => {
    servidor({ lista: [resumo(), resumo({ id: 2, nome: 'Mercado Dois', endereco: 'Av. Dois, 2' })] });
    abrir('/meu-mercado');
    const lista = await screen.findByRole('list', { name: 'Meus mercados' });
    expect(within(lista).getByText('Mercado Central')).toBeInTheDocument();
    expect(within(lista).getByText('Mercado Dois')).toBeInTheDocument();
    expect(within(lista).getByText('em uso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar outro mercado' })).toBeInTheDocument();
  });

  it('o botão abre o formulário; cadastrar cria o mercado e passa a trabalhar nele', async () => {
    const chamadas = servidor({ post: () => resposta(resumo({ id: 9, nome: 'Filial Norte' }), 201) });
    abrir('/meu-mercado');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Adicionar outro mercado' }));
    const grupo = screen.getByRole('group', { name: 'Adicionar outro mercado' });
    await preencher(usuario, grupo, { 'Nome do mercado': 'Filial Norte', uf: 'SP' });
    await usuario.click(within(grupo).getByRole('button', { name: 'Cadastrar mercado' }));

    expect(await screen.findByText(/Mercado cadastrado: Filial Norte/)).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST')!.corpo).toMatchObject({ nome: 'Filial Norte' });
    expect(localStorage.getItem('bolso-certo:mercado-escolhido')).toBe('9');
  });

  it('Cancelar fecha o formulário sem chamar o servidor', async () => {
    const chamadas = servidor();
    abrir('/meu-mercado');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Adicionar outro mercado' }));
    await usuario.click(within(screen.getByRole('group', { name: 'Adicionar outro mercado' })).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('group', { name: 'Adicionar outro mercado' })).not.toBeInTheDocument();
    expect(chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(0);
  });
});

describe('seletor de mercado no topo (conta com mais de um mercado)', () => {
  it('aparece só com 2 ou mais mercados e troca o mercado usado nas chamadas', async () => {
    localStorage.setItem('bolso-certo:meus-mercados', JSON.stringify([resumo(), resumo({ id: 2, nome: 'Mercado Dois' })]));
    localStorage.setItem('bolso-certo:mercado-escolhido', '1');
    const chamadas = servidor({ lista: [resumo(), resumo({ id: 2, nome: 'Mercado Dois' })] });
    abrir('/meu-mercado');
    const usuario = userEvent.setup();
    const seletor = await screen.findByLabelText('Mercado:');
    expect(seletor).toHaveValue('1');
    await usuario.selectOptions(seletor, '2');

    expect(localStorage.getItem('bolso-certo:mercado-escolhido')).toBe('2');
    await screen.findByLabelText('Nome do mercado'); // a tela recarregou
    const ultimo = [...chamadas].reverse().find((c) => c.caminho.startsWith('/painel/mercado'))!;
    expect(ultimo.caminho).toBe('/painel/mercado?mercadoId=2');
  });

  it('com um mercado só, o seletor não aparece', async () => {
    localStorage.setItem('bolso-certo:meus-mercados', JSON.stringify([resumo()]));
    servidor();
    abrir('/meu-mercado');
    await screen.findByLabelText('Nome do mercado');
    expect(screen.queryByLabelText('Mercado:')).not.toBeInTheDocument();
  });
});

describe('erros ao carregar', () => {
  it('erro do servidor mostra o alerta', async () => {
    simularApi(() => resposta({ erro: 'Erro interno' }, 500), { meusMercados: 'responder' });
    abrir('/meu-mercado');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    expect(screen.queryByLabelText('Nome do mercado')).not.toBeInTheDocument();
  });

  it('sessão recusada (401) leva para /entrar', async () => {
    simularApi(() => resposta({ erro: 'Sessão expirada' }, 401), { meusMercados: 'responder' });
    abrir('/meu-mercado');
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
