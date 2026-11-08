# Passagem de contexto: tudo o que foi aprendido no trabalho feito no computador do dono

Este documento foi escrito pela conversa que trabalhou **no computador Windows do dono** (sessão "Plataforma comparação preços mercados"),
para a conversa que trabalhou **na nuvem** ("Conversación casual", ramo `ccr-080fd299-2336r9`). As duas mexeram no mesmo repositório em
paralelo. Aqui está o que a primeira sabe e a segunda talvez não: decisões, pedidos do dono, armadilhas já pagas, o que foi verificado
e o que **não** foi. Leia inteiro antes de continuar; vai poupar retrabalho.

> Convenção: "dono" = a pessoa dona do projeto (quem conversa com vocês). Ela **não é programadora no dia a dia**, fala português, e
> aprova cada passo importante. Nada aqui contém senhas; as que existem ficam só no computador dela.

---

## 1. Quem é o dono e como ela quer ser tratada

- Responder **sempre em português**, em linguagem simples, sem jargão. Dizer o que mudou, o que foi testado e **o que não foi testado**.
- **Código sempre bem comentado, em português**, para ela conseguir mexer sozinha um dia. Todo arquivo novo ou alterado: comentário no
  topo (para que serve, onde se encaixa) e comentários curtos nas partes menos óbvias. Manter `docs/GUIA-DO-CODIGO.md` atualizado.
- Restrições que ela impôs e nunca revogou: **nada que cobre dinheiro**, nada de nuvem paga, perguntar antes de baixar programas,
  de mexer em configurações do sistema e de **enviar para o GitHub** (ela aprova cada envio com "Enviar ao GitHub"). **Nunca** `push --force`.
  Dados de preços coletados de sites de terceiros **não vão para o git** (`dados-reais/*.xlsx` e `.json` estão no `.gitignore`).
- Mensagem final de cada tarefa: o que fiz, onde estão os arquivos (caminho completo), o que ela precisa decidir. Sem recapitular tudo.
- Quando ela escreve algo ambíguo, **entender o contexto antes de agir** (já houve mensagens soltas no meio de uma tarefa, como
  "pode ser uma mistura de cor, um pouco mais puxado para o azul", que era sobre a cor da marca). Perguntar uma vez, com opções.

## 2. O que o produto é (visão do dono, que mudou ao longo da conversa)

- **Bolso Certo**: comparar preços de supermercados por código de barras. Piloto na Vila Sônia (São Paulo).
- **Dois programas separados** (decisão firme do dono):
  - **"Bolso Certo - Mercado"** (programa de Windows `.exe` + painel web): do **mercado**. Ele se cadastra sozinho (conta só com e-mail e senha),
    preenche **nome, endereço completo (CEP, rua, número, bairro, cidade, UF) e telefone em "Meu mercado"**, e cadastra produtos e preços
    (à mão, botão "Novo produto", ou por planilha Excel). **Cada mercado só vê e edita o que é dele.** Um usuário pode ter **vários mercados**
    (botão "Adicionar outro mercado" + seletor no topo). Existe uma conta de **desenvolvedor** (papel `admin`) que vê tudo.
  - **App do cliente** (Android): ver produtos, comparar, escolher o melhor. **Independente**: precisa funcionar **sem internet e com o
    programa do mercado fechado**, usando uma **cópia local** dos produtos, que se atualiza sozinha quando há rede. O app só é atualizado
    pela loja de aplicativos (o que se atualiza sozinho são os **produtos**).
- Decisões posteriores do dono: **sem confirmação de e-mail** (entra com qualquer e-mail); **cadastro só com e-mail e senha** (validação de
  senha: mínimo de 8 caracteres e "repita a senha"); **tela inicial do app já mostra produtos comparados** (sem precisar digitar);
  **perfil editável** na tela Conta (foto, nome de usuário, e-mail, senha); **ao digitar o CEP, preencher o endereço** (ViaCEP);
  **entrar com o Google** (pedido, ainda **não feito**, ver seção 8).
- O dono pediu que o **servidor ficasse na internet** e o **banco de dados** guardasse tudo. A conversa na nuvem entregou isso
  (Azure SQL + Render). Do lado do computador do dono, o `.exe` ainda tem o servidor embutido, em memória, com arquivo de salvamento
  (quebra-galho, veja seção 5); o "modo nuvem" do programa veio da conversa da nuvem.

## 3. Mapa rápido do código (veja o guia completo em `docs/GUIA-DO-CODIGO.md`)

| Pasta | O que é |
|---|---|
| `apps/api` | Servidor (Fastify). Repositório em memória (`repositorioMemoria.ts`) e SQL Server (nuvem). Rotas em `src/rotas`, autenticação em `src/auth`. |
| `apps/painel` | Painel do mercado (React + Vite). |
| `apps/desktop` | Programa de Windows (Electron): junta API + painel em um `.exe`. `main.cjs` (casca), `api-embutida.ts`, `construir.mjs` (gera o `.exe`), `gerar-icones.cjs`. |
| `apps/mobile` | App do cliente (Expo SDK 58, React Native 0.88, React 19). |
| `packages/shared` | Regras usadas por todos: quantidade, preço por unidade, **busca e comparação** (`busca.ts`), endereço/CEP/telefone (`endereco.ts`). |
| `exemplos/planilha-exemplo-para-subir.xlsx` | Planilha de exemplo (20 produtos, códigos de barras válidos) para o dono testar o envio. |

Ideia central de arquitetura que **não deve ser desfeita**: a **mesma conta** de busca/comparação roda no servidor e no app
(`packages/shared/src/busca.ts`), e existe um teste (`apps/api/src/rotas/catalogo.test.ts`) que garante que servidor e cópia local dão o
**mesmo resultado**. É isso que permite o app funcionar offline.

## 4. Decisões de projeto que valem a pena preservar

1. **Cópia local no app** (`apps/mobile/src/catalogo.ts`): `GET /catalogo` baixa tudo; guardado em partes de 300 ofertas no AsyncStorage
   (o Android não lê textos grandes de uma vez). `api.ts` tenta o servidor e, se não responde (status 0), refaz a consulta na cópia; aparece a
   faixa "Sem conexão…". Renova ao entrar, ao voltar ao app (AppState) e após consultas (no máximo a cada 10 min).
2. **Planilha de mercado não renomeia o mercado**: para o papel `mercado`, a aba "Mercado" da planilha é **ignorada** (só o administrador a usa).
   Nome, endereço completo e telefone ficam em "Meu mercado".
3. **Endereço**: o servidor guarda por partes (`Mercado.detalhes`, `telefone` só dígitos) **e** como uma linha (`endereco`), que é o que o app mostra.
4. **Mercado do usuário** (`apps/api/src/painel/mercadoEscolhido.ts`): `?mercadoId=` só vale se o mercado for **do usuário** (senão 403). Testado.
5. **Login/sessão**: o token carrega `inst` (instância do servidor); token de outra instância é 401 "Sessão inválida" (no modo em memória os ids
   recomeçam a cada início). No `.exe`, a instância e o segredo são **guardados em arquivo** para sessões sobreviverem ao reabrir.
6. **Rate limit**: `trustProxy` só confia em `X-Forwarded-For` vindo de 127.0.0.1 (atrás do túnel). Na nuvem, a variável `CONFIAR_PROXY` (vinda da outra conversa) cobre o Render.
7. **Erros de e-mail não derrubam cadastro**: se o envio falhar, o cadastro vale. Senha atual errada na troca de senha é **400** (não 401), senão o app acha que
   a sessão acabou e sai da conta.
8. **Testes que travam sob carga**: `testTimeout: 30000` no painel e no app (os computadores do dono ficam ocupados durante o APK).

## 5. O que foi construído no computador do dono (e talvez não exista na nuvem)

- **Programa de Windows** (Electron 45, `npm run construir:exe`): API e painel embutidos, dados salvos em `%APPDATA%\Bolso Certo - Mercado\salvos`
  (`dados.json`, `segredo.txt`, `instancia.txt`). Menus: Códigos de e-mail e endereço do celular, **Configurar e-mail…** (SMTP por arquivo
  `configuracao-email.json`, com e-mail de teste), **Acesso pela internet (túnel)…** (liga o `cloudflared`), Apagar dados salvos.
  Senha do desenvolvedor **gerada na primeira abertura** (`senha-desenvolvedor.txt`), nunca escrita no código.
- **Túnel temporário** (`cloudflared`, instalado com `winget install --id Cloudflare.cloudflared`): endereço `*.trycloudflare.com` que **muda a cada vez**.
  Foi a solução provisória para a Ana (testadora longe) antes da hospedagem. **Não é mais necessário** se a hospedagem estiver no ar.
- **Envio de e-mail por SMTP** (`apps/api/src/email.ts`, `nodemailer`), `docs/EMAIL.md`. **No Render gratuito o SMTP é bloqueado** (já anotado em `docs/HOSPEDAGEM.md`).
- **Tela inicial do app** com lista comparada (`GET /produtos`, `listarProdutosNoCatalogo`), perfil (`/conta`, `Perfil.tsx`, `foto.ts` com
  `expo-image-picker` + `expo-image-manipulator`), CEP automático no painel (`viaCep.ts`).
- **Coleta de preços** (`ferramentas/coleta/`): Atacadão (API pública VTEX) e Carrefour Mercado (páginas JSON-LD via sitemap). **Assaí** (Incapsula) e
  **www.carrefour** (403) **não foram contornados**; Max Atacadista não foi coletado. Resultado vira planilha (`dados-reais/`, fora do git).

## 6. Armadilhas já pagas (economizam horas)

**Windows / ferramentas**
- O terminal Bash do computador do dono **quebra heredocs longos** com aspas/crases e **perde contrabarras** em regex dentro de `bash -c`. Para criar ou editar
  arquivos use as ferramentas de escrita/edição; para scripts de edição em massa, grave um `.cjs` e rode com `node`. Regex como `/^\d+$/` já virou `/^d+$/` por isso.
- Vários arquivos do repositório têm **CRLF**. Scripts de substituição por texto devem normalizar (`\r\n` → `\n`) e regravar com o fim de linha original.
- Compilar o **APK no Windows**: o limite de 260 caracteres do caminho derruba o CMake. Solução usada: copiar o projeto para **`C:\bc`** e compilar lá; o `ninja`
  do Android SDK (1.10.2) foi **trocado pela 1.13.2** em `C:\Android\sdk\cmake\3.22.1\bin\ninja.exe` (backup `ninja-1.10.2.exe.bak`), com autorização do dono;
  "caminhos longos" habilitado no Windows. Comandos: `npx expo prebuild --platform android --no-install` e, em `android/`,
  `./gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a`, com `EXPO_PUBLIC_API_URL` e `NODE_ENV=production`. Leva ~8 a 10 min.
- Assinatura do APK: chave de **debug** (a mesma do template do Expo), então um APK novo **instala por cima** do antigo. Nunca serve para a Play Store.
- Expo Go: a App Store só chega ao SDK 54; este app é SDK 58, então **não abre no iPhone** via Expo Go. Foi por isso que se gerou APK (Android).
- Electron: janela **oculta e transparente falha**; para desenhar os ícones (`gerar-icones.cjs`) usa-se `offscreen: true`, tamanho 512 e uma janela só.
  Janelas offscreen grandes (≥1024) falham sem aviso.
- `programa/` fica **travado** enquanto o `.exe` está aberto (ou com uma janela do Explorer nele): gerar em outra pasta com `BOLSO_SAIDA=programa-nova`.
- Porta 3000: o `.exe` e o `npm run testar` brigam por ela; a 3001 pode estar ocupada por outro programa do dono. O painel do `.exe` usa porta livre qualquer.
- `npm run testar` (`iniciar-teste.ps1`) abre API, painel e app web; **encerra sozinho** processos antigos do projeto nas portas 3000/5173/8081.

**Código**
- No `jest` do app, o `expo-secure-store`, `expo-linking`, o AsyncStorage e `./src/foto` são **mockados globalmente** em `jest.setup.ts`. Mudar isso quebra tudo.
- O helper de testes do painel (`ajudantesTeste.tsx`, `simularApi`) responde `GET /painel/meus-mercados` sozinho (fora da lista de chamadas); o do app
  (`teste/ajudas.tsx`) responde `GET /produtos` e `GET /conta` sozinho, a menos que se passe `{ semPadroes: true }` (testes de "sem internet").
- `FlatList.ListFooterComponent` do React Native não aceita `null`: devolva um elemento vazio.
- Testes de formulário digitando muito ficam lentos com o computador ocupado: já há `testTimeout`.
- `repositorio.contrato.ts` é o **contrato** que todo repositório (memória e SQL) precisa cumprir; ao criar método novo, adicione teste lá.

## 7. O que foi **verificado** e o que **não** foi

Verificado de verdade (nesta máquina): API, painel, app e regras compartilhadas com testes automáticos (na época: API 611, app 209, painel 156, compartilhado 73);
`.exe` aberto e usado (cadastro de mercado, endereço, produto novo, planilha de exemplo, persistência ao fechar e abrir, túnel público respondendo de fora);
APK **gerado e inspecionado** (pacote `br.com.bolsocerto.app`, assinatura debug, código do app dentro).

**Nunca verificado** (digam isso ao dono em vez de afirmar):
- **Nenhum APK foi instalado/aberto em celular real por quem escreveu o código.** A única evidência é o relato do dono (a Ana abriu uma versão antiga e viu "Não foi possível falar com o servidor" por apontar para um IP de rede local).
- **Envio de e-mail real** (SMTP): coberto só por teste com transporte falso; ninguém tem uma conta de e-mail configurada.
- **Foto de perfil e galeria** no aparelho (módulos nativos novos): só testados com mocks.
- Iphone: não existe build.

## 8. Pendências e pedidos em aberto do dono

1. **Entrar com o Google**: o dono quer ("mais fácil e rápido"). Depende de **IDs do cliente OAuth** (Android com SHA-1 + Web) criados pelo dono no Google Cloud;
   o passo a passo está em `docs/GOOGLE.md`. Não implementar botão sem isso (daria erro). Com os IDs: rota `POST /auth/google` (conferir o token de identidade),
   botão no app, contas Google sem senha (esconder "Trocar senha").
   Lembrar: na nuvem o app agora é **sem login obrigatório**; Google entra como opção na aba Conta.
2. **E-mail de "esqueci minha senha"** no Render gratuito não sai (SMTP bloqueado). Opções: serviço de e-mail por API HTTP (Brevo/Resend/SendGrid) ou aceitar o código só no log.
3. **Moderação**: qualquer pessoa pode se cadastrar como mercado e publicar preços visíveis a todos os clientes. Antes de abrir ao público: aprovação.
4. **Trocar a senha fixa antiga do administrador** nas variáveis do servidor (nunca escrita no código; no `.exe` ela é gerada).
5. **Cópia compactada do programa** (`programa/Bolso-Certo-Mercado-Windows.zip`) está **desatualizada** (ficou com uma versão antiga).
6. **Túnel**: desligar quando não for usado (menu do programa). Endereço muda a cada vez.
7. Revisar o texto da **política de privacidade**, nome do app, ícone final, contas de loja (Play Store) e assinatura de produção.
8. O **painel dentro do `.exe`** ainda fala com a API embutida; o "modo nuvem" (conectar o `.exe` ao servidor do Render) veio da outra conversa e precisa ser exercitado.

## 9. Como trabalhar sem se atropelar (as duas conversas já divergiram uma vez)

- Antes de começar: `git fetch` e ver `git log origin/main`. As duas linhas se encontraram sem conflito porque a conversa do computador só **enviava** ao `main` quando o dono pedia.
- Preferir **ramos curtos** e Pull Request; o dono mescla. Não reescrever histórico.
- Se mexer em `packages/shared/src/busca.ts`, rode `apps/api/src/rotas/catalogo.test.ts` (equivalência servidor × app).
- Ao mudar a **forma da resposta** de uma rota usada pelo app, lembrar que **APKs antigos continuam instalados**: mantenha compatibilidade ou suba a versão do app (o código de versão precisa aumentar para o Android aceitar a atualização por cima).
- Comandos úteis: `npm test` (tudo), `npm run construir:exe`, `npm run testar`, `npm run gerar-icones`.
