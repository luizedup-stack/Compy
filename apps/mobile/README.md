# Compy — aplicativo do cliente

Aplicativo de celular (Expo / React Native) para comparar preços. Nesta etapa ele tem cadastro, login,
confirmação de e-mail, redefinição de senha, a busca com comparação de preços, a lista de mercados com os produtos de
cada um e a tela da conta (sair e excluir a conta).

## Como rodar no celular

> **Versão do Expo Go:** este app usa o Expo SDK 58. O Expo Go da App Store (iPhone) só suporta até o SDK 54, então **não abre este app no iPhone**; para iPhone seria preciso um build próprio (conta Apple Developer) ou rebaixar o SDK. No **Android**, se o Expo Go do Google Play estiver desatualizado, instale a versão do SDK 58 em https://expo.dev/go.

1. Na raiz do projeto, instale tudo: `npm install`.
2. Deixe a API rodando no computador (porta 3000).
3. Instale o aplicativo **Expo Go** no celular. O celular e o computador precisam estar na **mesma rede Wi-Fi**.
4. Descubra o endereço do computador na rede (no Windows: `ipconfig`, procure o "Endereço IPv4", por exemplo `192.168.0.10`).
5. Inicie o app apontando para a API:

   ```
   set EXPO_PUBLIC_API_URL=http://192.168.0.10:3000
   npm run start -w @mercado/mobile
   ```

   No PowerShell use `$env:EXPO_PUBLIC_API_URL = "http://192.168.0.10:3000"`; no Mac/Linux, `EXPO_PUBLIC_API_URL=http://192.168.0.10:3000 npm run start -w @mercado/mobile`.
6. Leia o QR code que aparece no terminal com o Expo Go.

`EXPO_PUBLIC_API_URL` é o endereço da API. Se não for definida, o app usa `http://localhost:3000`, que só serve
para o emulador/simulador no mesmo computador. **Em um celular de verdade, `localhost` é o próprio celular**,
então use sempre o endereço do computador na rede. Depois de mudar a variável, reinicie o `npm run start`.

Também existem `npm run android -w @mercado/mobile` e `npm run ios -w @mercado/mobile` (precisam do emulador instalado).

## Gerar o APK (aplicativo instalável no Android)

O APK de teste fica em `apk/bolso-certo.apk` (fora do git). Ele é para Android 7 ou mais novo, celulares de 64 bits, e usa a chave de teste do Android (serve para instalar direto, não para publicar na Play Store). Para instalar: copie o arquivo para o celular e abra; o Android pede para permitir "instalar apps desconhecidos".

Na primeira tela do app, o link **Configurar servidor** troca o endereço da API (por exemplo `192.168.0.10:3000` ou `https://meu-servidor.com`) sem gerar o APK de novo. Nome de site sem `https://` (por exemplo `bolso-certo.onrender.com`) vira `https://` sozinho; número de rede local e endereço com porta continuam `http://`. Com o servidor gratuito do Render, a primeira consulta depois de um tempo parado pode levar até ~1 minuto (servidor e banco acordando). Para um APK que já nasça apontando para o servidor hospedado, gere com `EXPO_PUBLIC_API_URL=https://seu-servidor.onrender.com`. Passo a passo da hospedagem: `docs/HOSPEDAGEM.md`. **APK já apontando para o servidor, gerado no GitHub (sem instalar nada):** aba Actions → *Gerar APK* (arquivo `.github/workflows/gerar-apk.yml`). O APK de fábrica aponta para o endereço do computador no momento da geração. Atenção: o celular precisa alcançar essa API.

Para gerar de novo no Windows (precisa de Node, Java 17 e Android SDK com `ANDROID_HOME`):

1. Compile a partir de uma **cópia do projeto em um caminho curto** (por exemplo `C:\bc`): o Windows limita nomes de arquivo a 260 caracteres e a compilação nativa passa disso em pastas longas.
2. Na cópia: `npm ci`, depois, em `apps/mobile`: `npx expo prebuild --platform android --no-install`.
3. Em `apps/mobile/android` (com `EXPO_PUBLIC_API_URL` e `NODE_ENV=production` definidos): `.\gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`.
4. O arquivo sai em `android/app/build/outputs/apk/release/app-release.apk`.

Requisitos que já foram resolvidos neste computador: "caminhos longos" habilitado no Windows e o `ninja` do Android SDK (`cmake/3.22.1/bin/ninja.exe`) trocado pela versão 1.13.2, porque o 1.10.2 que acompanha o SDK não suporta caminhos longos (a cópia do antigo ficou em `ninja-1.10.2.exe.bak`).

## Como rodar os testes

```
npm test -w @mercado/mobile
npm run typecheck -w @mercado/mobile
```

Os testes usam jest-expo e React Native Testing Library. Eles não usam a internet: o `fetch`, o
`expo-secure-store` e o `expo-linking` são trocados por versões falsas.

## Como funciona

- `src/api.ts`: chamadas à API (`cadastrar`, `entrar`, `esqueciSenha`, `redefinirSenha`, `verificarEmail`,
  `reenviarVerificacao`, `excluirConta`, `buscar`, `listarMercados`, `produtosDoMercado`) e `pedirAutenticado`, que as próximas telas devem reutilizar.
- `src/sessao.tsx`: guarda `{ token, emailVerificado }` no cofre seguro do aparelho (`expo-secure-store`)
  e devolve a sessão ao abrir o app. Se a API responder 401 numa chamada autenticada, a sessão é encerrada.
- `src/navegacao.tsx`: telas de acesso (Entrar, Cadastrar, EsqueciSenha) sem sessão; com sessão, três abas na barra
  inferior (**Buscar**, **Mercados** e **Conta**) e, por cima delas, MercadoDetalhe e VerificarEmail. Entrar abre em
  "Buscar". Enquanto o e-mail não é confirmado, as abas e o MercadoDetalhe mostram a faixa "Confirme seu e-mail",
  que não bloqueia o uso.
- Só contas de **cliente** entram no app. Mercados usam o painel na web.

## Funciona sem internet

O app guarda no celular uma **cópia de todos os mercados e produtos** (`GET /catalogo`, em `src/catalogo.ts`, em partes de 300 ofertas no AsyncStorage). Ao entrar (e a cada consulta bem-sucedida, no máximo a cada 10 minutos) ele renova essa cópia em segundo plano.

- **Com o servidor respondendo**, `buscar`, `listarMercados` e `produtosDoMercado` (`src/api.ts`) usam as respostas dele.
- **Sem resposta** (sem internet, ou servidor desligado), as mesmas consultas rodam na cópia, com a mesma conta do servidor (`buscarNoCatalogo` e companhia, em `packages/shared/src/busca.ts`; um teste da API garante que dão o mesmo resultado). Aparece a faixa "Sem conexão com o servidor. Mostrando os dados salvos no celular (data e hora)".
- Sem conexão **e** sem nenhuma cópia guardada (primeiro uso), aparece o erro de sempre. A primeira entrada na conta precisa de internet.
- Ao sair da conta a cópia é apagada. As buscas feitas sem internet não são registradas no servidor.

## Busca

A tela inicial (`src/telas/Busca.tsx`) compara o preço de um produto entre os mercados. O app é **somente leitura**:
não há como editar produtos, preços ou mercados.

- O campo "Buscar produto" chama a API (`GET /busca`) 400 ms depois da última tecla. Com menos de 2 letras (sem contar
  espaços das pontas) não há chamada e a tela mostra uma dica. Respostas antigas nunca sobrescrevem as mais novas, e a
  mesma busca já mostrada não é repetida.
- A alternância "Menor preço por unidade" / "Menor preço da embalagem" refaz a busca na hora com `ordem=unidade` ou
  `ordem=embalagem`. A API é quem ordena: o app mostra grupos e ofertas na ordem recebida, sem reordenar.
- Cada produto (grupo) lista as ofertas dos mercados com endereço, preço da embalagem, preço por unidade e idade do
  preço. A primeira oferta de um grupo com mais de uma ganha a etiqueta "mais barato"; ofertas sem quantidade mostram
  "sem quantidade informada"; preços velhos ganham a etiqueta amarela "Preço antigo" (a oferta continua visível).
- Erros (rede ou servidor) aparecem com o botão "Tentar de novo". Se a API responder 401, a sessão é encerrada.
- `src/formatar.ts` tem os formatadores (`formatarPreco`, `textoIdade`, `textoPorUnidade`), escritos sem `Intl` para
  funcionar igual no celular e nos testes; `src/componentes/CartaoOferta.tsx` é a linha de uma oferta.

## Mercados

A aba "Mercados" (`src/telas/Mercados.tsx`) lista os mercados ativos (`GET /mercados`): nome, endereço e
"N produtos" (ou "1 produto"). Puxar a lista para baixo atualiza; erros mostram a mensagem e "Tentar de novo".

Tocar num mercado abre `src/telas/MercadoDetalhe.tsx`, com o nome do mercado no título e os produtos dele
(`GET /mercados/:id/produtos?pagina=N`, 50 por página) em rolagem infinita: ao chegar ao fim da lista o app pede a próxima
página, nunca repete uma página já pedida e não pede nada depois da última (quando os produtos recebidos chegam ao total).
Cada linha (`src/componentes/LinhaProduto.tsx`) mostra o nome, o preço da embalagem com a quantidade, o preço por
unidade, a idade do preço e, para preços velhos, a etiqueta amarela "Preço antigo" (o produto continua na lista);
sem quantidade aparece "sem quantidade informada". Se uma página depois da primeira falhar, as linhas já carregadas
ficam e a lista mostra "Não foi possível carregar mais." com "Tentar de novo" (pede a mesma página). Se o mercado foi
removido (404) aparece a mensagem e o botão "Voltar". Tudo é somente leitura.

## Conta

A aba "Conta" (`src/telas/Conta.tsx`) tem:

- **Sair**: apaga a sessão guardada no aparelho e volta para Entrar.
- **Política de privacidade**: abre `<API>/privacidade` no navegador (`expo-linking`).
- **Excluir minha conta**: em duas etapas. O primeiro botão só abre a confirmação; somente "Sim, excluir minha conta"
  chama `DELETE /conta` (uma única vez, mesmo com toques repetidos; os dois botões ficam desativados enquanto o pedido
  corre). Se der certo, o token é apagado e o app volta para Entrar com o aviso "Conta excluída."; se der erro, a
  mensagem aparece e a confirmação continua aberta para tentar de novo. "Cancelar" fecha a confirmação sem chamar a API.
  A API apaga a conta e deixa as buscas anônimas; depois disso o token deixa de valer.

## Atualizar o app já instalado (sem desinstalar)

Quem já tem o app instala o APK novo por cima (o Android mostra "Atualizar") e mantém a conta e os dados. Para o Android aceitar, o pacote e a assinatura têm de ser os mesmos
(todos os APKs usam a chave de teste que o `expo prebuild` coloca no projeto) e o número da versão não pode diminuir: **suba `android.versionCode` (e `version`) em `app.json` a cada APK novo**.
O endereço do servidor escolhido em "Configurar servidor" fica guardado na chave `bolso-certo.servidor.2`; o que versões antigas guardaram na chave anterior é ignorado de propósito.
