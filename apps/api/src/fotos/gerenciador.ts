// Procura sozinho a foto dos produtos que ainda não têm, sem sobrecarregar o serviço de onde ela vem: uma consulta por vez,
// com uma pausa entre elas. O que foi achado (ou "procurado e não achado") fica gravado no banco, então cada produto só é
// consultado uma vez; os "não achados" são procurados de novo depois de alguns dias (alguém pode ter cadastrado a foto).
import type { Repositorio } from '../repositorio';
import { baixarFoto, ImagemInvalida } from './baixar';
import { CHAVE_ILUSTRATIVA, CHAVE_ILUSTRATIVA_SEM, escolherIlustrativa, type Categoria, type EntradaIlustrativa } from './ilustrativas';
import { ErroTemporario, type BuscadorDeFotos, type BuscadorPorNome } from './openFoodFacts';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface ResumoDaBusca {
  achadas: number;
  naoAchadas: number;
  /** Produtos que ficaram com a foto ilustrativa (a do tipo de produto) por não haver a específica. */
  ilustrativas: number;
  /** Ficaram para depois (limite de consultas ou serviço fora do ar). */
  adiadas: boolean;
}

export interface GerenciadorDeFotos {
  /** Dispara a busca em segundo plano e volta na hora. Se já está rodando, só pede para olhar de novo ao terminar. */
  agendarPendentes(): void;
  /** Procura as fotos de todos os produtos pendentes e espera terminar (usado pela ferramenta em lote e nos testes). */
  processarPendentes(): Promise<ResumoDaBusca>;
}

export interface OpcoesGerenciador {
  repo: Repositorio;
  buscador: BuscadorDeFotos;
  /** Banco de fotos ILUSTRATIVAS (uma por tipo de produto): último recurso, quando nenhuma foto específica foi achada. Sem ele, o produto fica "sem foto". */
  ilustrativas?: EntradaIlustrativa[];
  /**
   * Os tipos de produto conhecidos (leite, arroz...). Com eles, o servidor COMPLETA o banco ilustrativo sozinho: se o tipo do produto ainda não tem
   * imagem, procura uma (pela busca do tipo, no banco aberto), guarda no banco de dados e usa. Exige `buscadorPorNome`.
   */
  categorias?: Categoria[];
  /** Procura pelo NOME quando o código de barras não existe no banco aberto (ex.: produtos de teste, com códigos inventados). Sem ele, só procura pelo código. */
  buscadorPorNome?: BuscadorPorNome;
  /** Procura também cada produto pelo próprio nome (padrão: sim). Com false, o `buscadorPorNome` só serve para achar a foto dos TIPOS de produto (banco ilustrativo). */
  procurarProdutoPorNome?: boolean;
  /** Pausa depois de cada busca por nome: o serviço limita essas buscas por minuto. */
  intervaloPorNomeMs?: number;
  /** Quando o serviço pede calma, tenta de novo sozinho depois deste tempo. */
  reagendarAposMs?: number;
  /** Agenda uma função para daqui a `ms` (padrão: setTimeout sem segurar o processo; os testes trocam). */
  agendarDepois?: (funcao: () => void, ms: number) => void;
  /** Baixa o link e devolve a imagem reduzida (texto "data:image/jpeg;base64,..."). Padrão: baixarFoto (com as proteções de segurança). */
  baixador?: (link: string) => Promise<string>;
  /** Pausa entre uma consulta e outra (o serviço pede moderação). */
  intervaloMs?: number;
  /** Quantos produtos pegar do banco por vez. */
  lote?: number;
  /** Depois de quantos dias vale procurar de novo um produto que não foi achado. */
  tentarDeNovoAposDias?: number;
  agora?: () => Date;
  esperar?: (ms: number) => Promise<void>;
  log?: (mensagem: string) => void;
}

export function criarGerenciadorDeFotos({
  repo,
  buscador,
  baixador = baixarFoto,
  ilustrativas = [],
  categorias = [],
  buscadorPorNome,
  procurarProdutoPorNome = true,
  intervaloPorNomeMs = 7000,
  reagendarAposMs = 10 * 60 * 1000,
  agendarDepois = (funcao, ms) => void setTimeout(funcao, ms).unref(),
  intervaloMs = 700,
  lote = 100,
  tentarDeNovoAposDias = 30,
  agora = () => new Date(),
  esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => undefined,
}: OpcoesGerenciador): GerenciadorDeFotos {
  let rodando = false;
  let olharDeNovo = false;

  /**
   * 1) Fotos que têm o link mas ainda não a imagem (indicadas na planilha do mercado): baixa, reduz e guarda no banco. Link que não
   *    serve (404, não é imagem, endereço interno) apaga o registro, e o produto cai na busca automática abaixo.
   * Devolve true se parou porque o serviço pediu calma.
   */
  async function baixarLinksPendentes(resumo: ResumoDaBusca): Promise<boolean> {
    for (;;) {
      const lista = await repo.listarFotosParaBaixar(lote);
      if (lista.length === 0) return false;
      for (const { codigoBarras, url } of lista) {
        let imagem: string;
        try {
          imagem = await baixador(url);
        } catch (e) {
          if (e instanceof ErroTemporario) {
            log(`Fotos: ${e.message}; o que falta fica para depois.`);
            return true;
          }
          if (e instanceof ImagemInvalida) {
            log(`Fotos: o link da foto de ${codigoBarras} não serve (${e.message}); procurando em outro lugar.`);
            await repo.removerFoto(codigoBarras);
            continue;
          }
          throw e;
        }
        // Se, enquanto baixava, um mercado enviou a foto dele (ou o link mudou), não escrevemos por cima.
        const atual = await repo.acharFoto(codigoBarras);
        if (atual && atual.url === url && atual.imagem === null) {
          await repo.salvarFoto({ ...atual, imagem, atualizadaEm: agora() });
          resumo.achadas += 1;
        }
        await esperar(intervaloMs);
      }
    }
  }

  async function processarPendentes(): Promise<ResumoDaBusca> {
    const resumo: ResumoDaBusca = { achadas: 0, naoAchadas: 0, ilustrativas: 0, adiadas: false };
    if (await baixarLinksPendentes(resumo)) {
      resumo.adiadas = true;
      return resumo;
    }
    // Banco ilustrativo desta rodada: as imagens que vão junto do sistema + as que o servidor já achou e guardou no banco de dados.
    const imagensPorTipo = new Map<string, string>(ilustrativas.map((e) => [e.id, e.imagem]));
    for (const c of await repo.listarConfiguracoes(CHAVE_ILUSTRATIVA)) imagensPorTipo.set(c.chave.slice(CHAVE_ILUSTRATIVA.length), c.valor);
    const semAchar = new Map((await repo.listarConfiguracoes(CHAVE_ILUSTRATIVA_SEM)).map((c) => [c.chave.slice(CHAVE_ILUSTRATIVA_SEM.length), Date.parse(c.valor)]));

    /** A imagem ilustrativa do tipo do produto; se o tipo ainda não tem, procura uma agora (uma vez por tipo) e guarda. Lança ErroTemporario se o serviço pediu calma. */
    async function ilustrativaDo(nome: string | null): Promise<string | null> {
      if (!nome) return null;
      if (categorias.length === 0) {
        // Sem a lista de tipos (só as imagens fixas): vale a entrada mais parecida.
        return escolherIlustrativa(nome, ilustrativas)?.imagem ?? null;
      }
      const tipo = escolherIlustrativa(nome, categorias); // primeiro o tipo certo (leite condensado, não leite), com ou sem imagem
      if (!tipo) return null;
      const pronta = imagensPorTipo.get(tipo.id);
      if (pronta) return pronta;
      if (!buscadorPorNome) return null;
      const tentouEm = semAchar.get(tipo.id);
      if (tentouEm !== undefined && agora().getTime() - tentouEm < 7 * DIA_MS) return null; // procurou há pouco e não achou
      const achado = await buscadorPorNome.buscarPorNome(tipo.busca);
      await esperar(intervaloPorNomeMs);
      if (!achado) {
        await repo.salvarConfiguracao(CHAVE_ILUSTRATIVA_SEM + tipo.id, agora().toISOString());
        semAchar.set(tipo.id, agora().getTime());
        return null;
      }
      try {
        const imagem = await baixador(achado.url);
        await repo.salvarConfiguracao(CHAVE_ILUSTRATIVA + tipo.id, imagem);
        imagensPorTipo.set(tipo.id, imagem);
        log(`Fotos: banco ilustrativo ganhou o tipo "${tipo.id}".`);
        return imagem;
      } catch (e) {
        if (e instanceof ImagemInvalida) return null;
        throw e;
      }
    }

    // 2) Produtos sem nenhuma foto: procura pelo código de barras no banco aberto, baixa a imagem e guarda.
    for (;;) {
      const corte = new Date(agora().getTime() - tentarDeNovoAposDias * DIA_MS);
      const codigos = await repo.listarCodigosSemFoto(lote, corte);
      if (codigos.length === 0) return resumo;
      for (const codigo of codigos) {
        let url: string | null = null;
        let imagem: string | null = null;
        const nome = await repo.acharNomeDoProduto(codigo);
        try {
          let resultado = await buscador.buscar(codigo);
          if (!resultado && buscadorPorNome && procurarProdutoPorNome) {
            if (nome) {
              resultado = await buscadorPorNome.buscarPorNome(nome);
              await esperar(intervaloPorNomeMs); // as buscas por nome têm limite por minuto
            }
          }
          if (resultado) {
            url = resultado.url;
            try {
              imagem = await baixador(url);
            } catch (e) {
              if (!(e instanceof ImagemInvalida)) throw e;
              url = null; // achou o produto mas a imagem não presta: vale como "sem foto"
            }
          }
        } catch (e) {
          if (e instanceof ErroTemporario) {
            log(`Fotos: ${e.message}; o que falta fica para depois.`);
            resumo.adiadas = true;
            return resumo;
          }
          throw e;
        }
        // Se, enquanto procurávamos, um mercado enviou uma foto, a dele vale: não escrevemos por cima.
        const atual = await repo.acharFoto(codigo);
        const ehIlustrativa = atual?.origem === 'ilustrativa';
        if (!atual || (atual.url === null && atual.imagem === null) || ehIlustrativa) {
          if (url) {
            // Achou a foto específica: ela passa na frente da ilustrativa, se havia.
            await repo.salvarFoto({ codigoBarras: codigo, origem: 'openfoodfacts', url, imagem, mercadoId: null, atualizadaEm: agora() });
            resumo.achadas += 1;
          } else if (ehIlustrativa) {
            // Continua sem a específica: mantém a ilustrativa e só adia a próxima procura.
            await repo.salvarFoto({ ...atual, atualizadaEm: agora() });
          } else {
            // Nenhuma foto específica: usa a do TIPO de produto (ilustrativa), se houver; senão, "procurou e não achou".
            let imagemDoTipo: string | null = null;
            try {
              imagemDoTipo = await ilustrativaDo(nome);
            } catch (e) {
              if (e instanceof ErroTemporario) {
                log(`Fotos: ${e.message}; o que falta fica para depois.`);
                resumo.adiadas = true;
                return resumo;
              }
              throw e;
            }
            if (imagemDoTipo) {
              await repo.salvarFoto({ codigoBarras: codigo, origem: 'ilustrativa', url: null, imagem: imagemDoTipo, mercadoId: null, atualizadaEm: agora() });
              resumo.ilustrativas += 1;
            } else {
              await repo.salvarFoto({ codigoBarras: codigo, origem: 'openfoodfacts', url: null, imagem: null, mercadoId: null, atualizadaEm: agora() });
              resumo.naoAchadas += 1;
            }
          }
        }
        await esperar(intervaloMs);
      }
    }
  }

  function agendarPendentes(): void {
    if (rodando) {
      olharDeNovo = true;
      return;
    }
    rodando = true;
    void (async () => {
      try {
        do {
          olharDeNovo = false;
          const r = await processarPendentes();
          if (r.achadas + r.naoAchadas + r.ilustrativas > 0) log(`Fotos: ${r.achadas} achadas, ${r.ilustrativas} ilustrativas, ${r.naoAchadas} sem foto.`);
          if (r.adiadas) {
            // Não insiste agora (o serviço pediu calma), mas volta sozinho mais tarde: assim tudo acaba preenchido sem ninguém lembrar.
            agendarDepois(agendarPendentes, reagendarAposMs);
            break;
          }
        } while (olharDeNovo);
      } catch (e) {
        log(`Fotos: erro inesperado (${e instanceof Error ? e.message : String(e)}).`);
      } finally {
        rodando = false;
      }
    })();
  }

  return { agendarPendentes, processarPendentes };
}
