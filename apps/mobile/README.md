# Bolso Certo — aplicativo do cliente

Aplicativo de celular (Expo / React Native) para comparar preços. Nesta etapa ele tem cadastro, login,
confirmação de e-mail, redefinição de senha e a busca com comparação de preços. As telas de mercados e conta
vêm nas próximas tarefas.

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
  `reenviarVerificacao`, `excluirConta`, `buscar`) e `pedirAutenticado`, que as próximas telas devem reutilizar.
- `src/sessao.tsx`: guarda `{ token, emailVerificado }` no cofre seguro do aparelho (`expo-secure-store`)
  e devolve a sessão ao abrir o app. Se a API responder 401 numa chamada autenticada, a sessão é encerrada.
- `src/navegacao.tsx`: telas de acesso (Entrar, Cadastrar, EsqueciSenha) sem sessão; telas principais
  (Busca, VerificarEmail) com sessão. Enquanto o e-mail não é confirmado, as telas principais mostram a faixa
  "Confirme seu e-mail", que não bloqueia o uso.
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
