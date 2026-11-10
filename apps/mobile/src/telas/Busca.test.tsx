import type { GrupoProduto, Oferta } from '@mercado/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { CHAVE_SESSAO } from '../sessao';
import { abrirApp, guardarSessao, lerCofre, simularApi, type RespostaFalsa } from '../teste/ajudas';

const ATACAREJO = { mercadoId: 4, mercadoNome: 'Atacarejo Econômico', endereco: 'Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP' };
const EMPORIO = { mercadoId: 3, mercadoNome: 'Empório Sonia', endereco: 'Rua das Hortênsias, 33 – Vila Sônia, São Paulo – SP' };
const ESTRELA = { mercadoId: 2, mercadoNome: 'Supermercado Estrela da Vila', endereco: 'Av. das Acácias, 850 – Vila Sônia, São Paulo – SP' };

function oferta(mercado: typeof ATACAREJO, parcial: Partial<Oferta>): Oferta {
  return {
    ...mercado,
    nomeNoMercado: 'Papel Higiênico',
    preco: 10,
    quantidadeTexto: '12 rolos',
    precoPorUnidade: 0.83,
    unidade: 'rolo',
    atualizadoEm: '2026-11-03T12:00:00.000Z',
    diasDesdeAtualizacao: 1,
    desatualizado: false,
    ...parcial,
  };
}

// Dados inspirados nas planilhas de dados-de-teste/ (preços e códigos inventados).
const FOX_12 = (): GrupoProduto => ({
  codigoBarras: '7890070035629',
  nome: 'Papel Higiênico Fox Folha Dupla 12 rolos',
  ofertas: [
    oferta(ATACAREJO, { nomeNoMercado: 'Papel Higiênico Fox Folha Dupla', preco: 14.7, quantidadeTexto: '12 ROLOS', precoPorUnidade: 1.23, diasDesdeAtualizacao: 1 }),
    oferta(EMPORIO, { nomeNoMercado: 'PAPEL HIGIENICO FOX FOLHA DUPLA', preco: 18.5, quantidadeTexto: '12rolos', precoPorUnidade: 1.54, diasDesdeAtualizacao: 0 }),
  ],
});

const NEVE_12 = (parcial: Partial<Oferta> = {}): GrupoProduto => ({
  codigoBarras: '7890070039733',
  nome: 'Papel Higiênico Neve Folha Dupla 12 rolos',
  ofertas: [oferta(ESTRELA, { nomeNoMercado: 'Papel Hig. Neve Folha Dupla', preco: 14.79, precoPorUnidade: 1.23, diasDesdeAtualizacao: 2, ...parcial })],
});

const SEM_QUANTIDADE: Partial<Oferta> = {
  nomeNoMercado: 'Papel Hig. X Folha Simples',
  preco: 14,
  quantidadeTexto: null,
  precoPorUnidade: null,
  unidade: null,
};

/** Papel higiênico X: por unidade o Empório (1,38 por rolo) vence; pela embalagem, a Estrela (R$ 14,00, sem quantidade). */
const X_POR_UNIDADE = (): GrupoProduto => ({
  codigoBarras: '7890070038361',
  nome: 'Papel Higiênico X Folha Simples',
  ofertas: [
    oferta(EMPORIO, { preco: 16.6, quantidadeTexto: '12rolos', precoPorUnidade: 1.38 }),
    oferta(ESTRELA, SEM_QUANTIDADE),
  ],
});
const X_POR_EMBALAGEM = (): GrupoProduto => {
  const [emporio, estrela] = X_POR_UNIDADE().ofertas;
  return { ...X_POR_UNIDADE(), ofertas: [estrela, emporio] };
};

const BUSCA = 'Buscar produto';
const TITULO_FOX = 'Papel Higiênico Fox Folha Dupla 12 rolos';
const EXPLICACAO_INICIO = /Produtos para comparar entre os estabelecimentos/;

/** Resposta de GET /produtos (lista da tela inicial). */
function listaInicial(grupos: GrupoProduto[], total = grupos.length): RespostaFalsa {
  return { status: 200, corpo: { grupos, total } };
}

/** As chamadas à busca por texto (GET /busca); a lista da tela inicial (GET /produtos) é outra coisa. */
const chamadasDeBusca = (api: ReturnType<typeof simularApi>) => api.chamadas.filter((c) => c.caminho === '/busca');

function resposta(grupos: GrupoProduto[]): RespostaFalsa {
  return { status: 200, corpo: grupos };
}

async function digitar(texto: string) {
  await fireEvent.changeText(screen.getByLabelText(BUSCA), texto);
}

/** Deixa passar `ms` de relógio falso dentro do act e resolve as promessas pendentes. */
async function avancar(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function buscarTexto(texto: string) {
  await digitar(texto);
  await avancar(400);
}

/** Nomes dos mercados na ordem em que as ofertas aparecem na tela. */
function mercadosNaTela(): string[] {
  return screen.getAllByTestId('oferta').map((el) => String(el.props.accessibilityLabel).split(',')[0]);
}

beforeEach(() => {
  jest.useFakeTimers();
  guardarSessao('tok-busca', true);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Busca', () => {
  it('abre com o campo de busca e já mostra a lista de produtos comparados, sem a pessoa digitar nada', async () => {
    const api = simularApi({ 'GET /produtos': listaInicial([FOX_12(), NEVE_12()]), 'GET /busca': resposta([]) });
    await abrirApp();
    expect(screen.getByLabelText(BUSCA)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('O que você quer comprar?')).toBeOnTheScreen();
    expect(await screen.findByText(TITULO_FOX)).toBeOnTheScreen();
    expect(screen.getByText('Papel Higiênico Neve Folha Dupla 12 rolos')).toBeOnTheScreen();
    expect(screen.getByText(EXPLICACAO_INICIO)).toBeOnTheScreen();
    // A comparação já vem feita: o grupo com mais de um mercado marca o mais barato.
    expect(screen.getAllByText('mais barato')).toHaveLength(1);
    await avancar(2000);
    expect(api.chamadas.map((c) => `${c.caminho}${c.consulta}`)).toEqual(['/produtos?ordem=unidade&pagina=1']);
    expect(api.chamadas[0].autorizacao).toBe('Bearer tok-busca');
    expect(chamadasDeBusca(api)).toHaveLength(0);
  });

  it('lista inicial vazia: avisa que ainda não há produtos', async () => {
    simularApi({ 'GET /produtos': listaInicial([]) });
    await abrirApp();
    expect(await screen.findByText('Ainda não há produtos cadastrados.')).toBeOnTheScreen();
  });

  it('erro ao carregar a lista inicial mostra a mensagem e "Tentar de novo" refaz a chamada', async () => {
    const rotas: Parameters<typeof simularApi>[0] = { 'GET /produtos': { status: 500, corpo: { erro: 'Falha no servidor' } } };
    const api = simularApi(rotas);
    await abrirApp();
    expect(await screen.findByText('Falha no servidor')).toBeOnTheScreen();
    rotas['GET /produtos'] = listaInicial([FOX_12()]);
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText(TITULO_FOX)).toBeOnTheScreen();
    expect(api.chamadas.filter((c) => c.caminho === '/produtos')).toHaveLength(2);
  });

  describe('lista inicial: mais produtos', () => {
    it('mostra "Carregar mais produtos" quando há mais, junta a próxima página e some quando acaba', async () => {
      const api = simularApi({
        'GET /produtos': (c) => (c.consulta.includes('pagina=1') ? listaInicial([FOX_12()], 2) : listaInicial([NEVE_12()], 2)),
      });
      await abrirApp();
      await screen.findByText(TITULO_FOX);
      expect(screen.queryByText('Papel Higiênico Neve Folha Dupla 12 rolos')).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Carregar mais produtos' }));
      expect(await screen.findByText('Papel Higiênico Neve Folha Dupla 12 rolos')).toBeOnTheScreen();
      expect(screen.getByText(TITULO_FOX)).toBeOnTheScreen(); // a primeira página continua
      expect(screen.queryByRole('button', { name: 'Carregar mais produtos' })).not.toBeOnTheScreen();
      expect(api.chamadas.map((c) => c.consulta)).toEqual(['?ordem=unidade&pagina=1', '?ordem=unidade&pagina=2']);
    });

    it('falha ao carregar mais mostra a mensagem, mantém o que já estava e "Tentar de novo" pede a mesma página', async () => {
      let falhar = true;
      const api = simularApi({
        'GET /produtos': (c) => {
          if (c.consulta.includes('pagina=1')) return listaInicial([FOX_12()], 2);
          return falhar ? { status: 500, corpo: { erro: 'Não deu' } } : listaInicial([NEVE_12()], 2);
        },
      });
      await abrirApp();
      await screen.findByText(TITULO_FOX);
      await fireEvent.press(screen.getByRole('button', { name: 'Carregar mais produtos' }));
      expect(await screen.findByText('Não deu')).toBeOnTheScreen();
      expect(screen.getByText(TITULO_FOX)).toBeOnTheScreen();

      falhar = false;
      await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(await screen.findByText('Papel Higiênico Neve Folha Dupla 12 rolos')).toBeOnTheScreen();
      expect(api.chamadas.filter((c) => c.consulta.includes('pagina=2'))).toHaveLength(2);
    });

    it('não repete o mesmo produto se a próxima página trouxer um que já está na tela', async () => {
      simularApi({
        'GET /produtos': (c) => (c.consulta.includes('pagina=1') ? listaInicial([FOX_12()], 3) : listaInicial([FOX_12(), NEVE_12()], 3)),
      });
      await abrirApp();
      await screen.findByText(TITULO_FOX);
      await fireEvent.press(screen.getByRole('button', { name: 'Carregar mais produtos' }));
      await screen.findByText('Papel Higiênico Neve Folha Dupla 12 rolos');
      expect(screen.getAllByText(TITULO_FOX)).toHaveLength(1);
    });
  });

  describe('chamada à API', () => {
    it('espera 400 ms depois da última tecla e chama GET /busca com q codificado, ordem=unidade e o Bearer', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]) });
      await abrirApp();
      await digitar('papel higienico');
      await avancar(399);
      expect(api.fetch).not.toHaveBeenCalled();
      await avancar(1);

      expect(api.chamadas).toHaveLength(1);
      expect(api.chamadas[0]).toMatchObject({
        metodo: 'GET',
        caminho: '/busca',
        consulta: '?q=papel%20higienico&ordem=unidade&ordenar=relevancia',
        autorizacao: 'Bearer tok-busca',
      });
      expect(await screen.findByText('Papel Higiênico Fox Folha Dupla 12 rolos')).toBeOnTheScreen();
    });

    it('várias letras seguidas mandam UMA só chamada, com o texto final', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]) });
      await abrirApp();
      for (const texto of ['pa', 'pap', 'pape', 'papel']) {
        await digitar(texto);
        await avancar(300); // cada tecla chega antes de vencer os 400 ms da anterior
      }
      expect(api.fetch).not.toHaveBeenCalled();
      await avancar(100);

      expect(api.chamadas).toHaveLength(1);
      expect(api.chamadas[0].consulta).toBe('?q=papel&ordem=unidade&ordenar=relevancia');
    });

    it('apaga os espaços das pontas antes de mandar', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]) });
      await abrirApp();
      await buscarTexto('  papel higienico  ');
      expect(api.chamadas.map((c) => c.consulta)).toEqual(['?q=papel%20higienico&ordem=unidade&ordenar=relevancia']);
    });

    it('codifica acentos e símbolos no q', async () => {
      const api = simularApi({ 'GET /busca': resposta([]) });
      await abrirApp();
      await buscarTexto('feijão & arroz');
      expect(api.chamadas[0].consulta).toBe('?q=feij%C3%A3o%20%26%20arroz&ordem=unidade&ordenar=relevancia');
    });

    it('com menos de 2 letras não chama a busca e continua mostrando a lista de produtos', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]), 'GET /produtos': listaInicial([NEVE_12()]) });
      await abrirApp();
      await screen.findByText('Papel Higiênico Neve Folha Dupla 12 rolos');
      await buscarTexto('a');
      await buscarTexto('   a   ');
      await avancar(2000);
      expect(chamadasDeBusca(api)).toHaveLength(0);
      expect(api.chamadas.filter((c) => c.caminho === '/produtos')).toHaveLength(1); // a lista não é recarregada à toa
      expect(screen.getByText('Papel Higiênico Neve Folha Dupla 12 rolos')).toBeOnTheScreen();
    });

    it('apagar o texto antes dos 400 ms cancela a chamada', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]) });
      await abrirApp();
      await digitar('arroz');
      await avancar(200);
      await digitar('a');
      await avancar(1000);
      expect(chamadasDeBusca(api)).toHaveLength(0);
    });

    it('apagar o texto com a busca em andamento volta à lista de produtos e uma resposta tardia da busca não reaparece', async () => {
      const pendentes: ((r: RespostaFalsa) => void)[] = [];
      simularApi({
        'GET /busca': () => new Promise<RespostaFalsa>((ok) => pendentes.push(ok)),
        'GET /produtos': listaInicial([NEVE_12()]),
      });
      await abrirApp();
      await screen.findByText('Papel Higiênico Neve Folha Dupla 12 rolos');
      await buscarTexto('papel');
      expect(screen.getByText('Buscando…')).toBeOnTheScreen();

      await digitar('');
      expect(await screen.findByText('Papel Higiênico Neve Folha Dupla 12 rolos')).toBeOnTheScreen(); // volta a lista
      expect(screen.queryByText('Buscando…')).not.toBeOnTheScreen();

      await act(async () => {
        pendentes[0](resposta([FOX_12()]));
      });
      expect(screen.queryByText(TITULO_FOX)).not.toBeOnTheScreen();
      expect(screen.getByText('Papel Higiênico Neve Folha Dupla 12 rolos')).toBeOnTheScreen();
    });

    it('não repete a chamada para a mesma busca já mostrada (nem com espaços a mais)', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]) });
      await abrirApp();
      await buscarTexto('papel');
      expect(api.chamadas).toHaveLength(1);

      await buscarTexto('papel ');
      await buscarTexto(' papel');
      await buscarTexto('papel');
      expect(api.chamadas).toHaveLength(1);

      // tocar de novo na opção que já está marcada também não refaz a chamada
      await fireEvent.press(screen.getByRole('radio', { name: 'Ordenar por Relevância' }));
      await avancar(1000);
      expect(api.chamadas).toHaveLength(1);
    });

    it('sair da tela antes dos 400 ms não dispara chamada nenhuma', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]) });
      await abrirApp();
      await digitar('papel');
      await avancar(200);
      await screen.unmount();
      await avancar(2000);
      expect(api.fetch).not.toHaveBeenCalled();
    });
  });

  describe('resultados', () => {
    it('mostra os grupos e as ofertas na ordem recebida, com "mais barato" só na primeira oferta do grupo com mais de uma', async () => {
      simularApi({ 'GET /busca': resposta([FOX_12(), NEVE_12()]) });
      await abrirApp();
      await buscarTexto('papel higienico');

      expect(await screen.findByText('Papel Higiênico Fox Folha Dupla 12 rolos')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Papel Higiênico Fox Folha Dupla 12 rolos' })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Papel Higiênico Neve Folha Dupla 12 rolos' })).toBeOnTheScreen();
      expect(mercadosNaTela()).toEqual(['Atacarejo Econômico', 'Empório Sonia', 'Supermercado Estrela da Vila']);

      expect(screen.getByText('R$ 14,70')).toBeOnTheScreen();
      expect(screen.getAllByText('R$ 1,23 por rolo')).toHaveLength(2); // Atacarejo (Fox) e Estrela (Neve)
      expect(screen.getByText('R$ 1,54 por rolo')).toBeOnTheScreen();
      expect(screen.getByText('Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP')).toBeOnTheScreen();
      expect(screen.getByText('R$ 18,50')).toBeOnTheScreen();
      expect(screen.getByText('atualizado hoje')).toBeOnTheScreen();
      expect(screen.getByText('R$ 14,79')).toBeOnTheScreen();

      // exatamente uma etiqueta, dentro da primeira oferta do grupo com 2 ofertas
      expect(screen.getAllByText('mais barato')).toHaveLength(1);
      const [primeira, segunda, unica] = screen.getAllByTestId('oferta');
      expect(String(primeira.props.accessibilityLabel)).toContain('mais barato');
      expect(String(segunda.props.accessibilityLabel)).not.toContain('mais barato');
      expect(String(unica.props.accessibilityLabel)).not.toContain('mais barato');
    });

    it('não reordena: mostra os grupos e as ofertas exatamente como a API mandou, mesmo fora de ordem de preço', async () => {
      const desordenado: GrupoProduto = {
        ...FOX_12(),
        ofertas: [...FOX_12().ofertas].reverse(), // o mais caro vem primeiro
      };
      simularApi({ 'GET /busca': resposta([NEVE_12(), desordenado]) });
      await abrirApp();
      await buscarTexto('papel');
      await screen.findByText('Papel Higiênico Fox Folha Dupla 12 rolos');

      expect(mercadosNaTela()).toEqual(['Supermercado Estrela da Vila', 'Empório Sonia', 'Atacarejo Econômico']);
      const titulos = screen.getAllByRole('header').map((el) => String(el.props.children));
      expect(titulos).toEqual(['Papel Higiênico Neve Folha Dupla 12 rolos', 'Papel Higiênico Fox Folha Dupla 12 rolos']);
    });

    it('oferta sem preço por unidade mostra "sem quantidade informada" e nenhuma linha de unidade', async () => {
      simularApi({ 'GET /busca': resposta([{ ...NEVE_12(), nome: 'Papel Higiênico X', ofertas: [oferta(ESTRELA, SEM_QUANTIDADE)] }]) });
      await abrirApp();
      await buscarTexto('papel');

      expect(await screen.findByText('sem quantidade informada')).toBeOnTheScreen();
      expect(screen.getByText('R$ 14,00')).toBeOnTheScreen();
      expect(screen.queryByText(/^R\$ .* por /)).not.toBeOnTheScreen();
    });

    it('oferta desatualizada continua na tela, com o aviso "Preço antigo" e o preço legível', async () => {
      simularApi({
        'GET /busca': resposta([NEVE_12({ desatualizado: true, diasDesdeAtualizacao: 45 })]),
      });
      await abrirApp();
      await buscarTexto('neve');

      expect(await screen.findByText('Preço antigo')).toBeOnTheScreen();
      expect(screen.getByText('R$ 14,79')).toBeOnTheScreen();
      expect(screen.getByText('Supermercado Estrela da Vila')).toBeOnTheScreen();
      expect(screen.getByText('atualizado há 45 dias')).toBeOnTheScreen();
    });

    it('lista vazia mostra "Nada encontrado" com o texto buscado', async () => {
      simularApi({ 'GET /busca': resposta([]) });
      await abrirApp();
      await buscarTexto('  xyzabc ');
      expect(await screen.findByText('Nada encontrado para "xyzabc".')).toBeOnTheScreen();
      expect(screen.queryByText(EXPLICACAO_INICIO)).not.toBeOnTheScreen();
    });

    it('mostra "Buscando…" enquanto a resposta não chega', async () => {
      const pendentes: ((r: RespostaFalsa) => void)[] = [];
      simularApi({ 'GET /busca': () => new Promise<RespostaFalsa>((ok) => pendentes.push(ok)) });
      await abrirApp();
      await buscarTexto('papel');
      expect(screen.getByText('Buscando…')).toBeOnTheScreen();
      expect(screen.queryByText(EXPLICACAO_INICIO)).not.toBeOnTheScreen();

      await act(async () => {
        pendentes[0](resposta([FOX_12()]));
      });
      expect(screen.queryByText('Buscando…')).not.toBeOnTheScreen();
      expect(screen.getByText('Papel Higiênico Fox Folha Dupla 12 rolos')).toBeOnTheScreen();
    });
  });

  describe('ordenar e filtrar', () => {
    it('começa em "Relevância" e as formas de ordenar são um grupo de opções acessível', async () => {
      simularApi({});
      await abrirApp();
      expect(screen.getByTestId('criterio').props.accessibilityRole).toBe('radiogroup');
      expect(screen.getByRole('radio', { name: 'Ordenar por Relevância', checked: true })).toBeOnTheScreen();
      for (const nome of ['Menor preço', 'Maior preço', 'Recentes']) {
        expect(screen.getByRole('radio', { name: `Ordenar por ${nome}`, checked: false })).toBeOnTheScreen();
      }
      expect(screen.getByRole('button', { name: 'Filtros' })).toBeOnTheScreen();
    });

    it('trocar para "Maior preço" refaz a busca na hora com ordenar=maior-preco', async () => {
      const api = simularApi({ 'GET /busca': resposta([X_POR_UNIDADE()]) });
      await abrirApp();
      await buscarTexto('papel hig x');
      await screen.findByText('Papel Higiênico X Folha Simples');

      await fireEvent.press(screen.getByRole('radio', { name: 'Ordenar por Maior preço' }));
      await avancar(0); // sem esperar os 400 ms: a troca é imediata

      expect(api.chamadas.map((c) => c.consulta)).toEqual([
        '?q=papel%20hig%20x&ordem=unidade&ordenar=relevancia',
        '?q=papel%20hig%20x&ordem=unidade&ordenar=maior-preco',
      ]);
      expect(screen.getByRole('radio', { name: 'Ordenar por Maior preço', checked: true })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Ordenar por Relevância', checked: false })).toBeOnTheScreen();
    });

    it('"Menor preço" na busca é o que o servidor já faz sem pedir: não manda ordenar', async () => {
      const api = simularApi({ 'GET /busca': resposta([X_POR_UNIDADE()]) });
      await abrirApp();
      await fireEvent.press(screen.getByRole('radio', { name: 'Ordenar por Menor preço' }));
      await buscarTexto('papel hig x');
      expect(api.chamadas.filter((c) => c.caminho === '/busca').map((c) => c.consulta)).toEqual(['?q=papel%20hig%20x&ordem=unidade']);
    });

    it('trocar a ordenação sem texto recarrega a lista de produtos; o texto digitado depois usa a ordenação escolhida', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]), 'GET /produtos': listaInicial([NEVE_12()]) });
      await abrirApp();
      await screen.findByText('Papel Higiênico Neve Folha Dupla 12 rolos');
      await fireEvent.press(screen.getByRole('radio', { name: 'Ordenar por Recentes' }));
      await avancar(1000);
      expect(chamadasDeBusca(api)).toHaveLength(0);
      expect(api.chamadas.filter((c) => c.caminho === '/produtos').map((c) => c.consulta)).toEqual([
        '?ordem=unidade&pagina=1',
        '?ordem=unidade&pagina=1&ordenar=recentes',
      ]);

      await buscarTexto('fox');
      expect(chamadasDeBusca(api).map((c) => c.consulta)).toEqual(['?q=fox&ordem=unidade&ordenar=recentes']);
    });

    it('trocar a ordenação com uma busca ainda esperando os 400 ms manda uma chamada só', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]) });
      await abrirApp();
      await digitar('fox');
      await avancar(100);
      await fireEvent.press(screen.getByRole('radio', { name: 'Ordenar por Maior preço' }));
      await avancar(0);
      await avancar(1000);
      expect(api.chamadas.map((c) => c.consulta)).toEqual(['?q=fox&ordem=unidade&ordenar=maior-preco']);
    });

    it('o painel de Filtros abre, aplica preço, "só promoções" e "comparar por embalagem" e a busca leva tudo na consulta', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]), 'GET /mercados': { status: 200, corpo: [] } });
      await abrirApp();
      await fireEvent.press(screen.getByRole('button', { name: 'Filtros' }));
      expect(await screen.findByTestId('painel-filtros')).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByLabelText('Preço mínimo'), '3,5');
      await fireEvent.changeText(screen.getByLabelText('Preço máximo'), '20');
      await fireEvent.press(screen.getByRole('checkbox', { name: '🔥 Só promoções' }));
      await fireEvent.press(screen.getByRole('radio', { name: 'Embalagem' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));
      await avancar(0);

      // o botão mostra quantos filtros estão ligados (preço, só promoções e comparar por embalagem = 3)
      expect(screen.getByRole('button', { name: 'Filtros, 3 ligados' })).toBeOnTheScreen();
      await buscarTexto('fox');
      expect(chamadasDeBusca(api).map((c) => c.consulta)).toEqual(['?q=fox&ordem=embalagem&ordenar=relevancia&precoMin=3.5&precoMax=20&promocao=1']);
    });

    it('filtro com valor inválido mostra o aviso e não aplica nada', async () => {
      const api = simularApi({ 'GET /busca': resposta([]), 'GET /mercados': { status: 200, corpo: [] } });
      await abrirApp();
      await fireEvent.press(screen.getByRole('button', { name: 'Filtros' }));
      await fireEvent.changeText(await screen.findByLabelText('Preço mínimo'), 'abc');
      await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));
      expect(await screen.findByText('Use só números nos valores (por exemplo 12,50).')).toBeOnTheScreen();
      await fireEvent.changeText(screen.getByLabelText('Preço mínimo'), '10');
      await fireEvent.changeText(screen.getByLabelText('Preço máximo'), '5');
      await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));
      expect(await screen.findByText('O preço mínimo não pode ser maior que o máximo.')).toBeOnTheScreen();
      expect(chamadasDeBusca(api)).toHaveLength(0);
    });

    it('"Limpar" desliga todos os filtros', async () => {
      simularApi({ 'GET /busca': resposta([]), 'GET /mercados': { status: 200, corpo: [] } });
      await abrirApp();
      await fireEvent.press(screen.getByRole('button', { name: 'Filtros' }));
      await fireEvent.press(await screen.findByRole('checkbox', { name: '🔥 Só promoções' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));
      await avancar(0);
      expect(screen.getByRole('button', { name: 'Filtros, 1 ligados' })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Filtros, 1 ligados' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Limpar' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));
      await avancar(0);
      expect(screen.getByRole('button', { name: 'Filtros' })).toBeOnTheScreen();
    });
  });

  describe('respostas fora de ordem', () => {
    it('a resposta antiga que chega depois da nova não sobrescreve o resultado', async () => {
      const pendentes: { q: string | null; resolver: (r: RespostaFalsa) => void }[] = [];
      simularApi({
        'GET /busca': (c) =>
          new Promise<RespostaFalsa>((resolver) => {
            pendentes.push({ q: new URLSearchParams(c.consulta).get('q'), resolver });
          }),
      });
      await abrirApp();
      await buscarTexto('papel');
      await buscarTexto('papel higienico');
      expect(pendentes.map((p) => p.q)).toEqual(['papel', 'papel higienico']);

      // a segunda chamada responde primeiro; a primeira responde atrasada
      await act(async () => {
        pendentes[1].resolver(resposta([NEVE_12()]));
      });
      expect(screen.getByText('Papel Higiênico Neve Folha Dupla 12 rolos')).toBeOnTheScreen();

      await act(async () => {
        pendentes[0].resolver(resposta([FOX_12()]));
      });
      expect(screen.getByText('Papel Higiênico Neve Folha Dupla 12 rolos')).toBeOnTheScreen();
      expect(screen.queryByText('Papel Higiênico Fox Folha Dupla 12 rolos')).not.toBeOnTheScreen();
      expect(screen.queryByText('Buscando…')).not.toBeOnTheScreen();
    });

    it('um erro antigo que chega depois da nova resposta também é ignorado', async () => {
      const pendentes: ((r: RespostaFalsa) => void)[] = [];
      simularApi({ 'GET /busca': () => new Promise<RespostaFalsa>((ok) => pendentes.push(ok)) });
      await abrirApp();
      await buscarTexto('papel');
      await buscarTexto('papel higienico');

      await act(async () => {
        pendentes[1](resposta([FOX_12()]));
      });
      await act(async () => {
        pendentes[0]({ status: 500, corpo: { erro: 'Falha no servidor' } });
      });
      expect(screen.queryByText('Falha no servidor')).not.toBeOnTheScreen();
      expect(screen.getByText('Papel Higiênico Fox Folha Dupla 12 rolos')).toBeOnTheScreen();
    });
  });

  describe('erros', () => {
    it('mostra a mensagem de rede e "Tentar de novo" refaz a mesma busca', async () => {
      const rotas: Parameters<typeof simularApi>[0] = { 'GET /produtos': listaInicial([]) }; // sem a rota /busca: o fetch falso simula falha de rede
      const api = simularApi(rotas);
      await abrirApp();
      await buscarTexto('papel');

      expect(await screen.findByText('Não foi possível falar com o servidor')).toBeOnTheScreen();
      expect(screen.queryByText(EXPLICACAO_INICIO)).not.toBeOnTheScreen();
      expect(chamadasDeBusca(api)).toHaveLength(1);

      rotas['GET /busca'] = resposta([FOX_12()]);
      await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
      await avancar(0);

      expect(chamadasDeBusca(api).map((c) => c.consulta)).toEqual(['?q=papel&ordem=unidade&ordenar=relevancia', '?q=papel&ordem=unidade&ordenar=relevancia']);
      expect(await screen.findByText('Papel Higiênico Fox Folha Dupla 12 rolos')).toBeOnTheScreen();
      expect(screen.queryByText('Não foi possível falar com o servidor')).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeOnTheScreen();
    });

    it('mostra o texto de erro mandado pelo servidor', async () => {
      simularApi({ 'GET /busca': { status: 500, corpo: { erro: 'Falha no servidor' } } });
      await abrirApp();
      await buscarTexto('papel');
      expect(await screen.findByText('Falha no servidor')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
    });

    it('depois de um erro, digitar outra busca funciona normalmente', async () => {
      const rotas: Parameters<typeof simularApi>[0] = {};
      const api = simularApi(rotas);
      await abrirApp();
      await buscarTexto('papel');
      await screen.findByText('Não foi possível falar com o servidor');

      rotas['GET /busca'] = resposta([FOX_12()]);
      await buscarTexto('fox');
      expect(await screen.findByText('Papel Higiênico Fox Folha Dupla 12 rolos')).toBeOnTheScreen();
      expect(api.chamadas.map((c) => c.consulta)).toEqual(['?q=papel&ordem=unidade&ordenar=relevancia', '?q=fox&ordem=unidade&ordenar=relevancia']);
    });

    it('um 401 encerra a sessão (apaga o token); o app continua aberto, sem login', async () => {
      simularApi({ 'GET /busca': { status: 401, corpo: { erro: 'Não autenticado' } } });
      await abrirApp();
      await buscarTexto('papel');

      await waitFor(() => expect(lerCofre().has(CHAVE_SESSAO)).toBe(false));
      expect(screen.getByLabelText(BUSCA)).toBeOnTheScreen();
    });
  });

  describe('somente leitura', () => {
    it('o campo de busca é o único campo de texto e não há botões de edição', async () => {
      simularApi({ 'GET /busca': resposta([FOX_12(), NEVE_12()]) });
      await abrirApp();
      await buscarTexto('papel');
      await screen.findByText('Papel Higiênico Fox Folha Dupla 12 rolos');

      expect(screen.container.queryAll((el) => el.type === 'TextInput')).toHaveLength(1);
      expect(screen.getByLabelText(BUSCA)).toBeOnTheScreen();
      // Os únicos botões são os das abas da barra inferior (Buscar, Mercados, Conta) o "Atualizar" do topo e o "Filtros"; nada que edite.
      const botoes = screen.queryAllByRole('button').map((el) => String(el.props.accessibilityLabel));
      expect(botoes).toHaveLength(5);
      expect(botoes.every((rotulo) => /^((Buscar|Estabelecimentos|Conta), tab, \d of 3|Atualizar produtos e preços|Filtros)$/.test(rotulo))).toBe(true);
    });
  });

  describe('sem confirmação de e-mail', () => {
    it('mesmo com o e-mail não confirmado não há aviso nenhum e a busca funciona normalmente', async () => {
      const api = simularApi({ 'GET /busca': resposta([FOX_12()]) });
      guardarSessao('tok-busca', false);
      await abrirApp();
      expect(screen.queryByText(/Confirme seu e-mail/)).not.toBeOnTheScreen();
      expect(screen.getByLabelText(BUSCA)).toBeOnTheScreen();

      await buscarTexto('fox');
      expect(await screen.findByText('Papel Higiênico Fox Folha Dupla 12 rolos')).toBeOnTheScreen();
      expect(chamadasDeBusca(api)).toHaveLength(1);
    });
  });
});
