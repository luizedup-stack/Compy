# Entrar com a conta do Google (ainda não implementado)

**Situação:** o aplicativo hoje cria a conta só com e-mail e senha (sem confirmação de e-mail). O botão
"Continuar com o Google" **ainda não existe**, porque depende de um cadastro seu no Google, que ninguém pode fazer por você
(é uma conta de desenvolvedor, com o seu e-mail).

## O que você precisa fazer (uma vez só, gratuito)

1. Entrar em <https://console.cloud.google.com> com a sua conta Google e criar um **projeto** (por exemplo, "Compy").
2. Em **APIs e serviços → Tela de consentimento OAuth**: tipo "Externo", nome do aplicativo "Compy", seu e-mail de suporte.
   Para os testes pode ficar em modo "Em teste", adicionando os e-mails de quem vai testar.
3. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth** criar dois:
   - **Android**: nome do pacote `br.com.bolsocerto.app` e a **impressão digital SHA-1** da chave com que o APK é assinado.
     (Eu te passo o comando para ler a SHA-1 do APK atual; para publicar na Play Store será outra chave.)
   - **Web**: serve para o servidor conferir se o login é verdadeiro.
4. Me enviar os dois **IDs do cliente** (não são secretos). **Não** envie senhas nem o "segredo do cliente".

## O que eu faço depois que você tiver os IDs

- Servidor: rota `POST /auth/google`, que recebe o "token de identidade" do Google, confere com o ID do cliente Web e entra
  (ou cria a conta, já verificada, com o e-mail e o nome da conta Google). Com testes.
- Aplicativo: botão **Continuar com o Google** nas telas de entrada e de cadastro, e o nome/foto da conta Google já aparecem no perfil.
- Quem entra pelo Google não tem senha: a tela Conta esconde "Trocar senha" para essas contas.

## Por que não dá para fazer sem isso

O Google só entrega o login para aplicativos cadastrados no console dele e identificados pelo pacote + SHA-1. Sem o seu projeto,
o botão apareceria e daria erro. Prefiro deixar sem o botão a deixar um botão que não funciona.
