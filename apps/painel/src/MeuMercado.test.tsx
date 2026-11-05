import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, resposta, simularApi } from './ajudantesTeste';

const mercado = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  nome: 'Mercado Central',
  endereco: 'Rua das Flores, 100',
  totalProdutos: 12,
  produtosDesatualizados: 0,
  ...extra,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('faixa de preços antigos (usa DIAS_PRECO_VELHO do pacote compartilhado)', () => {
  it('aparece com 3 produtos, com o número de dias vindo da constante, e leva a /produtos', async () => {
    const chamadas = simularApi(() => resposta(mercado({ produtosDesatualizados: 3 })));
    abrir('/meu-mercado');

    const faixa = await screen.findByText('3 produtos com preço de mais de 7 dias');
    expect(faixa).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver produtos' })).toHaveAttribute('href', '/produtos');
    expect(chamadas[0].caminho).toBe('/painel/mercado');
    expect(chamadas[0].autorizacao).toBe('Bearer tok-123');
  });

  it('usa o singular para 1 produto', async () => {
    simularApi(() => resposta(mercado({ produtosDesatualizados: 1 })));
    abrir('/meu-mercado');

    expect(await screen.findByText('1 produto com preço de mais de 7 dias')).toBeInTheDocument();
  });

  it('some quando não há produtos desatualizados', async () => {
    simularApi(() => resposta(mercado({ produtosDesatualizados: 0 })));
    abrir('/meu-mercado');

    await screen.findByText('12 produtos');
    expect(screen.queryByText(/com preço de mais de/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver produtos' })).not.toBeInTheDocument();
  });
});

describe('Meu mercado', () => {
  it('mostra nome, endereço e a contagem de produtos', async () => {
    simularApi(() => resposta(mercado({ totalProdutos: 1 })));
    abrir('/meu-mercado');

    expect(await screen.findByLabelText('Nome do mercado')).toHaveValue('Mercado Central');
    expect(screen.getByLabelText('Endereço')).toHaveValue('Rua das Flores, 100');
    expect(screen.getByText('1 produto')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Meu mercado' })).toBeInTheDocument();
  });

  it('envia só o campo alterado e mostra Dados atualizados', async () => {
    const chamadas = simularApi((c) =>
      c.metodo === 'PATCH' ? resposta(mercado({ nome: 'Mercado Central Novo' })) : resposta(mercado()),
    );
    abrir('/meu-mercado');
    const user = userEvent.setup();
    const nome = await screen.findByLabelText('Nome do mercado');
    await user.clear(nome);
    await user.type(nome, 'Mercado Central Novo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Dados atualizados');
    const patch = chamadas.find((c) => c.metodo === 'PATCH')!;
    expect(patch.caminho).toBe('/painel/mercado');
    expect(patch.corpo).toEqual({ nome: 'Mercado Central Novo' });
    expect(patch.autorizacao).toBe('Bearer tok-123');
    expect(screen.getByLabelText('Nome do mercado')).toHaveValue('Mercado Central Novo');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('enviar nome e endereço juntos manda os dois', async () => {
    const chamadas = simularApi((c) =>
      c.metodo === 'PATCH' ? resposta(mercado({ nome: 'A', endereco: 'B' })) : resposta(mercado()),
    );
    abrir('/meu-mercado');
    const user = userEvent.setup();
    const nome = await screen.findByLabelText('Nome do mercado');
    await user.clear(nome);
    await user.type(nome, 'A');
    const endereco = screen.getByLabelText('Endereço');
    await user.clear(endereco);
    await user.type(endereco, 'B');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Dados atualizados');
    expect(chamadas.find((c) => c.metodo === 'PATCH')!.corpo).toEqual({ nome: 'A', endereco: 'B' });
  });

  it('erro 409 mostra a mensagem do servidor em um alerta e não mostra sucesso', async () => {
    simularApi((c) =>
      c.metodo === 'PATCH'
        ? resposta({ erro: 'Já existe um mercado com esse nome e endereço' }, 409)
        : resposta(mercado()),
    );
    abrir('/meu-mercado');
    const user = userEvent.setup();
    const nome = await screen.findByLabelText('Nome do mercado');
    await user.clear(nome);
    await user.type(nome, 'Outro');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um mercado com esse nome e endereço');
    expect(screen.queryByText('Dados atualizados')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nome do mercado')).toHaveValue('Outro');
  });

  it('Salvar sem mudar nada avisa e não chama o servidor', async () => {
    const chamadas = simularApi(() => resposta(mercado()));
    abrir('/meu-mercado');
    await screen.findByLabelText('Nome do mercado');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nada para alterar');
    expect(chamadas.filter((c) => c.metodo === 'PATCH')).toHaveLength(0);
  });

  it('erro ao carregar mostra o alerta', async () => {
    simularApi(() => resposta({ erro: 'Sua conta não está ligada a um mercado ativo' }, 403));
    abrir('/meu-mercado');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta não está ligada a um mercado ativo');
    expect(screen.queryByLabelText('Nome do mercado')).not.toBeInTheDocument();
  });

  it('sessão recusada (401) leva para /entrar', async () => {
    simularApi(() => resposta({ erro: 'Sessão expirada' }, 401));
    abrir('/meu-mercado');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
