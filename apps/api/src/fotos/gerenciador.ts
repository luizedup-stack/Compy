// Procura sozinho a foto dos produtos que ainda não têm, sem sobrecarregar o serviço de onde ela vem: uma consulta por vez,
// com uma pausa entre elas. O que foi achado (ou "procurado e não achado") fica gravado no banco, então cada produto só é
// consultado uma vez; os "não achados" são procurados de novo depois de alguns dias (alguém pode ter cadastrado a foto).
import type { Repositorio } from '../repositorio';
import { baixarFoto, ImagemInvalida } from './baixar';
import { ErroTemporario, type BuscadorDeFotos } from './openFoodFacts';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface ResumoDaBusca {
  achadas: number;
  naoAchadas: number;
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
    const resumo: ResumoDaBusca = { achadas: 0, naoAchadas: 0, adiadas: false };
    if (await baixarLinksPendentes(resumo)) {
      resumo.adiadas = true;
      return resumo;
    }
    // 2) Produtos sem nenhuma foto: procura pelo código de barras no banco aberto, baixa a imagem e guarda.
    for (;;) {
      const corte = new Date(agora().getTime() - tentarDeNovoAposDias * DIA_MS);
      const codigos = await repo.listarCodigosSemFoto(lote, corte);
      if (codigos.length === 0) return resumo;
      for (const codigo of codigos) {
        let url: string | null = null;
        let imagem: string | null = null;
        try {
          const resultado = await buscador.buscar(codigo);
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
        if (!atual || (atual.url === null && atual.imagem === null)) {
          await repo.salvarFoto({ codigoBarras: codigo, origem: 'openfoodfacts', url, imagem, mercadoId: null, atualizadaEm: agora() });
          if (url) resumo.achadas += 1;
          else resumo.naoAchadas += 1;
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
          if (r.achadas + r.naoAchadas > 0) log(`Fotos: ${r.achadas} achadas, ${r.naoAchadas} sem foto no banco aberto.`);
          if (r.adiadas) break; // não insiste agora: o serviço pediu calma
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
