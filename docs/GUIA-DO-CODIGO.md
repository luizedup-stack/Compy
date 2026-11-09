# Guia do código do Compy

Este guia é um mapa: diz **onde fica cada coisa** e **onde mexer** para cada tipo de mudança. Todo arquivo de código
tem comentários em português no topo (para que serve) e nos trechos menos óbvios.

## As peças

| Pasta | O que é | Quem usa |
|---|---|---|
| `apps/api` | O **servidor**: login, cadastro, produtos, busca. Guarda os dados num banco SQL Server (ou em memória, nos testes). Na hospedagem entrega também o painel. | As outras peças conversam com ele |
| `apps/painel` | O site do **mercado** (cadastro do mercado, produtos, planilha). Roda dentro do programa de computador. | Mercado e desenvolvedor |
| `apps/desktop` | O **programa de Windows** "Compy Mercado": junta a API e o painel num `.exe`. | Mercado |
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

**Fotos dos produtos** → a foto é do código de barras.
- busca automática no Open Food Facts: `apps/api/src/fotos/openFoodFacts.ts` (consulta e validação da resposta) e `apps/api/src/fotos/gerenciador.ts` (fila devagar, em segundo plano; não procura o mesmo produto duas vezes);
- envio pelo mercado: `apps/api/src/rotas/painel.ts` (`PUT/DELETE /painel/produtos/:codigo/foto`), conferência da imagem em `apps/api/src/fotos/imagem.ts`, tela em `apps/painel/src/Produtos.tsx` e redução da imagem em `apps/painel/src/foto.ts`;
- entrega da foto: `apps/api/src/rotas/fotos.ts` (`GET /fotos/:codigo`); no app, `apps/mobile/src/componentes/FotoDoProduto.tsx`;
- coluna "Foto" da planilha: `apps/api/src/planilha/importar.ts` (guarda o link); o servidor baixa e reduz a imagem em `apps/api/src/fotos/baixar.ts` (com proteção contra links para a rede interna) e o `gerenciador.ts` guarda no banco;
- foto ilustrativa do tipo de produto: banco de imagens em `apps/api/dados/fotos-ilustrativas/` (montado por `src/scripts/montarBancoDeFotos.ts`, créditos em `CREDITOS.md`), escolha pelo nome em `apps/api/src/fotos/ilustrativas.ts`; `apps/api/src/fotos/embutidas.ts` entrega essa foto na hora (catálogo, busca, `/fotos/:codigo`, produtos do mercado) sem depender do gerenciador nem do banco de dados; busca pelo nome em `openFoodFacts.ts`;
- armazenamento: tabela `FotosProduto` (`003-fotos.sql`, `004-fotos-da-planilha.sql`) e os métodos `*Foto*` do repositório; ferramenta em lote `apps/api/src/scripts/fotos.ts`;
- coleta das fotos dos sites: `ferramentas/coleta/foto.mjs` (usado pelos coletores) e a coluna "Foto" em `gerar-planilhas.mjs`.

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
| `npm run gerar-icones` | refaz os ícones a partir de `marca/icone-compy.svg` |

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

## Fotos enviadas pelo mercado (planilha e painel) e a marca Compy

- **Foto do mercado**: vale para todos só onde o produto não tem foto de verdade; onde já tem, a que existia continua para os outros e a do mercado fica guardada só para ele (`salvarFotosDoMercado` em `apps/api/src/repositorio.ts`, tabela `FotosDoMercado`, migração `007`). `GET /fotos/:codigo?mercadoId=N` entrega a própria quando existe; o painel e a lista de produtos do mercado no aplicativo usam esse endereço.
- **Planilha**: a coluna **Foto** aceita o link (`https://...`) ou a imagem colada sobre a célula (lida em `apps/api/src/planilha/importar.ts`, `lerImagensDaPlanilha`; imagem fora da coluna Foto é ignorada). Links são baixados em segundo plano pelo gerenciador de fotos; imagens coladas já entram prontas. A aba "Instruções" do modelo e a tela "Enviar planilha" trazem a dica de pedir a uma IA para ajustar a planilha ao modelo.
- **Marca Compy**: desenhos em `marca/*.svg`; `npm run gerar-icones` refaz os ícones do app, do programa e do painel; cores e fonte (Poppins) estão em `apps/painel/src/estilos.css` e `apps/mobile/src/tema.ts`. O nome visível é "Compy" (o programa de Windows, "Compy Mercado"); os identificadores internos (pacote `br.com.bolsocerto.app`, pasta de dados do programa, chaves do navegador) continuam os antigos para não perder dados nem a atualização por cima do app.

