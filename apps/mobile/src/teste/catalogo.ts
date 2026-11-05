import { normalizarTexto, type Catalogo, type OfertaCatalogo } from '@mercado/shared';

/** Oferta de teste: papel higiênico de 12 rolos por padrão, atualizada há 1 dia. */
export function ofertaCatalogo(parcial: Partial<OfertaCatalogo> & Pick<OfertaCatalogo, 'mercadoId'>): OfertaCatalogo {
  const nome = parcial.nome ?? 'Papel Higiênico Fox Folha Dupla';
  return {
    codigoBarras: '7890070035629',
    nome,
    nomeNorm: normalizarTexto(nome),
    preco: 14.7,
    quantidadeTexto: '12 rolos',
    quantidadeValor: 12,
    quantidadeUnidade: 'rolo',
    precoAtualizadoEm: new Date(Date.now() - 86_400_000).toISOString(),
    ...parcial,
  };
}

/** Dois mercados, dois produtos: dá para buscar "papel", listar mercados e ver os produtos de cada um. */
export function catalogoDeTeste(): Catalogo {
  return {
    geradoEm: new Date().toISOString(),
    mercados: [
      { id: 2, nome: 'Supermercado Estrela da Vila', endereco: 'Av. das Acácias, 850' },
      { id: 4, nome: 'Atacarejo Econômico', endereco: 'Rua Jacarandá, 410' },
    ],
    ofertas: [
      ofertaCatalogo({ mercadoId: 4, preco: 14.7 }),
      ofertaCatalogo({ mercadoId: 2, preco: 18.5, nome: 'Papel Hig. Fox Folha Dupla' }),
      ofertaCatalogo({
        mercadoId: 4,
        codigoBarras: '7891000100103',
        nome: 'Leite Integral 1 L',
        preco: 5.5,
        quantidadeTexto: '1 L',
        quantidadeValor: 1,
        quantidadeUnidade: 'L',
      }),
    ],
  };
}
