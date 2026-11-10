# Site do Compy

Uma página só (`index.html`), feita só com HTML e CSS: **não precisa de nenhum programa, banco de dados ou serviço pago**. Os preços que aparecem
nas telas do site são **exemplos inventados**.

## O site hospeda o APK (para o tester baixar sempre a versão mais atual)

O botão "Baixar o app" baixa o arquivo `site/bolso-certo.apk` **direto do próprio site** (não do GitHub), para o endereço nunca mudar e sempre
valer o mesmo link. **A cada APK novo, duas coisas** (isso é parte de gerar um APK novo, eu faço sempre):
1. Copiar o arquivo novo por cima de `site/bolso-certo.apk` (o mesmo arquivo que vai para `releases/bolso-certo.apk`).
2. Trocar o número da versão no `<span id="versao-apk">` do `index.html`.

O `.gitignore` tem uma exceção só para `site/*.apk` (senão a regra geral `*.apk` o deixaria de fora do envio ao GitHub).

## Ver no seu computador
Dê dois cliques em `site/index.html`: ele abre no navegador.

## Mudar textos
Abra `index.html` no Bloco de Notas e troque o texto que está entre as tags. No começo do arquivo há um comentário explicando onde ficam os links e as cores.
Se você mudar o valor da promoção na administração, troque também o **R$ 5** do site (procure por `preco-promocao`).

## Colocar na internet (de graça, para sempre) — só com a sua autorização
Já existe uma rotina pronta (`.github/workflows/publicar-site.yml`) que publica esta pasta sozinha, toda vez que ela mudar no ramo `main`.
Faltam duas coisas, de graça, no site do GitHub (a conta é sua; eu não mexo em configurações de conta):

1. **Renomear o repositório para "compy"** (deixa o endereço do site com o nome certo, em vez de "bolso-certo"): no repositório, **Settings > General > Repository name**, troque para `compy` e salve. O GitHub redireciona sozinho quem ainda usa o nome antigo por um tempo.
2. **Ligar o GitHub Pages**: ainda em Settings, agora em **Pages > Build and deployment > Source**, escolha **GitHub Actions** (não "Deploy from a branch"). Salvar.
3. Abra a aba **Actions > Publicar site > Run workflow** uma vez (ou espere o próximo envio ao `main`).
4. Em 1 a 2 minutos o site fica em `https://luizedup-stack.github.io/compy/`. **Antes desses passos, esse endereço dá 404 — é esperado, não é erro.**

Não há custo: o GitHub Pages e o GitHub Actions são grátis para repositórios públicos, sem limite de tempo. Eu **não ligo** essa opção
sozinho (é uma configuração da sua conta): isso é com a sua autorização, no passo 2 acima.
