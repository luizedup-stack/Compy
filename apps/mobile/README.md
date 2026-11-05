# Bolso Certo — aplicativo do cliente

Aplicativo de celular (Expo / React Native) para comparar preços. Nesta etapa ele tem cadastro, login,
confirmação de e-mail e redefinição de senha. A busca e as telas de mercados e conta vêm nas próximas tarefas.

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
  `reenviarVerificacao`, `excluirConta`) e `pedirAutenticado`, que as próximas telas devem reutilizar.
- `src/sessao.tsx`: guarda `{ token, emailVerificado }` no cofre seguro do aparelho (`expo-secure-store`)
  e devolve a sessão ao abrir o app. Se a API responder 401 numa chamada autenticada, a sessão é encerrada.
- `src/navegacao.tsx`: telas de acesso (Entrar, Cadastrar, EsqueciSenha) sem sessão; telas principais
  (Busca, VerificarEmail) com sessão. Enquanto o e-mail não é confirmado, as telas principais mostram a faixa
  "Confirme seu e-mail", que não bloqueia o uso.
- Só contas de **cliente** entram no app. Mercados usam o painel na web.
