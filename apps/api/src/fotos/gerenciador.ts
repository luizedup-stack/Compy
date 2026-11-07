// Procura sozinho a foto dos produtos que ainda não têm, sem sobrecarregar o serviço de onde ela vem: uma consulta por vez,
// com uma pausa entre elas. O que foi achado (ou "procurado e não achado") fica gravado no banco, então cada produto só é
// consultado uma vez; os "não achados" são procurados de novo depois de alguns dias (alguém pode ter cadastrado a foto).
import type { Repositorio } from '../repositorio';
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
  intervaloMs = 700,
  lote = 100,
  tentarDeNovoAposDias = 30,
  agora = () => new Date(),
  esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => undefined,
}: OpcoesGerenciador): GerenciadorDeFotos {
  let rodando = false;
  let olharDeNovo = false;

  async function processarPendentes(): Promise<ResumoDaBusca> {
    const resumo: ResumoDaBusca = { achadas: 0, naoAchadas: 0, adiadas: false };
    for (;;) {
      const corte = new Date(agora().getTime() - tentarDeNovoAposDias * DIA_MS);
      const codigos = await repo.listarCodigosSemFoto(lote, corte);
      if (codigos.length === 0) return resumo;
      for (const codigo of codigos) {
        let resultado;
        try {
          resultado = await buscador.buscar(codigo);
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
          await repo.salvarFoto({
            codigoBarras: codigo,
            origem: 'openfoodfacts',
            url: resultado?.url ?? null,
            imagem: null,
            mercadoId: null,
            atualizadaEm: agora(),
          });
          if (resultado) resumo.achadas += 1;
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
