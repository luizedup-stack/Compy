# Dados de teste (inventados)

Tudo aqui é **inventado**: mercados, endereços, marcas, preços e códigos de barras. Os códigos têm o formato e o dígito verificador corretos, mas não pertencem a produtos reais. Não use para nada além de testar.

Só "Fox", "X" e "Neve" (papel higiênico) vieram da conversa; as outras marcas são fictícias.

## Mercados (cadastro do estabelecimento: nome e endereço)

| Planilha | Nome do mercado | Endereço (inventado) |
|---|---|---|
| `mercado-1-bom-preco.xlsx` | Mercado Bom Preço | Rua dos Ipês, 120 – Vila Sônia, São Paulo – SP |
| `mercado-2-estrela-da-vila.xlsx` | Supermercado Estrela da Vila | Av. das Acácias, 850 – Vila Sônia, São Paulo – SP |
| `mercado-3-emporio-sonia.xlsx` | Empório Sonia | Rua das Hortênsias, 33 – Vila Sônia, São Paulo – SP |
| `mercado-4-atacarejo-economico.xlsx` | Atacarejo Econômico | Rua Jacarandá, 410 – Vila Sônia, São Paulo – SP |

## Planilhas

Cada uma é uma planilha só, com tudo dentro, como o formato do documento de design:

- Aba `Mercado`: `Nome do mercado*` e `Endereço*`.
- Aba `Produtos`: `Código de barras*`, `Produto*`, `Preço*`, `Quantidade`, `Categoria`, `Disponível` (26 a 29 produtos por mercado, de um catálogo de 34). O código de barras está gravado como texto.

## Casos de teste embutidos de propósito

- **Mesmo produto, mesmo código, nomes diferentes:** o mercado 2 abrevia ("Papel Hig. X", "Det. Líq."), o mercado 3 escreve em MAIÚSCULAS e sem acento ("PAPEL HIGIENICO FOX").
- **Quantidade escrita de jeitos diferentes:** `12 rolos`, `12rolos`, `12 ROLOS`, `1,5 L`, `12 x 1 L`, `3 un`.
- **Produtos sem quantidade** (de 1 a 3 por mercado), para testar o aviso e a ordenação.
- **Produtos que só alguns mercados têm.** Papel higiênico: Fox em 2 mercados, X em 2, Neve em 3. Cada código aparece em 2 a 4 mercados.
- **Produto marcado como indisponível:** no Empório Sonia, o óleo de soja tem `Disponível` = `não` e não deve aparecer no app.
- **Preços diferentes** entre mercados (o atacarejo tende a ser mais barato, o empório mais caro).
- **Pacotes de tamanhos diferentes do mesmo produto:** Fox com 12 rolos e com 4 rolos, leite de 1 L e caixa de 12 x 1 L.

Não há planilha com linhas erradas (sem código, preço inválido). Fica para quando o importador existir.
