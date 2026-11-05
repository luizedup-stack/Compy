# Bolso Certo — aplicativo do cliente

Aplicativo de celular (Expo / React Native) para comparar preços. Nesta etapa ele tem cadastro, login,
confirmação de e-mail, redefinição de senha, a busca com comparação de preços, a lista de mercados com os produtos de
cada um e a tela da conta (sair e excluir a conta).

## Como rodar no celular

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
