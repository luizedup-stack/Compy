# Como fazer o e-mail chegar de verdade

O Bolso Certo manda e-mails com um **código** para confirmar a conta (cliente e mercado) e para redefinir a senha.
Para esses e-mails chegarem na caixa de entrada das pessoas, o programa precisa de uma **conta de e-mail para enviar**.
Enquanto isso não estiver configurado, **nenhum e-mail sai**: o código fica visível no menu do programa
(**Bolso Certo → Códigos de e-mail e endereço do celular**), com a situação "NÃO ENVIADO".

## Passo a passo (programa de Windows "Bolso Certo - Mercado")

1. Abra o programa e use o menu **Bolso Certo → Configurar e-mail…**.
2. Clique em **Abrir arquivo de configuração**. Abre o arquivo `configuracao-email.json` no Bloco de Notas.
3. Preencha os campos e salve (não precisa fechar o programa):

   | Campo | O que colocar |
   |---|---|
   | `host` | endereço do servidor de e-mail (veja a tabela abaixo) |
   | `porta` | `465` (e `seguro: true`) ou `587` (e `seguro: false`) |
   | `usuario` | o e-mail da conta que vai enviar |
   | `senha` | a senha da conta, ou melhor, uma **senha de aplicativo** (veja abaixo) |
   | `de` | como o remetente aparece, por exemplo `Bolso Certo <conta@gmail.com>` |

4. Na mesma tela, digite o seu e-mail e clique em **Enviar teste**. Se aparecer "OK", confira a caixa de entrada (e o spam).
   Se aparecer "FALHOU", a mensagem diz o motivo (senha errada, servidor errado...).

## Servidores comuns

| Serviço | host | porta / seguro | Observação |
|---|---|---|---|
| Gmail | `smtp.gmail.com` | `465` / `true` | Exige verificação em duas etapas e uma **senha de aplicativo** (Conta Google → Segurança). |
| Outlook / Hotmail | `smtp-mail.outlook.com` | `587` / `false` | Também costuma exigir senha de aplicativo; a Microsoft vem restringindo o envio simples por SMTP. |
| Brevo, SendGrid, Amazon SES, Resend | veja o painel do serviço | `587` / `false` | Indicados para quando o sistema estiver na internet: enviam em volume e evitam cair no spam. |

> Os valores acima são os usuais, mas cada serviço muda as regras com o tempo. Se der erro, o texto do teste mostra o motivo.

## Segurança

- A senha fica **só neste computador**, no arquivo `configuracao-email.json` (pasta de dados do programa). Ele não vai para o GitHub.
- Use uma conta de e-mail só para o sistema, e uma senha de aplicativo (que dá para apagar sem mexer na senha principal).
- Em produção (servidor na internet) o envio será configurado pelas variáveis do servidor, não por este arquivo.

## Para quem mexe no código

- `apps/api/src/email.ts`: `criarEmailSmtp` (envio por SMTP com `nodemailer`) e `problemaNaConfigSmtp` (confere a configuração).
- `apps/desktop/api-embutida.ts`: lê o arquivo a cada envio, guarda a lista de e-mails com a situação de cada um e faz o e-mail de teste.
- `apps/desktop/main.cjs`: a tela "Configurar e-mail" e o menu.
- Se o envio falhar, o **cadastro continua valendo** (a API responde `emailEnviado: false`) e a pessoa pode pedir outro código em "Reenviar código".
