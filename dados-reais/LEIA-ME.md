# Dados reais de teste (coletados em 05/11/2026)

Preços e códigos de barras copiados de páginas e de uma API **públicas** dos sites das redes, só para testar o Bolso Certo. Não são dados oficiais das redes e **não têm autorização delas**. Não publique nem use fora dos testes.

| Planilha | Fonte | Produtos |
|---|---|---|
| `mercado-atacadao.xlsx` | atacadao.com.br (API pública de catálogo do site) | 1.938 (1.919 aceitos pelo importador; 19 têm código de barras com dígito verificador inválido e são recusados) |
| `mercado-carrefour.xlsx` | mercado.carrefour.com.br (dados estruturados das páginas de produto, via sitemap oficial) | ~600, escolhidos por parecerem com produtos do Atacadão (cerca de 190 coincidem, para dar comparação) |

## Limites que você precisa saber

- **Preço do site, sem loja escolhida.** O preço pode mudar por loja/região; o endereço da aba `Mercado` é só um texto explicando isso, não é uma loja real.
- **Não é "tudo".** Atacadão: ~100 buscas por tipo de produto (mercearia, limpeza, higiene, bebidas…). Carrefour: ~600 entre dezenas de milhares.
- **Assaí e Max Atacadista não foram coletados.** O Assaí bloqueia robôs (proteção anti-bot) e o Max Atacadista só publica encartes (imagens/folhetos), sem catálogo online nem código de barras.
- Os dados envelhecem: preços só valem na data da coleta.

## Como refazer

```bash
node ferramentas/coleta/coletar-atacadao.mjs
node ferramentas/coleta/coletar-carrefour.mjs 900
node ferramentas/coleta/gerar-planilhas.mjs
```

As planilhas têm uma coluna **Foto** com o link da foto de cada produto (do próprio catálogo do site), que o servidor baixa e guarda. Para ter as fotos, refaça a coleta com os comandos acima (os `.json` antigos não têm o link).

Para subir no app, envie cada `.xlsx` pelo painel (como administrador) ou aponte `PASTA_DADOS_DE_TESTE` da API para esta pasta.

## Git

As planilhas e os `.json` desta pasta **não vão para o GitHub** (estão no `.gitignore`), porque são dados de terceiros. Eles ficam só no seu computador; para recriar em outra máquina, rode os comandos acima.
