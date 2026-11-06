// Testes do preenchimento do endereço pelo CEP (ViaCEP) no formulário do mercado.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, comSessao, fetchMock, resposta, simularApi, type Chamada } from './ajudantesTeste';
import { buscarCep } from './viaCep';

/** O que o ViaCEP devolve para o CEP 05501-000 (exemplo). */
const VIACEP = { cep: '05501-000', logradouro: 'Rua dos Ipês', bairro: 'Vila Sônia', localidade: 'São Paulo', uf: 'SP' };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  comSessao();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Abre "Meu mercado" de uma conta sem mercado (formulário de cadastro) com o ViaCEP respondendo como `viacep`. */
async function abrirFormulario(viacep: (c: Chamada) => Response | Promise<Response>) {
  const chamadas = simularApi(
    (c) => {
      if (c.caminho.startsWith('/ws/')) return viacep(c); // consulta ao ViaCEP
      return resposta([]); // lista de mercados da conta: nenhum ainda
    },
    { meusMercados: 'responder' },
  );
  abrir('/meu-mercado');
  await screen.findByRole('heading', { level: 2, name: 'Cadastre o seu mercado' });
  return chamadas;
}

describe('preencher o endereço pelo CEP', () => {
  it('ao completar o CEP, preenche rua, bairro, cidade e estado e leva o cursor para o número', async () => {
    const chamadas = await abrirFormulario(() => resposta(VIACEP));
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('CEP'), '05501-000');

    expect(await screen.findByText('Endereço preenchido pelo CEP. Confira e informe o número.')).toBeInTheDocument();
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('Rua dos Ipês');
    expect(screen.getByLabelText('Bairro')).toHaveValue('Vila Sônia');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('Estado (UF)')).toHaveValue('SP');
    expect(screen.getByLabelText('Número')).toHaveFocus();
    // A consulta leva só o CEP (8 números), nada de dados da conta.
    expect(chamadas.filter((c) => c.caminho.startsWith('/ws/')).map((c) => c.caminho)).toEqual(['/ws/05501000/json/']);
  });

  it('não consulta enquanto o CEP está incompleto', async () => {
    const chamadas = await abrirFormulario(() => resposta(VIACEP));
    await userEvent.setup().type(screen.getByLabelText('CEP'), '05501-0');
    expect(chamadas.filter((c) => c.caminho.startsWith('/ws/'))).toHaveLength(0);
    expect(screen.queryByText(/Buscando|preenchido|não encontrado/)).not.toBeInTheDocument();
  });

  it('CEP que não existe: avisa e deixa preencher à mão', async () => {
    await abrirFormulario(() => resposta({ erro: true }));
    await userEvent.setup().type(screen.getByLabelText('CEP'), '99999-999');
    expect(await screen.findByText('CEP não encontrado. Confira os números ou preencha o endereço à mão.')).toBeInTheDocument();
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('');
  });

  it('serviço fora do ar: avisa, não trava e a pessoa preenche à mão', async () => {
    await abrirFormulario(() => resposta({ erro: 'indisponível' }, 503));
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('CEP'), '05501-000');
    expect(await screen.findByText('Não foi possível buscar o CEP agora. Preencha o endereço à mão.')).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Rua ou avenida'), 'Rua Digitada');
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('Rua Digitada');
  });

  it('CEP de cidade pequena (sem rua nem bairro): preenche cidade e UF e pede o resto', async () => {
    await abrirFormulario(() => resposta({ cep: '13990-000', logradouro: '', bairro: '', localidade: 'Espírito Santo do Pinhal', uf: 'SP' }));
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Rua ou avenida'), 'Rua que a pessoa já digitou');
    await usuario.type(screen.getByLabelText('CEP'), '13990-000');
    expect(await screen.findByText('Cidade preenchida pelo CEP. Informe a rua, o bairro e o número.')).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade')).toHaveValue('Espírito Santo do Pinhal');
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('Rua que a pessoa já digitou'); // não apaga o que já estava
  });

  it('trocar o CEP consulta o novo; apagar um número cancela o aviso', async () => {
    const chamadas = await abrirFormulario((c) =>
      resposta(c.caminho.includes('05501000') ? VIACEP : { cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' }),
    );
    const usuario = userEvent.setup();
    const cep = screen.getByLabelText('CEP');
    await usuario.type(cep, '05501000');
    await screen.findByText(/Endereço preenchido/);
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('Rua dos Ipês');

    await usuario.clear(cep);
    await usuario.type(cep, '01001000');
    await screen.findByDisplayValue('Praça da Sé');
    expect(chamadas.filter((c) => c.caminho.startsWith('/ws/')).map((c) => c.caminho)).toEqual(['/ws/05501000/json/', '/ws/01001000/json/']);

    await usuario.type(cep, '{Backspace}');
    expect(screen.queryByText(/Endereço preenchido/)).not.toBeInTheDocument();
  });

  it('uma resposta atrasada de um CEP que já foi trocado é ignorada', async () => {
    let liberarPrimeira!: (r: Response) => void;
    await abrirFormulario((c) =>
      c.caminho.includes('05501000')
        ? new Promise<Response>((res) => (liberarPrimeira = res)) // a primeira consulta demora
        : resposta({ cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' }),
    );
    const usuario = userEvent.setup();
    const cep = screen.getByLabelText('CEP');
    await usuario.type(cep, '05501000');
    await usuario.clear(cep);
    await usuario.type(cep, '01001000');
    await screen.findByDisplayValue('Praça da Sé');

    liberarPrimeira(resposta(VIACEP)); // chega tarde
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('Praça da Sé'); // continua o do CEP novo
  });

  it('editar um mercado já cadastrado não consulta o CEP sozinho ao abrir a tela', async () => {
    const detalhes = { logradouro: 'Rua A', numero: '1', complemento: null, bairro: 'B', cidade: 'C', uf: 'SP', cep: '05501000' };
    const chamadas = simularApi(
      (c) => {
        if (c.caminho.startsWith('/painel/meus-mercados')) return resposta([{ id: 1, nome: 'M', endereco: 'x', totalProdutos: 0, perfilCompleto: true }]);
        return resposta({ id: 1, nome: 'M', endereco: 'x', telefone: '11912345678', detalhes, perfilCompleto: true, totalProdutos: 0, produtosDesatualizados: 0 });
      },
      { meusMercados: 'responder' },
    );
    abrir('/meu-mercado');
    expect(await screen.findByLabelText('CEP')).toHaveValue('05501-000');
    expect(chamadas.filter((c) => c.caminho.startsWith('/ws/'))).toHaveLength(0);
    expect(screen.getByLabelText('Rua ou avenida')).toHaveValue('Rua A');
  });
});

describe('buscarCep (consulta ao ViaCEP)', () => {
  it('trata 400 (formato inválido) como CEP não encontrado e erro de rede como falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    expect(await buscarCep('12345678')).toEqual({ situacao: 'nao-achou' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await buscarCep('12345678')).toEqual({ situacao: 'falhou' });
  });

  it('devolve o endereço com a UF em maiúsculas e sem espaços sobrando', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ logradouro: ' Rua X ', bairro: 'Y', localidade: 'Z', uf: 'sp' }), { status: 200 })));
    expect(await buscarCep('12345678')).toEqual({ situacao: 'achou', endereco: { logradouro: 'Rua X', bairro: 'Y', cidade: 'Z', uf: 'SP' } });
  });
});
