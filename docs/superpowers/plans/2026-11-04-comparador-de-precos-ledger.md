# SDD ledger — plan: docs/superpowers/plans/2026-11-04-comparador-de-precos.md

Spec: docs/superpowers/specs/2026-11-04-comparador-de-precos-design.md (reachable, binding authority)
Repo: C:\Users\luiz.eduardo\Desktop\projeto mercado — branch `construcao-inicial`, base commit 5910788 (docs + dados-de-teste). Git identity set locally (Luiz Eduardo <luiz_edup@outlook.com>).
Commit trailer for every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
Models: implementers `sonnet` (prose-only briefs → mid-tier floor); reviewers `sonnet`; fix rounds 4-5 `opus`; final review `fable`.

## Pre-flight scan (pairs sharing a file or interface; each task's self-consistency)

| Row | Finding | Ruling |
|---|---|---|
| T1 vs T2/T3 (`packages/shared/src/index.ts`) | T1 says index.ts re-exports everything, but T2/T3 never list index.ts under files to modify | Ruling R1: T2 and T3 each add their new exports to `packages/shared/src/index.ts` |
| T1 own text | Step 2 says `git init`; repo already initialised by controller, `.gitignore` already exists (`node_modules`, `dist`, `.superpowers`) | Ruling R2: skip `git init`; extend existing `.gitignore` if needed; do not recreate repo |
| T5 own text | Files list `src/scripts/criar-admin.ts` but Step 3 says no script, admin comes from env in server.ts | Ruling R3: no `criar-admin.ts`. T5 instead produces `garantirAdmin(repo, email, senha): Promise<void>` in `apps/api/src/auth/admin.ts` (idempotent, admin already verified) and `hashSenha(senha: string): Promise<string>` in `apps/api/src/auth/senha.ts` (bcryptjs). T7 (`acesso`) and T10 (`server.ts`, seed) consume them |
| T6 vs T11/T13 | `RelatorioImportacao` is defined in api (`importar.ts`) but painel needs the type; painel cannot import from the api package | Ruling R4: define `RelatorioImportacao` in `packages/shared/src/constantes.ts` (exported from shared); api's `importar.ts` imports/re-exports it. T6 does this |
| T9 vs T16 | T9 returns "Oferta-resumida" items for `GET /mercados/:id/produtos`, type undefined; T16 consumes it | Ruling R5: T9 adds `ProdutoMercado { codigoBarras: string; nome: string; preco: number; quantidadeTexto: string \| null; precoPorUnidade: number \| null; unidade: Unidade \| null; atualizadoEm: string; diasDesdeAtualizacao: number; desatualizado: boolean }` to shared and the route returns `{ itens: ProdutoMercado[], total }` |
| T4 vs T5/T6/T7/T8/T9/T10 (`Repositorio`) | Interface defined once in T4; later tasks only call methods that exist (criarUsuario, acharUsuarioPorEmail, atualizarUsuario, excluirUsuario, guardarToken, consumirToken, criarMercado, acharMercado, acharMercadoPorChave, acharMercadoDoUsuario, atualizarMercado, listarMercados, salvarOferta, acharOferta, removerOferta, listarOfertasDoMercado, listarOfertasParaBusca, registrarBusca, listarBuscas, transacao) | none |
| T5 vs T7/T8/T9 (`app.ts`, `exigirPapel`) | T5 produces `construirApp`, `exigirPapel`; T7-T9 modify `app.ts` to register routes | none |
| T6 vs T7 (`importarPlanilha`, `gerarModelo`, `ErroPlanilha`, `Ator`) | Signatures consistent; `GET /planilhas/modelo` test relies on the model having blank Mercado name → ErroPlanilha mentioning "Nome do mercado" | none |
| T8 vs T12 | `ProdutoPainel` fields consumed by painel Produtos screen match | none |
| T9 vs T15 | `GrupoProduto`/`Oferta` from shared (T1) consumed unchanged | none |
| T10 vs T17 | seed + garantirAdmin + server used by fim-a-fim test | none |
| T1 own text | tests vs code: constants only; consistent | none |
| T2 own text | `validarCodigoBarras` zero-padding example is described, not given: implementer must build a valid EAN-13 starting with 0 and strip the zero | none (implementer's call) |
| T3 own text | tests vs code consistent (`12 rolos de 30 m` → null) | none |
| T4 own text | files and tests consistent | none |
| T5 own text | see R3 | R3 |
| T6 own text | tests vs code consistent; uses the 4 real files (26/29/29/29 rows) | none |
| T7, T8, T9, T10 own text | consistent | none |
| T11-T16 own text | consistent; T14/T15 depend on Expo + monorepo (Metro resolving `@mercado/shared` from `src/index.ts`) | none — implementer must make it work; escalate if blocked |
| T17 own text | consistent | none |

## Progress
- Ruling R6: product name is "Bolso Certo" (user, mid-execution). Logo committed in marca/. Name appears in user-visible text (painel title, app name, emails, /privacidade, README); internal package scope stays @mercado/* — costs a rename later if wrong. Plan Global Constraints updated accordingly.
- Task 1: complete (commits fb48d21..2fa19e8, review clean; reviewer: Approved, spec ✅)
- Task 1: minor (deferred): packages/shared/package.json has no "type":"module" (module NodeNext rejects extensionless imports otherwise, TS2835). Ruling R7: later packages must NOT set "type":"module" without moving to .js extensions or moduleResolution Bundler; check at final review.
- Task 1: minor (deferred): no `typecheck` script anywhere; constantes.test.ts only covers 3 constants (LIMITE_*, ABA_PRODUTOS unchecked).

## How to regenerate task briefs (the skill's `task-brief` script looks for "Task N" headings; this plan uses "Tarefa N")
awk -v n=N '/^```/{f=!f} !f && /^#+[ \t]+Tarefa[ \t]+[0-9]+/{t=($0 ~ ("^#+[ \t]+Tarefa[ \t]+" n "([^0-9]|$)"))} t{print}' docs/superpowers/plans/2026-11-04-comparador-de-precos.md > .superpowers/sdd/2026-11-04-comparador-de-precos/task-N-brief.md
(For Task 17 cut the brief at the line starting "## Fase seguinte".)
