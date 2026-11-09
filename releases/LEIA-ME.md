# APK do Compy (teste)

Cópia salva do aplicativo Android usado nos testes. **É só para teste**: usa a chave de teste do Android (instala direto no celular, mas não serve para a Play Store).

| | |
|---|---|
| Arquivo | `bolso-certo.apk` (24.2 MB) |
| Gerado em | 2026-11-10 (nova marca Compy: nome, ícone, cores e fonte Poppins) |
| Servidor embutido | `https://bolso-certo.onrender.com` (o app já abre usando ele; ninguém precisa configurar) |
| Pacote / versão | `br.com.bolsocerto.app`, versão **1.2.0 (código 7)** |
| Android mínimo | 7.0 (API 24), celulares de 64 bits (arm64) |
| SHA-256 do arquivo | `9442c98cb6b3ee5264beb92480a8c4123d63e104d95e11f51defdeb3c24a797b` |
| Certificado de assinatura (SHA-256) | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (Android Debug) |

## O que esta versão tem

- Funciona **sem login**: buscar e comparar preços é livre; entrar ou criar conta é opcional, na aba **Conta**.
- **Foto de cada produto**: a do próprio produto (Open Food Facts, planilha ou enviada pelo mercado no painel) e, quando não existe, a **foto ilustrativa do tipo** (leite, arroz, papel higiênico...), com a etiqueta "ilustrativa". Só aparece "Sem foto" para tipos que o banco de fotos ainda não tem.
- Se o servidor gratuito estiver dormindo, o app mostra **"Acordando o servidor…"** e tenta de novo sozinho (até ~1 minuto), em vez de dar erro. Se o celular já tem uma cópia dos produtos (depois da primeira vez), a tela inicial e a busca abrem **na hora** com ela (faixa amarela dizendo que o servidor está demorando) enquanto o servidor acorda por trás.
- Ao tocar numa oferta, o app pergunta **"Ir até o mercado?"** e abre o **Google Maps** ou o **Waze**.

## Instalar (primeira vez)

1. Baixe o `bolso-certo.apk` (botão **Download** nesta página do GitHub) e envie para o celular.
2. Abra o arquivo; o Android pede para permitir "instalar apps desconhecidos"; instale.

## Atualizar quem já tem o app (sem desinstalar)

Basta abrir o `.apk` novo e tocar em **Atualizar**: a conta e os dados ficam, e não precisa baixar nada além do arquivo. O Android aceita porque o pacote e a assinatura são
os mesmos de antes e o número da versão é maior (esta é a versão 7; as anteriores eram de 1 a 6). Esta versão também ignora o endereço de servidor que versões antigas tinham guardado.
Só se o Android recusar a atualização (sinal de que o app antigo foi assinado com outra chave) é preciso desinstalar o antigo uma vez.

A primeira consulta depois de um tempo parado pode levar até ~1 minuto: o servidor e o banco gratuitos dormem sem uso.

## Conferir que o arquivo não foi alterado

PowerShell: `Get-FileHash .\bolso-certo.apk -Algorithm SHA256` e compare com o valor da tabela.

## Gerar de novo

Veja `docs/HOSPEDAGEM.md` (seção "APK pronto para as pessoas testarem") e `.github/workflows/gerar-apk.yml`. Quando o endereço do servidor mudar, o APK precisa ser gerado de novo, porque o endereço fica gravado dentro do app (ou o usuário troca em "Configurar servidor").
