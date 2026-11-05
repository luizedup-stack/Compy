# Bolso Certo

O Bolso Certo é um jeito de **comparar os preços dos supermercados antes de sair de casa**. Os mercados da região enviam uma planilha com seus produtos e preços, e o cliente, no celular, busca um produto (por exemplo, "papel higiênico") e vê onde está mais barato, inclusive o preço por rolo, por quilo ou por litro, para a comparação ser justa.

O piloto é na **Vila Sônia, em São Paulo**, com poucos mercados.

> **Situação hoje:** tudo funciona de ponta a ponta, mas ainda **em modo de teste**. Os dados ficam só na memória do computador e **somem quando a API é desligada**. Veja "O que falta antes de publicar" no fim deste arquivo.

## As três partes

| Parte | O que é | Quem usa | Pasta |
|---|---|---|---|
| **API** | O servidor: guarda os preços, faz o login, a busca e a comparação. | (as outras duas partes conversam com ela) | `apps/api` |
| **Painel web** | O site em que o mercado envia a planilha e corrige preços, e em que o administrador cria o acesso dos mercados. | Mercado e administrador | `apps/painel` |
| **App de celular** | O aplicativo em que o cliente busca e compara preços. É só para ver: não edita nada. | Cliente | `apps/mobile` |

Há também a pasta `packages/shared` (regras usadas pelas três partes, como ler a quantidade e calcular o preço por unidade) e a pasta **`marca/`**, que guarda o **logo** e o ícone do Bolso Certo (arquivos `.svg`).

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

- **Gerar o programa:** `npm run construir:exe`. O resultado fica em `programa/Bolso Certo-win32-x64/Bolso Certo.exe` (e a cópia compactada, `programa/Bolso-Certo-Windows.zip`, para enviar a outra pessoa; descompacte e abra o `.exe`). Essa pasta não vai para o git.
- **Usar:** abra o `Bolso Certo.exe`. O painel aparece na janela; entre com o administrador de teste (`admin@bolsocerto.local` / `BolsoCerto-Teste-2026`). No menu **Bolso Certo → Códigos de e-mail e endereço do celular** ficam os códigos de confirmação de conta e o endereço da API para o celular (por exemplo `http://192.168.0.10:3000`).
- **Celular:** o app guarda uma cópia de todos os mercados e produtos e **funciona sem internet e com o programa fechado** (busca, mercados e produtos). Com o servidor respondendo, ele usa o servidor e renova a cópia. Instale `apk/bolso-certo.apk` (veja `apps/mobile/README.md`, seção "Gerar o APK") e, na tela de entrada, use **Configurar servidor** com o endereço mostrado no programa. O celular precisa estar na mesma rede do computador.
- A API do programa usa sempre a porta **3000**; não deixe o `npm run testar` aberto ao mesmo tempo.
- Os dados (contas, produtos, correções) são guardados em um arquivo no computador (`%APPDATA%Bolso Certosalvos`) e voltam quando o programa abre de novo; quem já entrou no app continua entrando. É um quebra-galho até existir o banco de dados. Para recomeçar do zero: menu **Bolso Certo → Apagar os dados salvos e recomeçar**. O programa não é assinado digitalmente, então o Windows pode mostrar o aviso "O Windows protegeu o computador": clique em "Mais informações" e "Executar assim mesmo".
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

Isso roda os testes das quatro partes (pacote compartilhado, API, painel e app). Um deles, em `apps/api/src/fimafim.test.ts`, é um **roteiro completo**: envia as 4 planilhas, cria o acesso de um mercado, corrige e reenvia preços, cadastra um cliente, busca papel higiênico, remove um mercado e exclui a conta, tudo contra a API (sem abrir porta), com os dados na memória.

## Onde estão os documentos do projeto

- **Documento de design** (o que o Bolso Certo é e as decisões tomadas): `docs/superpowers/specs/2026-11-04-comparador-de-precos-design.md`
- **Plano de construção** (as tarefas, uma a uma): `docs/superpowers/plans/2026-11-04-comparador-de-precos.md`
- **Dados de teste e o que cada planilha testa**: `dados-de-teste/LEIA-ME.md`
- Detalhes técnicos: `apps/api/README.md` (API) e `apps/mobile/README.md` (app).

## O que falta antes de publicar

Hoje o Bolso Certo serve para **testar e mostrar**, não para o público usar. Faltam:

- [ ] **Banco de dados de verdade (próxima fase).** Hoje tudo (contas, mercados, preços, buscas) fica na memória e **desaparece quando a API reinicia**.
- [ ] **Envio de e-mail de verdade.** Hoje os e-mails só são escritos no terminal da API. É preciso contratar um provedor de e-mail para o cliente receber o código de confirmação e de recuperação de senha.
- [ ] **Texto da política de privacidade revisado** por alguém qualificado (por exemplo, um advogado). O texto atual (`/privacidade` na API) é um rascunho, e o contato ainda está "a definir".
- [ ] **HTTPS e hospedagem.** Escolher onde a API vai rodar, com endereço seguro (HTTPS). Em produção, defina estas variáveis antes de ligar a API (exemplo no PowerShell do Windows; troque os valores):

  ```
  $env:NODE_ENV="production"
  $env:JWT_SECRET="uma-frase-longa-e-secreta-com-no-minimo-32-caracteres"
  $env:ADMIN_EMAIL="seu-email@exemplo.com"
  $env:ADMIN_SENHA="uma-senha-forte-com-no-minimo-8-caracteres"
  npm start -w @mercado/api
  ```

  Em produção a API **não liga** se faltar alguma dessas variáveis, e não carrega os dados de teste. Nunca guarde esses valores em arquivos do projeto. Depois de usar `$env:` para testar, abra um terminal novo: as variáveis continuam valendo no terminal em que foram definidas.
- [ ] **E-mail em produção sem provedor.** Enquanto não houver provedor de e-mail, a API só liga em produção com `$env:PERMITIR_EMAIL_NO_LOG="1"`, sabendo que os códigos de confirmação e de redefinição de senha (inclusive do administrador) aparecem no log do servidor: quem lê o log consegue redefinir qualquer senha.
- [ ] **Limites de requisições.** Já existem (login e demais rotas de conta: 20 por minuto por endereço; busca: 60 por minuto), mas os números precisam ser ajustados com o uso real.
- [ ] **CORS aberto.** Hoje a API aceita chamadas de qualquer origem (`origin: true`). Ao hospedar, restrinja ao endereço do painel.
- [ ] **Endereço da API nos clientes.** `VITE_API_URL` (painel) e `EXPO_PUBLIC_API_URL` (app) precisam apontar para o endereço HTTPS da API; as versões de produção bloqueiam `http://`.
- [ ] **Instalação na hospedagem.** `npm start` usa o `tsx`, que é uma dependência de desenvolvimento: a instalação no servidor não pode omitir as dependências de desenvolvimento.
- [ ] **Log do servidor.** Guarda o endereço de quem acessa e as rotas (sem o texto das buscas). Defina por quanto tempo esse log fica guardado.
- [ ] **Sessões depois de trocar a senha.** Redefinir a senha **não** derruba os logins já emitidos (lacuna conhecida), nem invalida outros códigos ainda pendentes.
- [ ] **Reinício da API.** Depois de um reinício, todos precisam entrar de novo (a sessão é presa a cada início da API) e todos os dados se perdem até a fase do banco de dados.
- [ ] **Métrica do piloto.** O registro de buscas ainda não tem data e hora: acrescente `feitaEm` antes de medir o uso do piloto.
- [ ] **Ícone do app e contas nas lojas.** Gerar o ícone em PNG a partir de `marca/icone-bolso-certo.svg`; preencher `scheme`, `android.package` e `ios.bundleIdentifier` em `apps/mobile/app.json`; e abrir as contas de desenvolvedor do **Google Play** e da **App Store** (pagas, com revisão).
- [ ] **Conferir o nome "Bolso Certo"**: registro no INPI, disponibilidade no Google Play e na App Store, e se há domínio livre.
- [ ] **Decisões de produto ainda em aberto** (seção 12 do documento de design): o valor e a forma da cobrança futura dos mercados, se a lista de compras com total fica para a versão 2, e como medir se o piloto deu certo (a sugestão é pelo menos 3 mercados com algumas centenas de produtos cada).
