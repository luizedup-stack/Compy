# Guia do código do Bolso Certo

Este guia é um mapa: diz **onde fica cada coisa** e **onde mexer** para cada tipo de mudança. Todo arquivo de código
tem comentários em português no topo (para que serve) e nos trechos menos óbvios.

## As peças

| Pasta | O que é | Quem usa |
|---|---|---|
| `apps/api` | O **servidor**: login, cadastro, produtos, busca. Guarda os dados (hoje em memória). | As outras peças conversam com ele |
| `apps/painel` | O site do **mercado** (cadastro do mercado, produtos, planilha). Roda dentro do programa de computador. | Mercado e desenvolvedor |
| `apps/desktop` | O **programa de Windows** "Bolso Certo - Mercado": junta a API e o painel num `.exe`. | Mercado |
| `apps/mobile` | O **aplicativo do cliente** (Android): busca e compara preços, funciona sem internet. | Cliente |
| `packages/shared` | Regras usadas por todos: quantidade, preço por unidade, **busca** e comparação. | Todos |
| `marca/` | Logo e ícone (`.svg`). | |
| `dados-de-teste/` | Planilhas inventadas para teste. | |
| `docs/` | Guias e documentos de projeto (este guia, `EMAIL.md`). | |
| `exemplos/` | Planilha de exemplo para testar o envio de produtos. | |

## Onde mexer para...

**Mudar uma regra da busca ou da comparação de preços** → `packages/shared/src/busca.ts` (usada pelo servidor *e* pelo
app; um teste em `apps/api/src/rotas/catalogo.test.ts` garante que os dois dão o mesmo resultado).

**Mudar como a quantidade/preço por unidade é entendida** → `packages/shared/src/quantidade.ts`.

**Mudar o cadastro da conta (e-mail, senha, mensagens)** →
- servidor: `apps/api/src/auth/rotas.ts` (rotas `/auth/cadastro`, `/auth/cadastro-mercado`, `/auth/login`, `/auth/reenviar-codigo`...);
- tela do mercado: `apps/painel/src/CadastrarMercado.tsx`, `Login.tsx`, `ConfirmarEmail.tsx`;
- tela do cliente: `apps/mobile/src/telas/Cadastrar.tsx` e `apps/mobile/src/validacao.ts`.

**Dados do MERCADO (nome, endereço completo, telefone; vários mercados por usuário)** → o cadastro da conta é só e-mail e senha;
os dados do mercado são preenchidos em "Meu mercado":
- tela: `apps/painel/src/MeuMercado.tsx` e `FormularioMercado.tsx` (campos e conferências), seletor de mercado no topo em `App.tsx`;
- regras de CEP, telefone, UF e como o endereço vira uma linha: `packages/shared/src/endereco.ts`;
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

**Quem é o desenvolvedor (conta que vê tudo)** → `ADMIN_EMAIL` e `ADMIN_SENHA` em `apps/desktop/main.cjs` (programa) e
no `iniciar-teste.ps1` (modo de teste com terminal). Para a internet, a API lê as variáveis de ambiente de mesmo nome.

**O que o app do celular guarda para funcionar sem internet** → `apps/mobile/src/catalogo.ts` (a cópia),
`apps/mobile/src/api.ts` (usa o servidor e, se ele não responde, a cópia) e `apps/mobile/src/conexao.ts` (o aviso
"Sem conexão"). O servidor entrega a cópia em `GET /catalogo` (`apps/api/src/busca/buscar.ts`, função `montarCatalogo`).

**Cores e logo** → `apps/painel/src/estilos.css` (painel), `apps/mobile/src/tema.ts` (app), `marca/` e
`apps/desktop/gerar-icones.cjs` (ícones). Depois: `npm run gerar-icones`.

**Nome do programa ou do `.exe`** → `apps/desktop/construir.mjs` e `apps/desktop/main.cjs`.

**Onde os dados são guardados** → `apps/api/src/repositorioMemoria.ts` (em memória, trocável por banco de dados: a
interface está em `apps/api/src/repositorio.ts`) e `apps/desktop/api-embutida.ts` (grava/restaura em arquivo).

## Comandos úteis (na pasta do projeto)

| Comando | Para quê |
|---|---|
| `npm test` | roda todos os testes |
| `npm run construir:exe` | gera o programa de Windows em `programa/` |
| `npm run testar` | modo de teste com 3 janelas (API, painel e app web) |
| `npm run gerar-icones` | refaz os ícones a partir de `marca/icone-bolso-certo.svg` |

O APK do celular é gerado como descrito em `apps/mobile/README.md` (seção "Gerar o APK").

## Como a conversa entre as peças funciona

```
 Mercado (painel dentro do .exe) ──► API ◄── app do cliente
                                      │            │
                                  dados (hoje      └─ guarda uma cópia dos produtos no celular
                                  em memória)         e usa quando está sem internet
```

O app do cliente **não depende** do programa do mercado estar aberto: ele usa a cópia guardada e atualiza os
produtos sozinho quando consegue falar com o servidor (ao abrir, ao voltar para o app e a cada consulta). O app em
si só é atualizado pela loja de aplicativos.
