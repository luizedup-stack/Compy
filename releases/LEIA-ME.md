# APK do Bolso Certo (teste)

Cópia salva do aplicativo Android usado nos testes. **É só para teste**: usa a chave de teste do Android (instala direto no celular, mas não serve para a Play Store).

| | |
|---|---|
| Arquivo | `bolso-certo.apk` (24.2 MB) |
| Gerado em | 2026-11-07, a partir do código do commit `bea25d3` (app sem login, fotos dos produtos e rota até o mercado) |
| Servidor embutido | `https://bolso-certo.onrender.com` (o app já abre usando ele; ninguém precisa configurar) |
| Pacote / versão | `br.com.bolsocerto.app`, versão 1.0.0 (código 1) |
| Android mínimo | 7.0 (API 24), celulares de 64 bits (arm64) |
| SHA-256 do arquivo | `6f818ac2991d83aa0612082a4941463a01c86e709fc6e281e16c5bc13ed6479a` |
| Certificado de assinatura (SHA-256) | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (Android Debug) |

## O que esta versão tem

- Funciona **sem login**: buscar e comparar preços é livre; entrar ou criar conta é opcional, na aba **Conta**.
- **Foto de cada produto** (achada sozinha no Open Food Facts, ou enviada pelo mercado no painel); sem foto aparece "Sem foto".
- Ao tocar numa oferta, o app pergunta **"Ir até o mercado?"** e abre o **Google Maps** ou o **Waze**.

## Instalar

1. Baixe o `bolso-certo.apk` (botão **Download** nesta página do GitHub) e envie para o celular.
2. Abra o arquivo; o Android pede para permitir "instalar apps desconhecidos"; instale.
3. Se já houver uma versão antiga do app instalada e o Android recusar, desinstale a antiga e instale de novo. **Quem testou uma versão antiga deve desinstalá-la antes**: ela pode ter guardado o endereço de um servidor antigo, que sobrepõe o do APK novo.

A primeira consulta depois de um tempo parado pode levar até ~1 minuto: o servidor e o banco gratuitos dormem sem uso.

## Conferir que o arquivo não foi alterado

PowerShell: `Get-FileHash .\bolso-certo.apk -Algorithm SHA256` e compare com o valor da tabela.

## Gerar de novo

Veja `docs/HOSPEDAGEM.md` (seção "APK pronto para as pessoas testarem") e `.github/workflows/gerar-apk.yml`. Quando o endereço do servidor mudar, o APK precisa ser gerado de novo, porque o endereço fica gravado dentro do app (ou o usuário troca em "Configurar servidor").
