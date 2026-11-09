# Bolso Certo

O Bolso Certo é um jeito de **comparar os preços dos supermercados antes de sair de casa**. Os mercados da região enviam uma planilha com seus produtos e preços, e o cliente, no celular, busca um produto (por exemplo, "papel higiênico") e vê onde está mais barato, inclusive o preço por rolo, por quilo ou por litro, para a comparação ser justa.

O piloto é na **Vila Sônia, em São Paulo**, com poucos mercados.

> **Situação hoje:** tudo funciona de ponta a ponta, ainda **em modo de teste**. Os dados podem ficar num **banco SQL Server** (Azure SQL gratuito) com o servidor hospedado de graça no Render: veja [`docs/HOSPEDAGEM.md`](docs/HOSPEDAGEM.md). Sem banco configurado (testes no computador), os dados ficam só na memória e **somem quando a API é desligada**. Veja "O que falta antes de publicar" no fim deste arquivo.

## As três partes

> Para se achar no código, veja o [guia do código](docs/GUIA-DO-CODIGO.md).

| Parte | O que é | Quem usa | Pasta |
|---|---|---|---|
| **API** | O servidor: guarda os preços, faz o login, a busca e a comparação. | (as outras duas partes conversam com ela) | `apps/api` |
| **Bolso Certo - Mercado** (painel) | O software do mercado: o mercado **se cadastra sozinho**, cadastra produtos e preços (à mão ou por planilha) e só vê o que é dele. O desenvolvedor (administrador) vê todos. | Mercado e desenvolvedor | `apps/painel` (dentro do programa de Windows, `apps/desktop`) |
| **App de celular** | O aplicativo em que o cliente busca e compara preços. É só para ver: não edita nada. | Cliente | `apps/mobile` |

Há também a pasta `packages/shared` (regras usadas pelas três partes, como ler a quantidade e calcular o preço por unidade) e a pasta **`marca/`**, que guarda o **logo** e o ícone do Bolso Certo (arquivos `.svg`).

## Banco de dados e hospedagem (grátis)

A API guarda tudo num **banco SQL Server** quando a variável `BANCO_URL` está definida (o mesmo que você abre no SSMS), e o servidor
inteiro (API + painel) pode rodar de graça no Render. Assim o programa de Windows e o app do celular usam o mesmo servidor e os mesmos dados,
de qualquer lugar.

- **Passo a passo para colocar no ar (Azure SQL gratuito + Render gratuito):** [`docs/HOSPEDAGEM.md`](docs/HOSPEDAGEM.md)
- **O que tem dentro do banco, consultas para o SSMS, como mudar a estrutura e como testar:** [`docs/BANCO.md`](docs/BANCO.md)
- Sem `BANCO_URL`, tudo continua funcionando como antes (memória), inclusive o programa de Windows no modo local.

## Como o app funciona para o cliente

- **Sem login:** buscar produtos, comparar preços e ver os mercados é público; criar conta ou entrar é opcional, pela aba **Conta**.
- **Fotos dos produtos:** cada produto tem uma foto, ligada ao **código de barras** (a mesma para todos os mercados que o vendem), **guardada no banco**. Ela vem, em ordem, do dono do mercado
  (painel: **Produtos → Enviar foto**), do link da coluna **Foto** da planilha (o servidor baixa e guarda) ou do [Open Food Facts](https://world.openfoodfacts.org), procurado sozinho
  (banco aberto com fotos CC BY-SA; o app mostra o crédito; em um teste com marcas populares, metade tinha foto). As ferramentas de coleta (`ferramentas/coleta/`) já trazem o link da foto dos sites das redes. Se nada achar, o produto recebe a **foto ilustrativa do tipo** (marcada como tal), de um banco que vai junto do sistema (`apps/api/dados/fotos-ilustrativas/`).
  `npm run fotos -w @mercado/api` procura de uma vez as fotos que faltam. Passo a passo em `docs/HOSPEDAGEM.md`.
- **Como chegar:** ao tocar numa oferta, o app pergunta se você quer ir até o mercado e abre o **Google Maps** ou o **Waze** com o endereço dele.

## Como instalar

Você precisa do [Node.js](https://nodejs.org) instalado. Depois, na pasta do projeto:

```
npm install
```

Isso baixa tudo de que as três partes precisam. Só é preciso fazer uma vez (e de novo se o projeto receber novas peças).

## Jeito rápido de testar (Windows)

Depois do `npm install`, no PowerShell, na pasta do projeto:

```
.\iniciar-teste.ps1
```

Isso abre três janelas (API, painel e app), descobre sozinho o endereço do computador na rede e já carrega os **preços reais de teste** (Atacadão e Carrefour, pasta `dados-reais/`). Opções: `-Dados inventados` (os 4 mercados inventados) ou `-Dados todos` (os dois grupos).

- **Painel:** `http://localhost:5173`. A primeira aba é **Produtos**: lista todos os itens, com busca por nome ou código de barras, e cada um pode ser corrigido à mão (nome, preço, quantidade, categoria, disponível) ou removido. O administrador escolhe de qual mercado quer ver os produtos no seletor "Mercado". Para subir uma planilha Excel, use a aba **Enviar planilha**. Administrador de teste: `admin@bolsocerto.local` / `BolsoCerto-Teste-2026` (senha só para teste local).
- **Celular Android:** o app usa o Expo SDK 58, e o Expo Go da loja pode estar numa versão mais antiga. Se o app não abrir, instale o Expo Go do SDK 58 em https://expo.dev/go (escolha SDK 58 e Android). **iPhone:** o Expo Go da App Store só vai até o SDK 54 e não abre este app (ver `apps/mobile/README.md`).
- **Celular:** instale o **Expo Go**, conecte o celular na mesma rede Wi-Fi do computador e leia o QR code da janela "App". Se o Windows perguntar sobre o firewall, permita em "Redes privadas".
- **Cadastro no app:** o código de confirmação do e-mail aparece na janela "API", na linha `[e-mail]`.
- Os dados somem quando você fecha as janelas (ainda não há banco de dados).

Se o PowerShell reclamar de "execução de scripts desabilitada", rode antes: `Set-ExecutionPolicy -Scope Process Bypass`.

## Programa de computador (.exe) e aplicativo de celular (.apk)

Para usar **sem abrir terminal e sem internet**, há um programa de Windows com a API e o painel dentro dele (Electron). Ele já abre com as planilhas reais de teste carregadas.

- **Gerar o programa:** `npm run construir:exe`. O resultado fica em `programa/Bolso Certo - Mercado-win32-x64/Bolso Certo - Mercado.exe` (e a cópia compactada, `programa/Bolso-Certo-Mercado-Windows.zip`, para enviar a outra pessoa; descompacte e abra o `.exe`). Essa pasta não vai para o git.
- **Usar:** abra o `Bolso Certo - Mercado.exe`. O painel aparece na janela. **Mercado novo:** toque em "Cadastrar meu mercado" na tela de entrar (nome, endereço, e-mail e senha) e confirme o e-mail com o código. **Desenvolvedor (vê todos os mercados):** e-mail `admin@bolsocerto.local`; a senha é **gerada na primeira abertura** e fica no menu **Bolso Certo → Códigos de e-mail e endereço do celular** (e no arquivo `senha-desenvolvedor.txt` da pasta de dados do programa). Não está escrita no código. No menu **Bolso Certo → Códigos de e-mail e endereço do celular** ficam os códigos de confirmação de conta e o endereço da API para o celular (por exemplo `http://192.168.0.10:3000`).
- **Celular:** o app guarda uma cópia de todos os mercados e produtos e **funciona sem internet e com o programa fechado** (busca, mercados e produtos). Com o servidor respondendo, ele usa o servidor e renova a cópia. Instale `apk/bolso-certo.apk` (veja `apps/mobile/README.md`, seção "Gerar o APK") e, na tela de entrada, use **Configurar servidor** com o endereço mostrado no programa. O celular precisa estar na mesma rede do computador.
- A API do programa usa sempre a porta **3000**; não deixe o `npm run testar` aberto ao mesmo tempo.
- Os dados (contas, produtos, correções) são guardados em um arquivo no computador (`%APPDATA%Bolso Certo - Mercadosalvos`) e voltam quando o programa abre de novo; quem já entrou no app continua entrando. É um quebra-galho até existir o banco de dados. Para recomeçar do zero: menu **Bolso Certo → Apagar os dados salvos e recomeçar**. O programa não é assinado digitalmente, então o Windows pode mostrar o aviso "O Windows protegeu o computador": clique em "Mais informações" e "Executar assim mesmo".
- **Acesso pela internet (temporário):** menu **Bolso Certo → Acesso pela internet (túnel)…** liga um túnel da Cloudflare (programa `cloudflared`, instalado com `winget install --id Cloudflare.cloudflared`) e mostra um endereço `https://….trycloudflare.com` para a pessoa digitar em **Configurar servidor** no aplicativo. O endereço **muda toda vez** que o túnel é ligado e só funciona com o computador e o programa ligados. É para testes: o caminho definitivo é hospedar o servidor.
- **Modo nuvem:** no menu **Bolso Certo → Servidor na nuvem…** o programa passa a abrir o painel do servidor hospedado (e a usar o banco dele) em vez de ligar a API dentro do computador. Para gerar o programa já apontando para a nuvem: `$env:BOLSO_URL_NUVEM = "https://seu-servidor.onrender.com"` antes de `npm run construir:exe`. Veja [`docs/HOSPEDAGEM.md`](docs/HOSPEDAGEM.md).
- `npm run gerar-icones` refaz os ícones (programa e app) a partir de `marca/icone-bolso-certo.svg`.

## Como rodar cada parte (manual)

Abra **um terminal para cada parte**, sempre na pasta do projeto, e deixe cada um aberto enquanto estiver testando.

### 1. A API (primeiro)

```
npm run dev -w @mercado/api
```

- Ela sobe em `http://localhost:3000`.
- Já carrega sozinha os **4 mercados inventados** da pasta `dados-de-teste/` (Mercado Bom Preço, Supermercado Estrela da Vila, Empório Sonia e Atacarejo Econômico). Todos os nomes, endereços, códigos de barras e preços são inventados.
- Mostra no terminal o **login do administrador de teste**: `admin@bolsocerto.local` e uma senha nova a cada vez que a API liga. Anote-a, pois ela aparece uma única vez.
- Os e-mails que o sistema "envia" (como o código para confirmar o e-mail do cliente) **não são enviados de verdade**: aparecem escritos neste mesmo terminal, com a linha `[e-mail]`.

### 2. O painel web

```
npm run dev -w @mercado/painel
```

Abra o endereço que aparece no terminal (normalmente `http://localhost:5173`) no navegador.

### 3. O app de celular

Os passos completos estão em [`apps/mobile/README.md`](apps/mobile/README.md). Em resumo:

1. Instale o aplicativo **Expo Go** no celular. O celular e o computador precisam estar na **mesma rede Wi-Fi**.
2. Descubra o endereço do computador na rede (no Windows: `ipconfig`, procure o "Endereço IPv4", por exemplo `192.168.0.10`).
3. Com a API rodando, inicie o app dizendo onde a API está (no PowerShell):

   ```
   $env:EXPO_PUBLIC_API_URL = "http://192.168.0.10:3000"
   npm run start -w @mercado/mobile
   ```

4. Leia o QR code que aparece no terminal com o Expo Go.

O endereço precisa ser o do computador (não use `localhost` no celular, porque lá `localhost` é o próprio celular).

## Roteiro de teste (para ver tudo funcionando)

Com a API e o painel rodando, siga na ordem. As planilhas de teste estão em `dados-de-teste/`.

**1. Como administrador**

1. No painel, entre com `admin@bolsocerto.local` e a senha que apareceu no terminal da API.
2. Em **Enviar planilha**, envie uma das planilhas de `dados-de-teste/` (por exemplo `mercado-1-bom-preco.xlsx`). O painel mostra quantos produtos entraram e quais linhas tiveram problema. Como a API já carregou as 4 planilhas ao ligar, isso só atualiza os preços.
3. Em **Administração**, escolha o "Mercado Bom Preço" e use **Criar acesso**, informando um e-mail (pode ser inventado, como `bompreco@exemplo.com`). O painel mostra uma **senha temporária**: copie, pois ela aparece uma só vez.
4. Clique em **Sair**.

**2. Como mercado**

1. Entre com o e-mail e a senha temporária do passo anterior.
2. Em **Produtos**, ache na lista o "Papel Higiênico Neve Folha Dupla" (preço da planilha: R$ 15,49), use **Editar** e mude o preço (por exemplo, para 13,20). O novo preço aparece na lista.
3. Em **Enviar planilha**, envie de novo `mercado-1-bom-preco.xlsx`. O preço **volta a R$ 15,49**: a planilha sempre vence a correção feita à mão.
4. Se esquecer a senha, use **Esqueci minha senha** na tela de entrar do painel. Enquanto os e-mails só vão para o log da API, quem cuida do sistema lê o código no terminal da API, na linha do `[e-mail]`.
5. Para testar um produto indisponível, abra a planilha no Excel, escreva `não` na coluna **Disponível** de uma linha, salve uma cópia e envie. Esse produto deixa de aparecer para os clientes. (Na planilha do Empório Sonia, o óleo de soja já vem assim.)

**3. Como cliente (no app)**

1. Toque em Criar conta, marque a caixa de aceite da política e informe e-mail e senha (com pelo menos 8 caracteres).
2. O **código de confirmação** aparece no terminal da API, na linha do `[e-mail]`. Copie e cole no app.
3. Na aba **Buscar**, procure `papel higienico`. Você verá o papel Fox (12 e 4 rolos), o X e o Neve, com o preço de cada mercado e o preço por rolo, do mais barato ao mais caro. O produto sem quantidade informada aparece com o aviso "sem quantidade informada".
4. Na aba **Mercados**, veja os mercados e toque em um para ver os produtos dele.
5. Na aba **Conta**, é possível ler a política de privacidade e **excluir a conta**. As buscas feitas ficam guardadas, mas sem ligação com você.

Para voltar ao começo, basta desligar a API (`Ctrl + C` no terminal) e ligá-la de novo.

## Como rodar os testes

Na pasta do projeto:

```
npm test
```

Isso roda os testes das cinco partes (pacote compartilhado, API, painel, app e programa de computador). Os testes do **banco SQL Server** só rodam se você informar um banco de testes vazio em `BANCO_TESTE_URL` (veja [`docs/BANCO.md`](docs/BANCO.md)); sem isso eles são pulados. Um deles, em `apps/api/src/fimafim.test.ts`, é um **roteiro completo**: envia as 4 planilhas, cria o acesso de um mercado, corrige e reenvia preços, cadastra um cliente, busca papel higiênico, remove um mercado e exclui a conta, tudo contra a API (sem abrir porta), com os dados na memória.

## Onde estão os documentos do projeto

- **Documento de design** (o que o Bolso Certo é e as decisões tomadas): `docs/superpowers/specs/2026-11-04-comparador-de-precos-design.md`
- **Plano de construção** (as tarefas, uma a uma): `docs/superpowers/plans/2026-11-04-comparador-de-precos.md`
- **Dados de teste e o que cada planilha testa**: `dados-de-teste/LEIA-ME.md`
- Detalhes técnicos: `apps/api/README.md` (API) e `apps/mobile/README.md` (app).
- **Colocar no ar com banco de dados, de graça:** `docs/HOSPEDAGEM.md`. **O banco por dentro:** `docs/BANCO.md`.

## O que falta antes de publicar

Hoje o Bolso Certo serve para **testar e mostrar**, não para o público usar. Faltam:

- [x] **Banco de dados de verdade.** Feito: SQL Server / Azure SQL (`docs/BANCO.md`). Com `BANCO_URL` os dados sobrevivem a reinícios e as sessões continuam valendo. Falta: rotina de backup além da que o Azure faz sozinho e um plano de crescimento (a oferta gratuita é limitada).
- [ ] **Envio de e-mail de verdade.** Hoje os e-mails só são escritos no terminal da API. É preciso contratar um provedor de e-mail para o cliente receber o código de confirmação e de recuperação de senha.
- [ ] **Texto da política de privacidade revisado** por alguém qualificado (por exemplo, um advogado). O texto atual (`/privacidade` na API) é um rascunho, e o contato ainda está "a definir".
- [~] **HTTPS e hospedagem.** Para o piloto de teste, está resolvido de graça: Render (HTTPS) + Azure SQL, com `render.yaml` e o passo a passo em `docs/HOSPEDAGEM.md`. Para o público ainda é preciso: domínio próprio, plano que não durma, e decidir o provedor definitivo. Variáveis do servidor (já preenchidas pelo `render.yaml`, exceto as secretas):

  ```
  NODE_ENV=production
  BANCO_URL=<texto de conexão do banco>
  JWT_SECRET=<frase longa e secreta, mínimo 32 caracteres>
  ADMIN_EMAIL=<seu e-mail>
  ADMIN_SENHA=<senha forte, mínimo 8 caracteres>
  PERMITIR_EMAIL_NO_LOG=1
  CONFIAR_PROXY=1
  ```

  Em produção a API **não liga** se faltar alguma dessas variáveis (o `BANCO_URL` só pode faltar com `PERMITIR_SEM_BANCO=1`, para um teste descartável), e não carrega os dados de teste (a menos que `CARREGAR_DADOS_DE_TESTE=1`, e então só com o banco vazio). Nunca guarde esses valores em arquivos do projeto.
- [ ] **E-mail em produção sem provedor.** Enquanto não houver provedor de e-mail, a API só liga em produção com `$env:PERMITIR_EMAIL_NO_LOG="1"`, sabendo que os códigos de confirmação e de redefinição de senha (inclusive do administrador) aparecem no log do servidor: quem lê o log consegue redefinir qualquer senha.
- [ ] **Limites de requisições.** Já existem (login e demais rotas de conta: 20 por minuto por endereço; busca: 60 por minuto), mas os números precisam ser ajustados com o uso real.
- [ ] **CORS aberto.** Hoje a API aceita chamadas de qualquer origem (`origin: true`). Ao hospedar, restrinja ao endereço do painel.
- [~] **Endereço da API nos clientes.** Na hospedagem do `render.yaml` o painel é entregue pela própria API (mesmo endereço), e o programa de Windows e o app trocam o endereço sem recompilar (menu "Servidor na nuvem…" e "Configurar servidor"). Para um APK que já nasça apontando para o servidor, use `EXPO_PUBLIC_API_URL` com `https://`; as versões de produção bloqueiam `http://`.
- [x] **Instalação na hospedagem.** O `tsx` agora é dependência normal da API, e o `render.yaml` instala só o necessário.
- [ ] **Log do servidor.** Guarda o endereço de quem acessa e as rotas (sem o texto das buscas). Defina por quanto tempo esse log fica guardado.
- [ ] **Sessões depois de trocar a senha.** Redefinir a senha **não** derruba os logins já emitidos (lacuna conhecida), nem invalida outros códigos ainda pendentes.
- [x] **Reinício da API.** Com banco, os dados e as sessões sobrevivem ao reinício (a identificação da sessão fica guardada no banco). Sem banco (memória), continua valendo: depois de reiniciar, todos entram de novo e os dados se perdem.
- [x] **Métrica do piloto.** No banco, cada busca tem data e hora (`Buscas.feitaEm`); consultas prontas em `docs/BANCO.md`. (Na versão em memória o registro continua sem data.)
- [ ] **Ícone do app e contas nas lojas.** Gerar o ícone em PNG a partir de `marca/icone-bolso-certo.svg`; preencher `scheme`, `android.package` e `ios.bundleIdentifier` em `apps/mobile/app.json`; e abrir as contas de desenvolvedor do **Google Play** e da **App Store** (pagas, com revisão).
- [ ] **Conferir o nome "Bolso Certo"**: registro no INPI, disponibilidade no Google Play e na App Store, e se há domínio livre.
- [ ] **Decisões de produto ainda em aberto** (seção 12 do documento de design): o valor e a forma da cobrança futura dos mercados, se a lista de compras com total fica para a versão 2, e como medir se o piloto deu certo (a sugestão é pelo menos 3 mercados com algumas centenas de produtos cada).
