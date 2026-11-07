# APK do Bolso Certo (teste)

Cópia salva do aplicativo Android usado nos testes. **É só para teste**: usa a chave de teste do Android (instala direto no celular, mas não serve para a Play Store).

| | |
|---|---|
| Arquivo | `bolso-certo.apk` (24.2 MB) |
| Gerado em | 2026-11-07, a partir do `main` no commit `e6ab871` |
| Servidor embutido | `https://bolso-certo.onrender.com` (o app já abre usando ele; ninguém precisa configurar) |
| Pacote / versão | `br.com.bolsocerto.app`, versão 1.0.0 (código 1) |
| Android mínimo | 7.0 (API 24), celulares de 64 bits (arm64) |
| SHA-256 do arquivo | `7eb3d83a45c5f4e86d96397234ccb647c70a83de8ebb7f57acac706c563c9596` |
| Certificado de assinatura (SHA-256) | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (Android Debug) |

## Instalar

1. Baixe o `bolso-certo.apk` (botão **Download** nesta página do GitHub) e envie para o celular.
2. Abra o arquivo; o Android pede para permitir "instalar apps desconhecidos"; instale.
3. Se já houver uma versão antiga do app instalada e o Android recusar, desinstale a antiga e instale de novo.

A primeira consulta depois de um tempo parado pode levar até ~1 minuto: o servidor e o banco gratuitos dormem sem uso.

## Conferir que o arquivo não foi alterado

PowerShell: `Get-FileHash .\bolso-certo.apk -Algorithm SHA256` e compare com o valor da tabela.

## Gerar de novo

Veja `docs/HOSPEDAGEM.md` (seção "APK pronto para as pessoas testarem") e `.github/workflows/gerar-apk.yml`. Quando o endereço do servidor mudar, o APK precisa ser gerado de novo, porque o endereço fica gravado dentro do app (ou o usuário troca em "Configurar servidor").
