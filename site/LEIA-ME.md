# Site do Bolso Certo

Uma página só (`index.html`), feita só com HTML e CSS: **não precisa de nenhum programa, banco de dados ou serviço pago**. Os preços que aparecem
nas telas do site são **exemplos inventados**.

## Ver no seu computador
Dê dois cliques em `site/index.html`: ele abre no navegador.

## Mudar textos
Abra `index.html` no Bloco de Notas e troque o texto que está entre as tags. No começo do arquivo há um comentário explicando onde ficam os links e as cores.
Se você mudar o valor da promoção na administração, troque também o **R$ 5** do site (procure por `preco-promocao`).

## Colocar na internet (de graça, para sempre) — só com a sua autorização
Já existe uma rotina pronta (`.github/workflows/publicar-site.yml`) que publica esta pasta sozinha, toda vez que ela mudar no ramo `main`.
Falta ligar uma vez, de graça, no site do GitHub:
1. No repositório `luizedup-stack/bolso-certo`, abra **Settings > Pages**.
2. Em **Build and deployment > Source**, escolha **GitHub Actions** (não "Deploy from a branch"). Salvar.
3. Abra a aba **Actions > Publicar site > Run workflow** uma vez (ou espere o próximo envio ao `main`).
4. Em 1 a 2 minutos o site fica em `https://luizedup-stack.github.io/bolso-certo/`.

Não há custo: o GitHub Pages e o GitHub Actions são grátis para repositórios públicos, sem limite de tempo. Eu **não ligo** essa opção
sozinho (é uma configuração da sua conta): isso é com a sua autorização, no passo 2 acima.
