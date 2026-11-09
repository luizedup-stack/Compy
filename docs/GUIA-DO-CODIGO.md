# Guia do código do Bolso Certo

Este guia é um mapa: diz **onde fica cada coisa** e **onde mexer** para cada tipo de mudança. Todo arquivo de código
tem comentários em português no topo (para que serve) e nos trechos menos óbvios.

## As peças

| Pasta | O que é | Quem usa |
|---|---|---|
| `apps/api` | O **servidor**: login, cadastro, produtos, busca. Guarda os dados num banco SQL Server (ou em memória, nos testes). Na hospedagem entrega também o painel. | As outras peças conversam com ele |
| `apps/painel` | O site do **mercado** (cadastro do mercado, produtos, planilha). Roda dentro do programa de computador. | Mercado e desenvolvedor |
| `apps/desktop` | O **programa de Windows** "Bolso Certo - Mercado": junta a API e o painel num `.exe`. | Mercado |
| `apps/mobile` | O **aplicativo do cliente** (Android): busca e compara preços, funciona sem internet. | Cliente |
| `packages/shared` | Regras usadas por todos: quantidade, preço por unidade, **busca** e comparação. | Todos |
| `marca/` | Logo e ícone (`.svg`). | |
| `dados-de-teste/` | Planilhas inventadas para teste. | |
| `docs/` | Guias e documentos de projeto (este guia, `HOSPEDAGEM.md`, `BANCO.md`, `EMAIL.md`, `GOOGLE.md`). | |
| `render.yaml` | Receita da hospedagem gratuita no Render. | |
| `exemplos/` | Planilha de exemplo para testar o envio de produtos. | |

## Onde mexer para...

**Mudar uma regra da busca ou da comparação de preços** → `packages/shared/src/busca.ts` (usada pelo servidor *e* pelo
app; um teste em `apps/api/src/rotas/catalogo.test.ts` garante que os dois dão o mesmo resultado).

**Mudar como a quantidade/preço por unidade é entendida** → `packages/shared/src/quantidade.ts`.

**Mudar o cadastro da conta (e-mail, senha, mensagens)** →
- servidor: `apps/api/src/auth/rotas.ts` (rotas `/auth/cadastro`, `/auth/cadastro-mercado`, `/auth/login`, `/auth/reenviar-codigo`...);
- tela do mercado: `apps/painel/src/CadastrarMercado.tsx`, `Login.tsx`, `ConfirmarEmail.tsx`;
- tela do cliente: `apps/mobile/src/telas/Cadastrar.tsx` e `apps/mobile/src/validacao.ts`.

**Tela inicial do app (lista de produtos já comparados)** → a conta está em `packages/shared/src/busca.ts` (`listarProdutosNoCatalogo`:
os vendidos em mais de um mercado primeiro); servidor `GET /produtos` em `apps/api/src/rotas/busca.ts`; tela em
`apps/mobile/src/telas/Busca.tsx` (sem texto digitado mostra a lista; com texto, o resultado da busca; "Carregar mais produtos").

**Perfil do cliente (foto, nome de usuário, e-mail, senha)** → servidor `apps/api/src/rotas/conta.ts` (`GET/PATCH /conta`,
`POST /conta/senha`); app `apps/mobile/src/componentes/Perfil.tsx` (dentro da tela Conta) e `apps/mobile/src/foto.ts` (escolher e reduzir a foto).

**Confirmação de e-mail** → desligada de propósito: contas novas nascem verificadas (`apps/api/src/auth/rotas.ts`). As rotas
`/auth/verificar-email` e `/auth/reenviar-verificacao` continuam, sem uso nas telas. Entrar com o Google: `docs/GOOGLE.md`.

**Dados do MERCADO (nome, endereço completo, telefone; vários mercados por usuário)** → o cadastro da conta é só e-mail e senha;
os dados do mercado são preenchidos em "Meu mercado":
- tela: `apps/painel/src/MeuMercado.tsx` e `FormularioMercado.tsx` (campos e conferências), seletor de mercado no topo em `App.tsx`;
- regras de CEP, telefone, UF e como o endereço vira uma linha: `packages/shared/src/endereco.ts`;
- preenchimento automático pelo CEP (consulta ao ViaCEP, serviço público): `apps/painel/src/viaCep.ts` e a função `aoMudarCep` em `FormularioMercado.tsx`;
- servidor: `apps/api/src/painel/dadosDoMercado.ts` (validação), `apps/api/src/rotas/meusMercados.ts` (listar e cadastrar mercado),
  `apps/api/src/painel/mercadoEscolhido.ts` (qual dos mercados do usuário está em uso; **checa que é dele**).

**Quem pode ver/editar o quê (cada mercado só vê o seu)** → `apps/api/src/rotas/painel.ts`, função
`exigirMercadoAtivo`: o mercado sempre cai no mercado dele; só o administrador (desenvolvedor) escolhe outro com `?mercadoId=`.

**Produtos de um mercado (criar à mão, editar, remover)** →
- servidor: `apps/api/src/rotas/painel.ts` (`POST/PATCH/DELETE /painel/produtos`);
- tela: `apps/painel/src/Produtos.tsx` (lista e edição) e `NovoProduto.tsx` (botão "Novo produto").

**Planilha Excel** → `apps/api/src/planilha/importar.ts` (regras de leitura) e `apps/painel/src/EnviarPlanilha.tsx`. Um mercado que envia
planilha **não** tem o nome/endereço trocados pela aba "Mercado" (só o administrador usa essa aba). Exemplo pronto: `exemplos/planilha-exemplo-para-subir.xlsx`.

**E-mail (códigos de confirmação)** → `apps/api/src/email.ts` (envio por SMTP), `apps/desktop/api-embutida.ts` e `main.cjs` (tela "Configurar e-mail"). Passo a passo: `docs/EMAIL.md`.

**Quem é o desenvolvedor (conta que vê tudo)** → e-mail `ADMIN_EMAIL` em `apps/desktop/main.cjs`; a senha é gerada na primeira
abertura (`senhaDoDesenvolvedor()` no mesmo arquivo) e a API a aplica em `apps/api/src/auth/admin.ts` (`sincronizarSenhaDoAdmin`).
No modo de teste com terminal, vale o que está no `iniciar-teste.ps1`. Para a internet, a API lê as variáveis `ADMIN_EMAIL`/`ADMIN_SENHA`.

**Acesso pela internet (túnel)** → `apps/desktop/main.cjs` (funções `ligarTunel`, `desligarTunel`, `paginaDeInternet`). O servidor confia no
cabeçalho `X-Forwarded-For` só vindo deste computador (`trustProxy` em `apps/api/src/app.ts`).

**O que o app do celular guarda para funcionar sem internet** → `apps/mobile/src/catalogo.ts` (a cópia),
`apps/mobile/src/api.ts` (usa o servidor e, se ele não responde, a cópia) e `apps/mobile/src/conexao.ts` (o aviso
"Sem conexão"). O servidor entrega a cópia em `GET /catalogo` (`apps/api/src/busca/buscar.ts`, função `montarCatalogo`).

**Cores e logo** → `apps/painel/src/estilos.css` (painel), `apps/mobile/src/tema.ts` (app), `marca/` e
`apps/desktop/gerar-icones.cjs` (ícones). Depois: `npm run gerar-icones`.

**Nome do programa ou do `.exe`** → `apps/desktop/construir.mjs` e `apps/desktop/main.cjs`.

**Onde os dados são guardados** → a interface é `apps/api/src/repositorio.ts`, com duas implementações que passam pelo **mesmo conjunto de testes**
(`apps/api/src/repositorio.contrato.ts`):
- `apps/api/src/repositorioSqlServer.ts` (o banco: usado quando `BANCO_URL` existe). Tabelas em `apps/api/src/banco/migracoes/*.sql` (aplicadas
  sozinhas ao ligar), conexão e tentativas em `apps/api/src/banco/conexao.ts`. Veja `docs/BANCO.md`;
- `apps/api/src/repositorioMemoria.ts` (memória, para testes e para o programa de Windows no modo local), que o programa grava em arquivo em `apps/desktop/api-embutida.ts`.

**Qual banco o servidor usa, carga dos dados de teste, painel e saúde** → `apps/api/src/server.ts` (abre o banco e liga tudo), `apps/api/src/servidor.ts`
(`montarServidor`: carga de teste só com banco vazio, painel em `/painel-web/`, rotas `/saude` e `/saude/banco`) e `apps/api/src/config.ts` (variáveis: `BANCO_URL`,
`PAINEL_DIST`, `CONFIAR_PROXY`...).

**Colocar planilhas reais no banco em lote** → `apps/api/src/scripts/carregar.ts` (`npm run carregar -w @mercado/api -- <pasta>`).

**Fotos dos produtos** → a foto é do código de barras. **Regra da foto enviada por um mercado** (`PUT /painel/produtos/:codigo/foto`, em `apps/api/src/rotas/painel.ts`): se o produto ainda não tem foto, a do mercado vira a de todos (tabela `FotosProduto`); se já tem, fica só para o mercado que a enviou (tabela `FotosProdutoMercado`, migração `007-fotos-do-mercado.sql`, métodos `*FotoDoMercado` do repositório), e a entrega usa `GET /fotos/:codigo?mercado=ID`. O mercado dono da foto de todos a substitui. Testes em `apps/api/src/rotas/fotos.test.ts`.
- busca automática no Open Food Facts: `apps/api/src/fotos/openFoodFacts.ts` (consulta e validação da resposta) e `apps/api/src/fotos/gerenciador.ts` (fila devagar, em segundo plano; não procura o mesmo produto duas vezes);
- envio pelo mercado: `apps/api/src/rotas/painel.ts` (`PUT/DELETE /painel/produtos/:codigo/foto`), conferência da imagem em `apps/api/src/fotos/imagem.ts`, tela em `apps/painel/src/Produtos.tsx` e redução da imagem em `apps/painel/src/foto.ts`;
- entrega da foto: `apps/api/src/rotas/fotos.ts` (`GET /fotos/:codigo`); no app, `apps/mobile/src/componentes/FotoDoProduto.tsx`;
- coluna "Foto" da planilha: `apps/api/src/planilha/importar.ts` (guarda o link); o servidor baixa e reduz a imagem em `apps/api/src/fotos/baixar.ts` (com proteção contra links para a rede interna) e o `gerenciador.ts` guarda no banco;
- foto ilustrativa do tipo de produto: banco de imagens em `apps/api/dados/fotos-ilustrativas/` (montado por `src/scripts/montarBancoDeFotos.ts`, créditos em `CREDITOS.md`), escolha pelo nome em `apps/api/src/fotos/ilustrativas.ts`; `apps/api/src/fotos/embutidas.ts` entrega essa foto na hora (catálogo, busca, `/fotos/:codigo`, produtos do mercado) sem depender do gerenciador nem do banco de dados; busca pelo nome em `openFoodFacts.ts`;
- armazenamento: tabela `FotosProduto` (`003-fotos.sql`, `004-fotos-da-planilha.sql`) e os métodos `*Foto*` do repositório; ferramenta em lote `apps/api/src/scripts/fotos.ts`;
- coleta das fotos dos sites: `ferramentas/coleta/foto.mjs` (usado pelos coletores) e a coluna "Foto" em `gerar-planilhas.mjs`.

**Coleta de produtos de várias redes (catálogos públicos)** → `ferramentas/coleta/coletar-vtex.mjs` coleta as redes que usam a plataforma VTEX
(Atacadão, Mambo, Savegnago, Oba, Sam's Club, Covabra, Hortifruti…; lista em `REDES`; `--listar` mostra todas): lê a árvore de categorias, percorre cada
categoria com 3 pedidos por vez e pausa entre eles (educado com o site), só guarda produto com código de barras válido e em estoque, e **continua de onde
parou** se for interrompido (`dados-reais/<rede>.json` + `<rede>.progresso.json`). Teste: `coletar-vtex.test.mjs`. O Carrefour tem coletor próprio
(`coletar-carrefour.mjs`). `gerar-planilhas.mjs` transforma os `.json` em planilhas `mercado-<rede>[-parte-NN].xlsx` (redes grandes são divididas em
partes de 4.500 linhas por causa do limite do importador). Como refazer e limites: `dados-reais/LEIA-ME.md`.

**Produtos que já vêm no programa de Windows** → as planilhas de `dados-reais/` são copiadas para dentro do programa (`apps/desktop/construir.mjs`,
`fontesDeDados`). `apps/desktop/api-embutida.ts`: se a "assinatura" das planilhas mudou (`dados-versao.txt`), os produtos são reimportados sozinhos ao
abrir, sem perder contas e correções; o menu "Atualizar produtos com as planilhas do programa" (`main.cjs`) faz isso na hora.

**Cópia dos produtos no celular com muitos produtos** → servidor responde `/catalogo` compactado (`@fastify/compress`, em `apps/api/src/app.ts`); o app
guarda a cópia em partes de 3.000 ofertas **compactadas** (gzip, `fflate`) em `apps/mobile/src/catalogo.ts` e renova a cada 30 minutos
(`PRAZO_RENOVAR_MS` em `apps/mobile/src/api.ts`). A lista da tela inicial é montada por `listarProdutosNoCatalogo` (`packages/shared/src/busca.ts`),
que ordena por um resumo leve e só monta os produtos da página pedida (0,2 s com 50 mil ofertas).

**App sem login e "Como chegar"** → o app abre sempre nas abas (`apps/mobile/src/navegacao.tsx`); Entrar e Cadastrar abrem por cima, a partir da aba Conta (`telas/Conta.tsx`). As rotas de leitura da API são públicas (`usuarioOpcional` em `apps/api/src/auth/guardas.ts`). A pergunta "Ir até o mercado?" e os links do Google Maps e do Waze estão em `apps/mobile/src/rota.ts`.

**Hospedagem** → `render.yaml` (como montar e iniciar no Render) e `docs/HOSPEDAGEM.md`. O painel compila com `PAINEL_BASE=/painel-web/` (`apps/painel/vite.config.ts`) e
fala com a API do mesmo endereço (`VITE_API_URL=` vazio, em `apps/painel/src/api.ts`).

**Programa de Windows no modo nuvem** → `apps/desktop/main.cjs` (funções `lerUrlNuvem`, `abrirNaNuvem`, `abrirConfigNuvem`) e `apps/desktop/nuvem.cjs` (validação do endereço, com teste).

## Comandos úteis (na pasta do projeto)

| Comando | Para quê |
|---|---|
| `npm test` | roda todos os testes (os do banco só com `BANCO_TESTE_URL`) |
| `npm run carregar -w @mercado/api -- <pasta>` | manda as planilhas de uma pasta para o banco (`BANCO_URL`) |
| `npm run construir:exe` | gera o programa de Windows em `programa/` |
| `npm run testar` | modo de teste com 3 janelas (API, painel e app web) |
| `npm run gerar-icones` | refaz os ícones a partir de `marca/icone-bolso-certo.svg` |

O APK do celular é gerado como descrito em `apps/mobile/README.md` (seção "Gerar o APK").

## Como a conversa entre as peças funciona

```
 Mercado (painel dentro do .exe) ──► API ◄── app do cliente
                                      │            │
                                  banco SQL Server └─ guarda uma cópia dos produtos no celular
                                  (ou memória, nos     e usa quando está sem internet
                                  testes locais)
```

O app do cliente **não depende** do programa do mercado estar aberto: ele usa a cópia guardada e atualiza os
produtos sozinho quando consegue falar com o servidor (ao abrir, ao voltar para o app e a cada consulta). O app em
si só é atualizado pela loja de aplicativos.

## Painel: acesso dos mercados e tema (claro/escuro)

- **Tirar acesso / Dar acesso novamente / Apagar** (Administração > Mercados, `apps/painel/src/admin/Mercados.tsx`): "Tirar acesso" põe o mercado em `status = 'removido'` e, se o prazo for temporário, guarda `removidoAte` (coluna da migração `006-acesso-temporario.sql`). Sem `removidoAte` o acesso é permanente. O servidor devolve o mercado sozinho quando o prazo acaba (`reativarMercadosVencidos`, a cada 5 min e ao listar). "Apagar" remove o mercado e as ofertas dele (`apagarMercado`). Rotas em `apps/api/src/rotas/admin.ts`.
- **Mercado sem acesso some do aplicativo na hora**: o catálogo guardado em memória (`rotas/lembrar.ts`) é descartado a cada escrita bem-sucedida (contador "geração" em `app.ts`).
- **Tema**: as cores ficam como variáveis no começo de `apps/painel/src/estilos.css` (claro = azul clarinho e branco; escuro por `prefers-color-scheme` ou pelo botão do cabeçalho). A escolha fica no navegador (`apps/painel/src/tema.ts`).

