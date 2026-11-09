# Banco de dados e hospedagem gratuitos (passo a passo)

Objetivo: o programa de Windows e o app do celular falarem com um servidor na internet, que guarda tudo num **banco SQL Server**
(o mesmo tipo que você já usa no SSMS), **sem gastar nada**.

```
 programa de Windows ─┐
 (ou o painel no       ├──► Servidor (Render, grátis) ──► Banco SQL (Azure SQL, grátis) ◄── SSMS (seu PC)
  navegador)           │       API + painel
 app do celular ──────┘
```

| Peça | Onde roda | Custo | O que você precisa saber |
|---|---|---|---|
| Banco de dados | **Azure SQL Database, oferta gratuita** | R$ 0 | Pede cartão só para confirmar a identidade (veja abaixo). |
| Servidor (API + painel) | **Render, plano gratuito** | R$ 0 | Dorme se ninguém usa; a primeira requisição depois disso leva até ~1 minuto. |

O código já está pronto para isso. O que falta é **você criar as duas contas** (ninguém pode fazer isso por você) e copiar três valores.
Tempo estimado: 30 a 40 minutos.

---

## Antes de começar: o que é grátis de verdade e os limites

**Azure SQL Database (oferta gratuita)** — a Microsoft dá, por banco e **para sempre** (enquanto a assinatura existir): 100.000 vCore-segundos
de processamento por mês e 32 GB de dados, e o banco **pausa sozinho** quando a cota do mês acaba, até o mês seguinte. Esse é o modo que você
vai escolher, e é ele que garante que **nada é cobrado**. A cota zera todo dia 1º. (Detalhes oficiais:
[learn.microsoft.com/azure/azure-sql/database/free-offer](https://learn.microsoft.com/azure/azure-sql/database/free-offer).)

- A conta do Azure **exige cartão** (internacional) e telefone para provar que você é uma pessoa. A Microsoft não cobra nada se você
  escolher "pausar ao acabar a cota" (passo 1.3). Se você não tem cartão, avise: a alternativa é rodar o SQL Server no seu próprio
  computador (veja `docs/BANCO.md`), mas aí o servidor da internet não alcança o banco.
- **A cota é mensal.** O banco fica "acordado" enquanto alguém usa o app e por um tempo depois. Como estimativa, 100.000 vCore-segundos
  dão algo como 50 horas por mês de banco acordado (cálculo aproximado, a Microsoft mostra o consumo real no portal). Para testes
  espalhados no mês, sobra; deixar o banco acordado 24 horas por dia não.
- Depois de parado, o banco leva até ~1 minuto para **acordar** na próxima vez. O servidor já sabe esperar e tenta de novo sozinho.

**Render (plano gratuito)** — o serviço dorme depois de um tempo sem uso (cerca de 15 minutos, segundo a documentação do Render que eu conheço; confira no plano) e a primeira visita seguinte leva cerca de 1 minuto para acordar.
O plano gratuito **bloqueia o envio de e-mail** ([aviso do Render](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)):
o código de "esqueci minha senha" aparece no **log do serviço** (veja "Recuperar senha" no fim). O cadastro não depende de e-mail.

---

## Passo 1 — Banco de dados no Azure (grátis)

### 1.1 Criar a conta

1. Entre em <https://azure.microsoft.com/free> e crie a conta (e-mail, telefone, cartão para verificação).
2. Abra o portal: <https://portal.azure.com>.

### 1.2 Criar o banco com a oferta gratuita

1. No portal, procure **"Bancos de dados SQL"** (SQL databases) e clique em **Criar**.
2. Na parte de cima da tela aparece o botão **"Aplicar oferta gratuita"** (Apply offer). Clique nele. É isso que deixa o banco grátis. (Se não achar, em "Computação + armazenamento" escolha a opção marcada como **Free offer**/gratuita.)
3. Preencha:
   - **Grupo de recursos:** crie um novo, por exemplo `bolso-certo`.
   - **Nome do banco de dados:** `bolso`.
   - **Servidor:** **Criar novo** e informe:
     - Nome do servidor: algo único, por exemplo `bolso-certo-seunome` (o endereço fica `bolso-certo-seunome.database.windows.net`);
     - Localização: **East US 2** (fica perto do servidor do Render, que é em Virginia). Se a oferta gratuita não aparecer para essa região, escolha outra dos EUA;
     - Método de autenticação: **Usar autenticação do SQL** (SQL authentication);
     - Logon do administrador do servidor: por exemplo `bolsoadmin`;
     - **Senha:** crie uma **forte e sem ponto e vírgula (;)** e **guarde num lugar seguro**.
4. **Comportamento quando o limite gratuito for atingido:** deixe **"Pausar o banco de dados automaticamente até o próximo mês"**
   (Auto-pause the database until next month). **Não** escolha "continuar usando por cobrança adicional".
5. Aba **Rede** (Networking):
   - Método de conectividade: **Ponto de extremidade público** (Public endpoint);
   - **Adicionar o endereço IP do cliente atual:** **Sim** (assim o SSMS do seu PC consegue entrar);
   - Permitir que serviços do Azure acessem o servidor: pode deixar **Não**.
6. **Revisar + criar** → **Criar**. Leva alguns minutos.

### 1.3 Liberar o Render no firewall do banco

O banco só aceita conexões de endereços liberados. O servidor do Render vai precisar de uma liberação (você faz depois do passo 2,
quando o Render mostrar os endereços dele — o guia lembra). Por ora, siga para o passo 1.4.

### 1.4 Pegar o texto de conexão

1. No portal, abra o banco `bolso` → menu **"Cadeias de conexão"** (Connection strings) → aba **ADO.NET (autenticação do SQL)**.
2. Copie o texto. Ele é parecido com:
   ```
   Server=tcp:bolso-certo-seunome.database.windows.net,1433;Initial Catalog=bolso;Persist Security Info=False;User ID=bolsoadmin;Password={your_password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
   ```
3. Troque `{your_password}` pela senha que você criou. **Esse texto é uma senha:** não o coloque em arquivos do projeto, nem em mensagens.
   Você vai colar ele só no painel do Render (passo 2) e, se quiser carregar planilhas do seu PC, numa variável de ambiente temporária (passo 4).

### 1.5 Conferir pelo SSMS (opcional, recomendado)

1. No SSMS: **Conectar** → Tipo de servidor: *Mecanismo de Banco de Dados* → Nome do servidor: `bolso-certo-seunome.database.windows.net`.
2. Autenticação: **Autenticação do SQL Server**, com o logon e a senha do passo 1.2.
3. Clique em **Opções >>** → aba **Propriedades da Conexão** → **Conectar ao banco de dados:** `bolso`.
4. Conectar. Por enquanto o banco está vazio; as tabelas são criadas sozinhas na primeira vez que o servidor ligar (passo 2).

> Se o SSMS disser que seu IP não tem acesso, adicione-o em: portal → seu **servidor** SQL → **Rede** → **Adicionar o endereço IP do cliente**.

---

## Passo 2 — Servidor no Render (grátis)

1. Crie a conta em <https://render.com> (pode entrar com o GitHub). Pelo que o Render informa, o plano gratuito não exige cartão; se ele pedir, confira que o serviço está marcado como **Free**.
2. No painel: **New +** → **Blueprint** → conecte sua conta do GitHub e escolha o repositório `luizedup-stack/bolso-certo`.
   O Render lê o arquivo `render.yaml` do projeto e já sabe tudo (como montar, como iniciar, quais variáveis existem).
3. Ele pede os valores das variáveis marcadas como secretas. Preencha:

   | Variável | O que colocar |
   |---|---|
   | `BANCO_URL` | O texto de conexão do passo 1.4, **já com a senha**. |
   | `ADMIN_EMAIL` | Seu e-mail de desenvolvedor (a conta que vê todos os mercados), por exemplo `luiz@seudominio.com`. |
   | `ADMIN_SENHA` | Uma senha forte, de pelo menos 8 caracteres. |

   As outras variáveis já vêm preenchidas pelo `render.yaml` (o `JWT_SECRET` é gerado pelo próprio Render).
4. **Apply** / **Deploy**. A primeira montagem leva alguns minutos. Acompanhe a aba **Logs**. Quando tudo der certo, aparecem estas linhas:
   ```
   [banco] Conectando ao banco (...)
   [banco] Atualizando o banco: 001-criar-tabelas.sql
   [banco] Atualizando o banco: 002-configuracao.sql
   [banco] Banco conectado.
   Dados de teste carregados: 4 planilhas, 113 produtos.
   Bolso Certo API em http://localhost:...
   ```
5. O endereço do serviço aparece no topo da página, parecido com `https://bolso-certo.onrender.com`. **Esse é o endereço do seu servidor.**
   Abra `https://bolso-certo.onrender.com` no navegador: ele leva ao painel. Entre com `ADMIN_EMAIL` e `ADMIN_SENHA`.

### Se o log mostrar erro de conexão com o banco

É quase sempre o firewall do Azure (passo 1.3). Faça assim:

1. No Render, abra seu serviço e procure os **endereços IP de saída** (Outbound IP addresses; costuma ficar no botão **Connect**).
   A página <https://render.com/docs/outbound-ip-addresses> explica onde ver.
2. No portal do Azure: seu **servidor** SQL → **Rede** → **Regras de firewall** → **Adicionar regra de firewall**, uma para cada IP
   (início = fim = o IP). Salve.
3. No Render: **Manual Deploy** → **Restart service**.

*Plano B só para os testes:* uma regra com início `0.0.0.0` e fim `255.255.255.255` libera qualquer endereço. A conexão continua criptografada e
protegida por usuário e senha, mas **apague essa regra assim que terminar** os testes.

---

## Passo 3 — Programa de Windows e app do celular usando o servidor

### Programa de Windows ("Bolso Certo - Mercado")

Duas formas, escolha uma:

- **Já gerar o programa apontando para a nuvem** (bom para entregar a outras pessoas). No PowerShell, na pasta do projeto:
  ```
  $env:BOLSO_URL_NUVEM = "https://bolso-certo.onrender.com"
  npm run construir:exe
  ```
- **Trocar num programa que você já tem**: abra o programa → menu **Bolso Certo → Servidor na nuvem…** → cole o endereço → **Salvar e reiniciar**.
  (Para voltar a usar tudo só no computador, deixe o campo em branco.)

No modo nuvem o programa não liga nada no seu computador: ele abre o painel que está no servidor, e os dados ficam no banco. Se o servidor
estiver dormindo, a janela mostra "Conectando ao servidor na nuvem…" e abre sozinha quando ele acordar.

### App do celular

Na primeira tela do app, toque em **Configurar servidor** e digite o endereço (pode ser `bolso-certo.onrender.com`; o app põe o `https://`).
Não precisa gerar o APK de novo. Para entregar a outras pessoas um **APK que já nasce apontando para o servidor** (ninguém precisa configurar nada),
use o gerador do GitHub (abaixo).

> Uma **cópia salva do APK atual** (já apontando para `https://bolso-certo.onrender.com`) fica no repositório, em `releases/bolso-certo.apk`, com os detalhes em `releases/LEIA-ME.md`.

#### APK pronto para as pessoas testarem (gerado pelo GitHub, sem instalar nada no seu PC)

1. No GitHub, abra o repositório → aba **Actions** → à esquerda, **Gerar APK** → botão **Run workflow** (campo "servidor" já vem com
   `https://bolso-certo.onrender.com`; confirme e clique no botão verde **Run workflow**).
2. Espere de 15 a 25 minutos (o círculo amarelo vira ✔ verde). Se ficar ❌, abra a execução e me mande o texto do erro.
3. Abra a execução concluída, role até **Artifacts** e baixe **`bolso-certo-apk`**. É um `.zip`; dentro dele está o **`bolso-certo.apk`**.
4. Mande o `.apk` para o pessoal (WhatsApp, Drive...). No celular: abrir o arquivo → o Android pede para permitir "instalar apps desconhecidos" → instalar.

O app já abre usando o servidor. A primeira consulta depois de um tempo parado pode levar até ~1 minuto (servidor e banco acordando). O APK usa a chave de
teste do Android (serve para instalar direto, não para publicar na Play Store). **Atualizar quem já tem o app:** o tester só abre o `.apk` novo e toca em **Atualizar**; a conta e os dados ficam, não precisa desinstalar nem baixar nada de novo.
O Android aceita a atualização quando o pacote e a assinatura são os mesmos (são: todos os APKs usam a mesma chave de teste) e o **número da versão não é menor**.
Por isso, **antes de gerar um APK novo, suba `android.versionCode` (e `version`) em `apps/mobile/app.json`** (hoje: versão 1.1.0, código 2). Se o Android recusar mesmo assim,
é sinal de que o APK antigo foi assinado com outra chave: aí vale desinstalar o antigo uma vez.

Na primeira busca depois de um tempo parado o app pode demorar até ~1 minuto (servidor e banco acordando). Isso é do plano gratuito.

---

## Passo 4 — Colocar suas planilhas reais no banco (Atacadão, Carrefour...)

Os 4 mercados que sobem sozinhos são **inventados**. Para usar as suas planilhas reais (pasta `dados-reais/`, que fica só no seu PC):

**Pelo painel (mais simples):** entre como administrador → **Enviar planilha** → escolha o mercado e o arquivo `.xlsx`.

**Em lote, direto do seu PC** (PowerShell, na pasta do projeto, depois do `npm install`):
```
$env:BANCO_URL = "Server=tcp:...;Initial Catalog=bolso;User ID=...;Password=...;Encrypt=True"
npm run carregar -w @mercado/api -- ..\..\dados-reais
```
Ele manda todas as planilhas da pasta para o banco (se uma já existia, os preços da planilha substituem os do banco).
Seu IP precisa estar liberado no firewall (passo 1.5). Para tirar os 4 mercados inventados: painel → **Administração** → remover.

---

## Servidor dormindo: o que o app faz e como evitar a espera

O plano gratuito dorme sem uso (o Render depois de ~15 minutos; o banco do Azure também). Na primeira consulta depois disso, o servidor leva de 30 a 60 segundos para ligar.
Nesse tempo ele responde "ainda ligando" (502/503/504), e o **app espera e tenta de novo sozinho**, mostrando a faixa "Acordando o servidor…" em vez de um erro
(a partir da versão 1.1.1 do app). Quando o banco é o que está acordando, o servidor responde 503 com o aviso "O servidor está acordando".

Para o teste de hoje não ter espera nenhuma, **acorde tudo antes**: abra no navegador `https://bolso-certo.onrender.com/saude/banco` e espere aparecer `{"status":"ok"}`.

**Já vem pronto:** `.github/workflows/manter-servidor-acordado.yml` abre `/saude` a cada 5 minutos pelo GitHub Actions (grátis, sem conta nova; só roda depois de estar no ramo `main`; o GitHub pode desligá-lo se o repositório ficar 60 dias sem nenhuma atividade, e é só reativar na aba Actions). Isso mantém o **Render** acordado; o **banco do Azure** continua dormindo quando ninguém usa (a primeira busca depois de um tempo ainda leva até ~1 minuto). Mantê-lo ligado 24 horas por dia gastaria a cota gratuita do mês e exigiria um plano pago do Azure. Sem esse recurso, ou para algo mais confiável:

Para o servidor do Render **não dormir** enquanto os testers usam, um serviço gratuito de monitoramento (por exemplo o UptimeRobot, com conta própria) pode abrir
`https://bolso-certo.onrender.com/saude` a cada 5 minutos. Essa rota **não toca no banco**, então o banco do Azure continua dormindo quando ninguém usa (e não gasta a cota gratuita).
O banco acorda sozinho na primeira busca de verdade. Não use `/saude/banco` no monitoramento: ela acordaria o banco o tempo todo e gastaria a cota do mês.

## Fotos dos produtos

A foto é do **código de barras** e fica **guardada no banco** (um JPEG pequeno, uns 13 KB), então o app não depende de nenhum outro site na hora de mostrar. De onde ela vem, em ordem:

1. **Foto enviada pelo dono do mercado no painel** (Produtos → Enviar foto): vale sempre.
2. **Coluna "Foto" da planilha** (link `https://...` da imagem do produto): o servidor baixa, reduz e guarda. É a melhor fonte, porque é a foto do produto **exato** que a loja vende.
3. **Open Food Facts**, procurado sozinho pelo código de barras (banco aberto; cobre só parte dos produtos). Opcionalmente (`FOTOS_POR_NOME=1`) também pelo **nome** do produto, só entre produtos do Brasil e só se o nome for parecido o bastante.
4. **Foto ilustrativa do TIPO de produto** (último recurso): o sistema traz um banco de fotos reais, uma por tipo (leite, arroz, papel higiênico...), em `apps/api/dados/fotos-ilustrativas/`.
   Os tipos que ainda não têm imagem lá, **o próprio servidor completa sozinho**: procura uma foto representativa do tipo no Open Food Facts (uma busca por tipo, não por produto), guarda no banco de dados e reaproveita.
   Um "Leite UHT Integral Vale Branco" sem foto própria recebe a foto de um leite de verdade, **marcada como "ilustrativa"** no app e no painel, para ninguém achar que é o produto exato.
   Quando a foto específica aparece, ela troca a ilustrativa sozinha.

`FOTOS_ILUSTRATIVAS` (ligada por padrão **durante os testes**; `0` desliga) controla o item 4 e `FOTOS_POR_NOME` (desligada; `1` liga) a busca por nome do item 3. Quando os produtos forem todos reais, com foto
pela planilha, desligue `FOTOS_ILUSTRATIVAS`, para nenhum produto receber foto aproximada.
Tudo isso roda em segundo plano, devagar (uma consulta por vez), assim que o servidor sobe e sempre que entram produtos novos. Produtos que nenhuma fonte tem ficam "Sem foto" até alguém
enviar a foto à mão. Para ver quantos já têm foto, use as consultas de `docs/BANCO.md`. O servidor gratuito dorme sem uso, então esse trabalho só avança enquanto ele estiver acordado.

### Para ter fotos nos produtos reais (Atacadão e Carrefour)

As ferramentas de coleta (`ferramentas/coleta/`) agora também trazem o **link da foto** de cada produto (do catálogo do Atacadão e dos dados da página do Carrefour) e o gravam na coluna **Foto**
da planilha. No computador onde você coleta (o que tem o Node instalado), na pasta do projeto:

```
node ferramentas/coleta/coletar-atacadao.mjs
node ferramentas/coleta/coletar-carrefour.mjs 900
node ferramentas/coleta/gerar-planilhas.mjs
```

Depois envie as duas planilhas pelo painel (administrador → **Enviar planilha**). Em poucos minutos o servidor baixa as fotos. O relatório do envio avisa se algum link de foto foi ignorado.
(Se as planilhas já estavam no painel, enviar de novo só atualiza os preços e acrescenta as fotos.)

> Essas fotos e dados vêm dos sites das redes **sem autorização delas**: servem para testar. Para publicar de verdade, use fotos que você tem direito de usar (as dos próprios mercados parceiros, ou enviadas por eles).

Para procurar de uma vez, a partir do seu PC, as fotos que faltam: `npm run fotos -w @mercado/api` com `BANCO_URL` definida (leva alguns minutos para muitos produtos).

## Dia a dia

- **Ver os dados:** SSMS → banco `bolso` → tabelas `dbo.Mercados`, `dbo.Ofertas`, `dbo.Usuarios`, `dbo.Buscas`. Consultas prontas em `docs/BANCO.md`.
- **Atualizar o servidor:** cada `git push` para a branch `main` faz o Render montar e publicar de novo sozinho. Os dados do banco não são tocados;
  as tabelas só mudam por arquivos numerados em `apps/api/src/banco/migracoes/` (o servidor aplica os que faltam ao ligar).
- **Recuperar senha de alguém (enquanto não há e-mail):** a pessoa pede "Esqueci minha senha" e você lê o código no **Logs** do Render
  (linha `[e-mail]`). Cada código vale por 1 hora.
- **Desligar tudo:** Render → serviço → **Suspend**. No Azure, o banco pausa sozinho; para apagar de vez, apague o grupo de recursos `bolso-certo`.

## Segurança (o que está e o que não está pronto)

- O banco aceita só conexões criptografadas e com usuário e senha; só os IPs liberados no firewall entram.
- Nunca coloque o texto de conexão, `ADMIN_SENHA` ou `JWT_SECRET` em arquivos do projeto: eles ficam só no painel do Render.
- Ainda **não** está pronto para o público: política de privacidade sem revisão jurídica, e-mail real, restringir o CORS ao endereço do painel,
  backups além dos que o Azure faz por conta própria. A lista completa está no fim do `README.md`.
- O limite de tentativas de login conta por pessoa usando o cabeçalho `X-Forwarded-For` do Render; é suficiente para o piloto, mas quem
  fabricar esse cabeçalho pode contornar o limite por endereço.
