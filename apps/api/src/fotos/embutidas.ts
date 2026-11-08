// Fotos ilustrativas EMBUTIDAS: a foto do tipo do produto, tirada direto do banco de fotos que vai junto do sistema
// (apps/api/dados/fotos-ilustrativas/), na hora de responder. Assim a foto ilustrativa aparece mesmo que o gerenciador de fotos
// (que procura e guarda no banco de dados, em segundo plano) ainda não tenha rodado, ou que o serviço de busca esteja fora do ar.
// A foto guardada no banco (específica, enviada pelo mercado, ou ilustrativa que o servidor achou) sempre vale mais que esta.
import { carregarBancoIlustrativo, carregarCategorias, escolherIlustrativa, type Categoria, type EntradaIlustrativa } from './ilustrativas';

export interface FotosEmbutidas {
  /** A imagem ("data:image/jpeg;base64,...") do tipo do produto, ou null se o nome não é de nenhum tipo que tenha foto no sistema. */
  imagemDoNome(nome: string): string | null;
}

/** Monta a consulta com o banco do sistema (ou com o que for passado, nos testes). */
export function criarFotosEmbutidas(
  ilustrativas: EntradaIlustrativa[] = carregarBancoIlustrativo(),
  categorias: Categoria[] = carregarCategorias(),
): FotosEmbutidas {
  const imagemPorTipo = new Map(ilustrativas.map((e) => [e.id, e.imagem]));
  const lembrados = new Map<string, string | null>(); // o mesmo nome aparece em toda busca: a conta é feita uma vez
  return {
    imagemDoNome(nome) {
      const lembrado = lembrados.get(nome);
      if (lembrado !== undefined) return lembrado;
      const imagem = escolher(nome);
      lembrados.set(nome, imagem);
      return imagem;
    },
  };

  function escolher(nome: string): string | null {
    // Com a lista de tipos: primeiro o tipo certo (leite condensado, não leite), depois vale a imagem dele, se existir.
    if (categorias.length > 0) {
      const tipo = escolherIlustrativa(nome, categorias);
      return tipo ? (imagemPorTipo.get(tipo.id) ?? null) : null;
    }
    return escolherIlustrativa(nome, ilustrativas)?.imagem ?? null;
  }
}
