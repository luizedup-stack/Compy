# Dados reais de teste (coletados em 09/11/2026)

Preços e códigos de barras copiados dos **catálogos públicos** dos sites das redes, só para testar o Bolso Certo. Não são dados oficiais das redes e **não têm autorização delas**. Não publique nem use fora dos testes.

| Planilha(s) | Fonte | Produtos |
|---|---|---|
| `mercado-mambo-parte-01..04.xlsx` | mambo.com.br | 14.258 |
| `mercado-savegnago-parte-01..03.xlsx` | savegnago.com.br | 11.183 |
| `mercado-covabra-parte-01..03.xlsx` | covabra.com.br | 12.645 |
| `mercado-atacadao.xlsx` | atacadao.com.br | 4.127 |
| `mercado-samsclub.xlsx` | samsclub.com.br | 3.742 |
| `mercado-oba.xlsx` | obahortifruti.com.br | 2.905 |
| `mercado-hortifruti.xlsx` | hortifruti.com.br (Hortifruti Natural da Terra) | 2.437 |
| `mercado-carrefour.xlsx` | mercado.carrefour.com.br (páginas de produto, via sitemap) | ~790 (parcial: o site é lento de coletar) |

Total: cerca de **52 mil ofertas** em 8 redes, ~34 mil produtos diferentes. Na primeira página do app todos os produtos já aparecem comparados (de 6 a 8 mercados cada).
Redes grandes vêm em várias planilhas (`-parte-NN`) porque o importador aceita no máximo 5.000 linhas e 5 MB por arquivo; todas têm a mesma aba `Mercado`, então o programa junta as partes num mercado só.

## Limites que você precisa saber

- **Preço do site, sem loja escolhida.** O preço pode mudar por loja/região; o endereço da aba `Mercado` é só um texto explicando isso, não é uma loja real.
- **Não é o catálogo inteiro de cada rede**, só o que o site mostra com código de barras válido e em estoque no momento da coleta.
- **Não coletados:** Assaí (bloqueia robôs com proteção anti-bot), Pão de Açúcar/Extra/Tenda/Sonda e outras (sem catálogo público), Max Atacadista (só encartes). Zaffari, Bistek e Giassi têm catálogo, mas são do Sul (o coletor já aceita: `node ferramentas/coleta/coletar-vtex.mjs zaffari`).
- Os dados envelhecem: preços só valem na data da coleta.

## Coleta completa (todos os produtos que o site mostra)

```bash
node ferramentas/coleta/coletar-atacadao-tudo.mjs     # catálogo inteiro, categoria por categoria (~1 h)
node ferramentas/coleta/coletar-carrefour-tudo.mjs    # ~42 mil páginas do sitemap (horas); pode parar e continuar depois
node ferramentas/coleta/gerar-planilhas.mjs           # gera as planilhas, já divididas em partes de até 4.900 produtos
```

Os dois coletores guardam o progresso (`*.progresso.json`): se você interromper, rode de novo que eles continuam. Se o site recusar (erro 403/429), o coletor para e avisa; não tente contornar.
O envio aceita **até 5.000 produtos por planilha**, por isso `gerar-planilhas.mjs` cria `mercado-atacadao-1.xlsx`, `-2.xlsx`... Envie todas as partes do mesmo mercado (a aba `Mercado` é igual): enviar de novo só atualiza e acrescenta.

## Como refazer (coleta resumida, a de antes)

```bash
node ferramentas/coleta/coletar-vtex.mjs --listar          # redes que o coletor conhece
node ferramentas/coleta/coletar-vtex.mjs mambo savegnago   # coleta (leva de 30 min a 2 h por rede; pode interromper e rodar de novo: continua de onde parou)
node ferramentas/coleta/coletar-carrefour.mjs 900          # Carrefour (outro coletor, bem mais lento)
node ferramentas/coleta/gerar-planilhas.mjs                # transforma os .json em planilhas
```

Para coletar de novo do zero, apague o `<rede>.json` e o `<rede>.progresso.json` da rede.
As planilhas têm uma coluna **Foto** com o link da foto de cada produto, que o servidor baixa e guarda.

## Como colocar no programa e no app

- **Programa de Windows:** `node apps/desktop/construir.mjs` copia estas planilhas para dentro do programa. Quem já usa o programa recebe os produtos novos sozinho ao abrir a versão nova (ou pelo menu "Atualizar produtos com as planilhas do programa").
- **App do celular (servidor na nuvem):** o app lê do servidor, então os produtos precisam chegar ao banco da nuvem. Duas formas: enviar cada `.xlsx` pelo painel como administrador, ou rodar `npm run carregar -w @mercado/api -- ..\..\dados-reais` com a variável `BANCO_URL` do seu banco (veja `docs/HOSPEDAGEM.md`). Atenção: 52 mil ofertas ocupam bem mais espaço no banco gratuito do que o piloto antigo.

## Git

As planilhas e os `.json` desta pasta **não vão para o GitHub** (estão no `.gitignore`), porque são dados de terceiros. Eles ficam só no seu computador; para recriar em outra máquina, rode os comandos acima.
