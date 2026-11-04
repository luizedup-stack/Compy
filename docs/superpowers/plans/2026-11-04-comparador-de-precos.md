# Comparador de preços de supermercados — Plano de construção

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam caixas `- [ ]` para acompanhamento.

**Objetivo:** construir o painel web do mercado (envio de planilha e correção manual) e o app de celular do cliente (busca e comparação de preços), com um servidor no meio.

**Arquitetura:** monorepo TypeScript com 4 pacotes: `shared` (regras puras: texto, código de barras, preço, quantidade), `api` (Fastify), `painel` (React) e `mobile` (Expo/React Native). Toda a regra de negócio fica em `shared` e `api`; painel e app só exibem. A planilha é a única porta de entrada de produtos (spec seção 5). **Sem banco de dados nesta fase** (decisão do Luiz): os dados ficam em memória atrás de uma interface `Repositorio`; o banco entra depois como outra implementação dessa mesma interface, sem mudar o resto.

**Tecnologias:** Node 24 e npm workspaces, TypeScript, vitest, Fastify 5 (`@fastify/jwt`, `@fastify/multipart`, `@fastify/cors`), `exceljs`, `bcryptjs`, `zod`, React + Vite, Expo + jest-expo.

**Spec:** `docs/superpowers/specs/2026-11-04-comparador-de-precos-design.md` (leia junto com este plano).

**Ambiente verificado:** Node 24.17, npm 11 e Git 2.56 instalados. Docker e PostgreSQL não estão instalados e **não são necessários nesta fase**.

**Consequência de não ter banco:** tudo que é enviado ou cadastrado some quando o servidor reinicia. Em desenvolvimento o servidor recarrega os 4 mercados de `dados-de-teste/` ao iniciar, então a busca já nasce com dados.

## Restrições globais

Valores copiados do spec; valem para todas as tarefas.

- Piloto na Vila Sônia (São Paulo); uso **gratuito** para mercados e clientes; promoções **desligadas** na primeira versão.
- Planilha Excel com **duas abas**: `Mercado` (linhas `Nome do mercado*` e `Endereço*`, valor na coluna B) e `Produtos` (colunas `Código de barras*`, `Produto*`, `Preço*`, `Quantidade`, `Categoria`, `Disponível`).
- Obrigatórios: código de barras, nome e preço do produto; nome e endereço do mercado. `Disponível` em branco vale `sim`.
- Preço aceita `14,90` e `14.90`. Linha com erro não derruba a planilha: importa as boas e devolve a lista das ruins.
- Reenviar a planilha atualiza (chave: mercado + código de barras) e **a planilha vence a correção manual**. Produto que não veio na planilha continua, com a idade do preço aumentando.
- Publicação **automática**, sem aprovação. Só o administrador cria mercados novos; mercado com login que envia nome/endereço diferentes atualiza o próprio cadastro.
- Unidades entendidas: `g`, `kg`, `ml`, `L`, `un`/`unidade`, `rolo(s)`, `dúzia`, e `2 x 500 g`. Fora: "leve 3 pague 2" e rolos x metros. Preço por unidade só compara a mesma unidade.
- Ordem padrão: menor preço por unidade; sem quantidade entendida vêm depois, por preço da embalagem, com aviso. Alternativa: só preço da embalagem.
- Preço velho: mais de **7 dias**. Só avisa; nunca esconde nem rebaixa.
- O app do cliente **não edita nada**. Sem filtro de localização.
- Cliente: cadastro obrigatório (e-mail e senha), recuperação de senha, verificação de e-mail, exclusão de conta, política de privacidade.
- Aba **Cobrança** no painel dizendo "Gratuito por enquanto"; o modelo de dados já tem `contaSituacao` e campos de promoção, sem uso.
- Registrar as buscas feitas, sem painel de métricas.
- Textos de tela e mensagens em português do Brasil.
- **Nada de banco de dados** nesta fase: nenhuma dependência de `pg`, PGlite, SQL ou migrações.

## Foco da revisão

Entradas que o spec não menciona mas que acontecem na vida real. Cada linha tem o teste na tarefa que cuida do código.

1. **Código de barras que o Excel estraga** (célula numérica que perdeu o zero à esquerda ou virou notação científica) — esperado: aceitar quando o zero à esquerda resolve, senão erro claro na linha. Tarefas 2 e 6.
2. **Planilha fora do padrão** (aba faltando, cabeçalho em minúsculas ou sem acento, linhas vazias no fim, arquivo vazio ou que não é Excel) — esperado: cabeçalho tolerante; aba ou coluna faltando dá erro único e claro; linhas vazias são ignoradas. Tarefa 6.
3. **Busca com entrada estranha** (vazia, 1 letra, `%`, `_`, texto enorme, acento e erro de digitação) — esperado: vazia ou menos de 2 letras devolve lista vazia; `%` e `_` são texto comum; "papel higienico" e "papl higiênico" acham papel higiênico. Tarefa 9.
4. **Mesmo código com nomes e quantidades diferentes entre mercados** — esperado: um grupo só, com o nome mais comprido, cada oferta com seu próprio preço por unidade. Tarefa 9.
5. **Planilha enorme ou enviada duas vezes ao mesmo tempo** — esperado: acima de 5 MB ou 5000 linhas, erro claro e nada gravado; dois envios simultâneos não duplicam mercado nem produto. Tarefas 4 e 6.

## Estrutura de arquivos

```
package.json                       workspaces: packages/*, apps/*
tsconfig.base.json
packages/shared/src/
  constantes.ts                    nomes de abas/colunas, limites, tipos Oferta/GrupoProduto
  texto.ts                         normalizarTexto
  codigoBarras.ts                  validarCodigoBarras
  preco.ts                         parsePreco
  quantidade.ts                    parseQuantidade, precoPorUnidade
apps/api/src/
  repositorio.ts                   tipos + interface Repositorio
  repositorioMemoria.ts            criarRepositorioMemoria
  repositorio.contrato.ts          suíte de testes que qualquer Repositorio deve passar
  email.ts                         EmailSender
  app.ts                           construirApp
  auth/                            rotas + guardas de papel
  planilha/importar.ts             importarPlanilha
  planilha/modelo.ts               gerarModelo
  busca/similaridade.ts            similaridade (trigramas)
  busca/buscar.ts                  buscar
  rotas/                           planilhas, painel, admin, busca, mercados, privacidade
  scripts/                         seed.ts, criar-admin.ts
  server.ts                        ponto de entrada
apps/painel/src/                   React: login, enviar planilha, produtos, cobrança, admin
apps/mobile/                       Expo: login/cadastro, busca, mercados
```

---

### Tarefa 1: Monorepo, Git e pacote `shared` com as constantes

**Arquivos:**
- Criar: `package.json`, `tsconfig.base.json`, `.gitignore`, `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/constantes.ts`, `packages/shared/src/index.ts`
- Testar: `packages/shared/src/constantes.test.ts`

**Interfaces:**
- Produz (`@mercado/shared`): `ABA_MERCADO = 'Mercado'`, `ABA_PRODUTOS = 'Produtos'`, `COLUNAS_PRODUTOS` (tupla readonly, ordem do spec), `LIMITE_LINHAS = 5000`, `LIMITE_BYTES = 5 * 1024 * 1024`, `DIAS_PRECO_VELHO = 7`, `type Unidade = 'kg' | 'L' | 'un' | 'rolo'`, `interface Oferta`, `interface GrupoProduto`.

```ts
interface Oferta { mercadoId: number; mercadoNome: string; endereco: string; nomeNoMercado: string;
  preco: number; quantidadeTexto: string | null; precoPorUnidade: number | null; unidade: Unidade | null;
  atualizadoEm: string; diasDesdeAtualizacao: number; desatualizado: boolean }
interface GrupoProduto { codigoBarras: string; nome: string; ofertas: Oferta[] }
```

- [ ] **Passo 1: Teste que falha** — `constantes.test.ts`: `COLUNAS_PRODUTOS` é `['Código de barras','Produto','Preço','Quantidade','Categoria','Disponível']`; `DIAS_PRECO_VELHO` é 7; `ABA_MERCADO` é `'Mercado'`.
- [ ] **Passo 2:** `git init`, `npm install` e `npm test -w @mercado/shared`. Esperado: FAIL (arquivo não existe).
- [ ] **Passo 3:** criar a raiz com workspaces, `.gitignore` (`node_modules`, `dist`, `.superpowers`), tsconfig estrito (`strict`, `module: NodeNext`) e `constantes.ts` com os valores acima. `index.ts` reexporta tudo. O pacote expõe `main` e `types` apontando para `src/index.ts` (sem etapa de build; os consumidores usam tsx/Vite/Metro).
- [ ] **Passo 4:** `npm test -w @mercado/shared`. Esperado: PASS.
- [ ] **Passo 5: Commit** `chore: monorepo e constantes compartilhadas`.

---

### Tarefa 2: Texto, código de barras e preço (`shared`)

**Arquivos:**
- Criar: `packages/shared/src/texto.ts`, `codigoBarras.ts`, `preco.ts`
- Testar: `texto.test.ts`, `codigoBarras.test.ts`, `preco.test.ts` (mesma pasta)

**Interfaces:**
- Produz: `normalizarTexto(s: string): string`; `validarCodigoBarras(entrada: string | number): { ok: true; codigo: string } | { ok: false; motivo: string }`; `parsePreco(entrada: string | number): number | null`.

- [ ] **Passo 1: Testes que falham.**
  - `normalizarTexto('  PAPEL Higiênico  Fox ')` → `'papel higienico fox'`; `'Papel Hig. X'` → `'papel hig x'`; `'Det. Líq.'` → `'det liq'`.
  - `validarCodigoBarras('7890070035629')` → `{ ok: true, codigo: '7890070035629' }` (código do arquivo de teste do Mercado 3); dígito verificador errado (`'7890070035620'`) → `ok: false`; `'12ab'` → `ok: false`; EAN-8 válido `'96385074'` → ok; número `7890070035629` (célula numérica) → ok; número que perdeu o zero à esquerda (EAN-13 válido que começa com 0, entrada numérica com 12 dígitos) → ok depois de completar com zeros até 13; notação científica (`'7.89007E+12'`) → `ok: false` com motivo contendo "notação científica".
  - `parsePreco`: `'14,90'`→14.9; `'14.90'`→14.9; `'R$ 1.234,56'`→1234.56; `14.9`→14.9; `'0'`, `'-3'`, `'abc'`, `''` → `null`.
- [ ] **Passo 2:** rodar; esperado FAIL.
- [ ] **Passo 3: Implementar.** `normalizarTexto`: NFD, remove marcas, minúsculas, troca tudo que não é letra/número por espaço, colapsa espaços. `validarCodigoBarras`: aceita comprimento 8, 12 ou 13 com dígito verificador GS1; para entrada numérica ou de menos de 13 dígitos que não valida direto, tenta completar com zeros até 13. `parsePreco`: remove `R$` e espaços; se tem `.` e `,` o último é o decimal; arredonda a 2 casas; `<= 0` vira `null`.
- [ ] **Passo 4:** PASS. **Passo 5: Commit** `feat(shared): texto, código de barras e preço`.

---

### Tarefa 3: Quantidade e preço por unidade (`shared`)

**Arquivos:**
- Criar: `packages/shared/src/quantidade.ts`; Testar: `quantidade.test.ts`

**Interfaces:**
- Produz: `interface Quantidade { texto: string; valor: number; unidade: Unidade }` (`valor` já na unidade de exibição: 500 g → 0,5 kg); `parseQuantidade(texto: string | null | undefined): Quantidade | null`; `precoPorUnidade(preco: number, q: Quantidade | null): number | null`.

- [ ] **Passo 1: Testes que falham** (tabela `[entrada, valor, unidade]`): `'500 g'`→0,5 kg; `'5kg'`/`'5 KG'`→5 kg; `'1,5 L'`→1,5 L; `'900 ml'`→0,9 L; `'12 rolos'`/`'12rolos'`/`'12 ROLOS'`→12 rolo; `'4 rolos'`→4 rolo; `'12 x 1 L'`→12 L; `'2 x 500 g'`→1 kg; `'12 un'`/`'3 unidades'`→un; `'dúzia'`/`'1 dúzia'`→12 un; `''`, `null`, `'abc'`, `'leve 3 pague 2'`, `'0 kg'`, `'12 rolos de 30 m'` → `null`. `precoPorUnidade(14.9, 12 rolo)`=1.24; `(6.2, 4 rolo)`=1.55; `(16.5, 12 rolo)`=1.38; `(12.9, null)`=`null`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar com um regex único de `[multiplicador x] número unidade` e tabela de aliases de unidade (sem distinção de maiúsculas, espaço opcional, vírgula decimal). **Passo 4:** PASS. **Passo 5: Commit** `feat(shared): quantidade e preço por unidade`.

---

### Tarefa 4: Repositório em memória (no lugar do banco)

**Arquivos:**
- Criar: `apps/api/package.json`, `apps/api/src/repositorio.ts`, `src/repositorioMemoria.ts`, `src/repositorio.contrato.ts`
- Testar: `apps/api/src/repositorioMemoria.test.ts` (chama a suíte de contrato)

**Interfaces:**
- Produz (`apps/api/src/repositorio.ts`):
```ts
type Papel = 'cliente' | 'mercado' | 'admin'
interface Usuario { id: number; email: string; senhaHash: string; papel: Papel; emailVerificado: boolean }
interface Mercado { id: number; nome: string; endereco: string; nomeNorm: string; enderecoNorm: string;
  status: 'ativo' | 'removido'; contaSituacao: 'gratuita' | 'ativa' | 'em_atraso'; usuarioId: number | null }
interface OfertaArmazenada { mercadoId: number; codigoBarras: string; nome: string; nomeNorm: string; preco: number;
  quantidadeTexto: string | null; quantidadeValor: number | null; quantidadeUnidade: Unidade | null;
  categoria: string | null; disponivel: boolean; precoAtualizadoEm: Date;
  promocaoPreco: number | null; promocaoInicio: Date | null; promocaoFim: Date | null }
type TipoToken = 'verificar_email' | 'redefinir_senha'
interface BuscaRegistrada { usuarioId: number | null; termo: string; resultados: number; mercadosDistintos: number }
class ErroEmailJaExiste extends Error {}
class ErroMercadoDuplicado extends Error {}
interface Repositorio {
  transacao<R>(fn: (r: Repositorio) => Promise<R>): Promise<R>
  criarUsuario(u: Omit<Usuario, 'id'>): Promise<Usuario>            // ErroEmailJaExiste (e-mail sem diferenciar maiúsculas)
  acharUsuarioPorEmail(email: string): Promise<Usuario | null>
  acharUsuario(id: number): Promise<Usuario | null>
  atualizarUsuario(id: number, parcial: Partial<Omit<Usuario, 'id'>>): Promise<void>
  excluirUsuario(id: number): Promise<void>                          // apaga tokens, solta mercado.usuarioId, anonimiza buscas
  guardarToken(t: { usuarioId: number; tipo: TipoToken; tokenHash: string; expiraEm: Date }): Promise<void>
  consumirToken(tipo: TipoToken, tokenHash: string, agora: Date): Promise<number | null>  // usuarioId; null se inexistente, usado ou expirado
  criarMercado(m: Omit<Mercado, 'id'>): Promise<Mercado>             // ErroMercadoDuplicado em (nomeNorm, enderecoNorm)
  acharMercado(id: number): Promise<Mercado | null>
  acharMercadoPorChave(nomeNorm: string, enderecoNorm: string): Promise<Mercado | null>
  acharMercadoDoUsuario(usuarioId: number): Promise<Mercado | null>
  atualizarMercado(id: number, parcial: Partial<Omit<Mercado, 'id'>>): Promise<void>  // ErroMercadoDuplicado em colisão
  listarMercados(): Promise<Mercado[]>
  salvarOferta(o: OfertaArmazenada): Promise<void>                   // insere ou substitui por (mercadoId, codigoBarras)
  acharOferta(mercadoId: number, codigoBarras: string): Promise<OfertaArmazenada | null>
  removerOferta(mercadoId: number, codigoBarras: string): Promise<boolean>
  listarOfertasDoMercado(mercadoId: number): Promise<OfertaArmazenada[]>
  listarOfertasParaBusca(): Promise<{ oferta: OfertaArmazenada; mercado: Mercado }[]>  // só disponíveis, de mercados ativos
  registrarBusca(b: BuscaRegistrada): Promise<void>
  listarBuscas(): Promise<BuscaRegistrada[]>
}
criarRepositorioMemoria(): Repositorio
testarRepositorio(nome: string, criar: () => Promise<Repositorio>): void   // suíte de contrato (vitest describe/it)
```

- [ ] **Passo 1: Testes que falham** (escritos como suíte de contrato em `repositorio.contrato.ts`, chamada por `repositorioMemoria.test.ts`): e-mail repetido em caixa diferente → `ErroEmailJaExiste`; `consumirToken` devolve o `usuarioId` uma vez e depois `null`; token expirado → `null`; `criarMercado` com a mesma chave → `ErroMercadoDuplicado`; `atualizarMercado` para a chave de outro mercado → `ErroMercadoDuplicado`; `salvarOferta` duas vezes com a mesma chave deixa 1 oferta (a última); `listarOfertasParaBusca` não devolve oferta com `disponivel: false` nem oferta de mercado `removido`; `excluirUsuario` apaga tokens, deixa `mercado.usuarioId = null` e as buscas dele com `usuarioId = null`; objetos devolvidos são cópias (alterar o objeto devolvido não altera o armazenado); **Foco 5:** `transacao` que lança erro desfaz tudo o que gravou dentro dela (cria mercado, lança, `listarMercados()` fica vazio); duas `transacao` simultâneas rodam uma depois da outra (contador incrementado em duas transações concorrentes termina em 2, sem intercalar).
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar com `Map`s e contadores de id. `transacao` usa uma fila de promessas (só uma por vez) e restaura uma cópia (`structuredClone`) dos dados se `fn` lançar erro. Todo método devolve cópias.
- [ ] **Passo 4:** PASS. **Passo 5: Commit** `feat(api): repositório em memória`.

---

### Tarefa 5: Contas, papéis, e-mail e exclusão de conta

**Arquivos:**
- Criar: `apps/api/src/email.ts`, `src/app.ts`, `src/auth/rotas.ts`, `src/auth/guardas.ts`, `src/scripts/criar-admin.ts`
- Testar: `apps/api/src/auth/rotas.test.ts`

**Interfaces:**
- Consome: `Repositorio`, `criarRepositorioMemoria` (Tarefa 4).
- Produz:
```ts
interface EmailSender { enviar(para: string, assunto: string, texto: string): Promise<void> }
criarEmailConsole(): EmailSender
criarEmailMemoria(): EmailSender & { enviados: { para: string; assunto: string; texto: string }[] }
construirApp(opts: { repo: Repositorio; email: EmailSender; jwtSecret: string }): Promise<FastifyInstance>
exigirPapel(...papeis: Papel[]): preHandler      // 401 sem token, 403 papel errado; req.usuario = { id, papel }
```
Rotas: `POST /auth/cadastro {email, senha}` → 201 (papel `cliente`, envia e-mail de verificação); `POST /auth/login` → `{ token, papel, emailVerificado }`; `POST /auth/verificar-email {token}`; `POST /auth/reenviar-verificacao` (autenticada); `POST /auth/esqueci-senha {email}` → sempre 204; `POST /auth/redefinir-senha {token, senha}`; `DELETE /conta` (autenticada, só `cliente`).

- [ ] **Passo 1: Testes que falham** (`app.inject` com repositório e e-mail em memória): cadastro cria cliente e envia 1 e-mail com token; e-mail repetido (caixa diferente) → 409; senha com menos de 8 caracteres → 400; login certo devolve token, errado → 401 com a mesma mensagem para e-mail inexistente e senha errada; verificar-email marca `emailVerificado` e o mesmo token usado de novo → 400; `esqueci-senha` de e-mail inexistente → 204 e nenhum e-mail enviado; fluxo redefinir-senha troca a senha (login antigo falha, novo funciona) e token expirado → 400; `DELETE /conta` remove o usuário e as buscas dele ficam com `usuarioId` nulo; rota protegida sem token → 401, com papel errado → 403.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. `bcryptjs` para senha; token aleatório de 32 bytes, guardado só como hash SHA-256, validade 24 h (verificação) e 1 h (redefinição); JWT de 7 dias; `construirApp` registra cors e as rotas. `criar-admin.ts` não faz sentido sem persistência: o administrador de desenvolvimento nasce no `server.ts` a partir de `ADMIN_EMAIL` e `ADMIN_SENHA` (variáveis de ambiente), criado já verificado. O envio de e-mail real (provedor) **não** entra aqui: `criarEmailConsole` só escreve no log.
- [ ] **Passo 4:** PASS. **Passo 5: Commit** `feat(api): contas, papéis e e-mail`.

---

### Tarefa 6: Importação da planilha

**Arquivos:**
- Criar: `apps/api/src/planilha/importar.ts`, `src/planilha/modelo.ts`
- Testar: `apps/api/src/planilha/importar.test.ts` (planilhas montadas em memória com `exceljs`, mais um teste que lê os 4 arquivos reais de `dados-de-teste/`)

**Interfaces:**
- Consome: `normalizarTexto`, `validarCodigoBarras`, `parsePreco`, `parseQuantidade`, constantes (shared); `Repositorio` (Tarefa 4).
- Produz:
```ts
type Ator = { papel: 'admin' } | { papel: 'mercado'; mercadoId: number }
interface RelatorioImportacao { mercadoId: number; mercadoCriado: boolean; importadas: number;
  erros: { linha: number; motivo: string }[] }
class ErroPlanilha extends Error {}     // erro do arquivo inteiro; mensagem em português
importarPlanilha(repo: Repositorio, arquivo: Buffer, ator: Ator): Promise<RelatorioImportacao>
gerarModelo(): Promise<Buffer>          // xlsx com as abas Mercado e Produtos só com rótulos/cabeçalhos (sem dados) e uma aba Instruções com um exemplo; o importador ignora abas desconhecidas
```

- [ ] **Passo 1: Testes que falham.**
  - Arquivos reais: importar `mercado-1-bom-preco.xlsx` como admin → `mercadoCriado: true`, `importadas: 26`, `erros: []`; de novo → `mercadoCriado: false`, mesmo número de ofertas no repositório, `precoAtualizadoEm` avançou.
  - A planilha vence: alterar o preço de uma oferta com `repo.salvarOferta`, reimportar → volta ao preço da planilha. Oferta fora da planilha nova continua no repositório.
  - `Disponível` = `não` → `disponivel = false`; valor `talvez` → erro naquela linha; em branco → `true`.
  - Linhas ruins: sem código, código com dígito errado, preço `abc`, preço `0`, produto sem nome → cada uma vira `{ linha, motivo }` (linha do Excel, cabeçalho = 1) e as boas entram. Mesmo código duas vezes: vale a última, a primeira entra em `erros` com "duplicado".
  - Foco 1: célula numérica `7890070035629` entra; `7.89007E+12` vira erro de linha.
  - Foco 2: cabeçalhos `codigo de barras`, `PRODUTO`, `preço` sem asterisco funcionam; aba `Produtos` ausente, coluna `Preço` ausente ou aba `Mercado` sem endereço → `ErroPlanilha` e nada gravado; linhas totalmente vazias são ignoradas; um `.txt` renomeado para `.xlsx` → `ErroPlanilha`.
  - Foco 5: 5001 linhas → `ErroPlanilha`; buffer maior que 5 MB → `ErroPlanilha`; dois `importarPlanilha` simultâneos da mesma planilha deixam 1 mercado e 26 ofertas.
  - Ator `mercado`: nome/endereço diferentes na aba atualizam o próprio mercado; nome/endereço de outro mercado existente → `ErroPlanilha`. Ator `admin` com mercado `removido` → `ErroPlanilha`.
  - Quantidade: `quantidadeTexto` guarda o texto original; `quantidadeValor` e `quantidadeUnidade` só quando `parseQuantidade` entende.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar tudo dentro de `repo.transacao`: validar o arquivo, achar ou criar o mercado, depois `repo.salvarOferta` por linha com `precoAtualizadoEm = new Date()`. Cabeçalhos casados por `normalizarTexto` sem o asterisco. `nomeNorm` vem de `normalizarTexto`. `ErroMercadoDuplicado` do repositório vira `ErroPlanilha`.
- [ ] **Passo 4:** PASS. **Passo 5: Commit** `feat(api): importação de planilha`.

---

### Tarefa 7: Rotas de envio de planilha, modelo e administração

**Arquivos:**
- Criar: `apps/api/src/rotas/planilhas.ts`, `src/rotas/admin.ts`; Modificar: `src/app.ts` (registrar rotas e multipart)
- Testar: `apps/api/src/rotas/planilhas.test.ts`, `admin.test.ts`

**Interfaces:**
- Consome: `importarPlanilha`, `gerarModelo`, `ErroPlanilha`, `exigirPapel`, `construirApp`.
- Produz rotas: `GET /planilhas/modelo` (xlsx, papéis `mercado` e `admin`); `POST /planilhas` (multipart, campo `arquivo`; resposta `RelatorioImportacao`; `ErroPlanilha` → 422 `{ erro }`; ator `mercado` usa o mercado ligado ao usuário, ator `admin` usa o conteúdo da aba); `GET /admin/mercados` → `[{ id, nome, endereco, status, totalProdutos, temLogin }]`; `POST /admin/mercados/:id/acesso {email}` → cria usuário `mercado` ligado ao mercado e devolve `{ senhaTemporaria }` uma vez (409 se o mercado já tem login ou o e-mail existe); `POST /admin/mercados/:id/remover` → `status = 'removido'`.

- [ ] **Passo 1: Testes que falham:** cliente tentando `POST /planilhas` → 403; admin envia o arquivo real e recebe `importadas: 26`; mercado com login envia planilha de outro nome e continua sendo o mesmo mercado; arquivo corrompido → 422 com mensagem; sem campo `arquivo` → 400; `GET /planilhas/modelo` devolve um xlsx que, enviado em branco, dá 422 com a mensagem "Nome do mercado" em branco, e que, depois de preenchido (o teste preenche mercado e uma linha de produto), importa 1 produto sem erros; `acesso` cria o login e o mercado consegue entrar com a senha temporária; `remover` tira o mercado da lista pública (checado na Tarefa 9).
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(api): envio de planilha e administração de mercados`.

---

### Tarefa 8: Correção manual no painel e aba Cobrança

**Arquivos:**
- Criar: `apps/api/src/rotas/painel.ts`; Modificar: `src/app.ts`
- Testar: `apps/api/src/rotas/painel.test.ts`

**Interfaces:**
- Produz (papel `mercado`; sempre sobre o mercado do usuário logado): `GET /painel/mercado` → `{ id, nome, endereco, totalProdutos, produtosDesatualizados }`; `PATCH /painel/mercado {nome?, endereco?}`; `GET /painel/produtos?pagina=1` (50 por página, `{ itens: ProdutoPainel[], total }`, `ProdutoPainel` = `{ codigoBarras, nome, preco, quantidadeTexto, categoria, disponivel, atualizadoEm, desatualizado }`); `PATCH /painel/produtos/:codigo {nome?, preco?, quantidade?, categoria?, disponivel?}`; `DELETE /painel/produtos/:codigo`; `GET /painel/cobranca` → `{ situacao: 'gratuita', mensagem: 'Gratuito por enquanto' }`.

- [ ] **Passo 1: Testes que falham:** `PATCH` de preço atualiza `precoAtualizadoEm` e o `GET` mostra o novo valor; `PATCH` com `codigoBarras` no corpo é recusado (400, código não é editável); preço inválido (`0`, `abc`) → 400; quantidade nova é reinterpretada por `parseQuantidade`; `DELETE` de código inexistente → 404 e o mercado A nunca enxerga nem altera produto do mercado B; nome/endereço novos que colidem com outro mercado → 409; `produtosDesatualizados` conta ofertas com mais de 7 dias (o teste envelhece a data com `repo.salvarOferta`); produto editado e depois coberto por nova planilha volta ao valor da planilha (regra do spec).
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(api): correção manual e cobrança`.

---

### Tarefa 9: Busca, lista de mercados e produtos de um mercado

**Arquivos:**
- Criar: `apps/api/src/busca/similaridade.ts`, `src/busca/buscar.ts`, `src/rotas/busca.ts`, `src/rotas/mercados.ts`; Modificar: `src/app.ts`
- Testar: `apps/api/src/busca/similaridade.test.ts`, `src/busca/buscar.test.ts`, `src/rotas/busca.test.ts`

**Interfaces:**
- Consome: `normalizarTexto`, `precoPorUnidade`, `DIAS_PRECO_VELHO`, `GrupoProduto`, `Oferta`; `Repositorio.listarOfertasParaBusca`, `registrarBusca`.
- Produz: `similaridade(a: string, b: string): number` (0 a 1; trigramas com dois espaços antes e um depois, como o `pg_trgm`, coeficiente de Jaccard); `buscar(repo: Repositorio, p: { q: string; ordem: 'unidade' | 'embalagem'; usuarioId?: number }): Promise<GrupoProduto[]>`. Rotas (papel `cliente`): `GET /busca?q=&ordem=unidade|embalagem`; `GET /mercados` → `[{ id, nome, endereco, totalProdutos }]`; `GET /mercados/:id/produtos?pagina=1` → `{ itens: Oferta-resumida[], total }`.

Regras de `buscar` (decididas): normaliza a busca e separa em palavras; **cada palavra** precisa casar com o `nomeNorm` da oferta, ou como pedaço do texto, ou (palavras de 4+ letras) com `similaridade(palavra, palavraDoNome) >= 0.35` com alguma palavra do nome; só ofertas devolvidas por `listarOfertasParaBusca`; agrupar por `codigoBarras`; `nome` do grupo = o nome mais comprido entre as ofertas; ofertas do grupo ordenadas por preço por unidade (sem unidade, por preço); grupos ordenados pelo melhor preço por unidade (agrupando por unidade), os sem unidade depois por menor preço; `ordem=embalagem` ordena tudo por menor preço da embalagem; `desatualizado` = mais de 7 dias; registra uma busca (termo, quantidade de grupos, mercados distintos). A busca varre todas as ofertas em memória: aceitável no piloto; a implementação com banco poderá filtrar na consulta.

- [ ] **Passo 1: Testes que falham.** `similaridade('papl','papel')` ≈ 0,375 (`toBeCloseTo(0.375, 2)`); `similaridade('arroz','arroz')` = 1; `similaridade('arroz','sabao')` < 0,1. Depois, importando os 4 arquivos de `dados-de-teste/` num repositório em memória:
  - `buscar('papel higienico')` devolve os grupos Fox 12 rolos (2 mercados), Fox 4 rolos, X 12 rolos e Neve 12 rolos; o primeiro grupo é o de menor preço por unidade; dentro de Fox 12 rolos a oferta do Atacarejo Econômico vem antes da do Empório Sonia.
  - Foco 4: o mesmo código com nomes `Papel Hig. X Folha Simples` e `PAPEL HIGIENICO X FOLHA SIMPLES` forma um grupo só; `nome` é o mais comprido; cada oferta tem seu `precoPorUnidade`.
  - Oferta sem quantidade entendida aparece **depois** das que têm, com `precoPorUnidade: null`.
  - O óleo de soja indisponível do Empório Sonia não aparece; mercado removido some da busca e de `GET /mercados`.
  - Foco 3: `''` e `'a'` → `[]`; `'%'` e `'_'` → `[]` sem erro e sem casar tudo; texto de 500 caracteres → `[]` sem erro; `'papel higiênico'` e `'papl higienico'` acham os mesmos grupos de papel.
  - `desatualizado: true` e `diasDesdeAtualizacao >= 8` para oferta envelhecida em 8 dias; `false` para 7 dias.
  - `ordem=embalagem` ordena pelo preço da embalagem. Cada busca grava 1 registro em `repo.listarBuscas()`.
  - Rotas: sem token → 401; papel `mercado` → 403.
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(api): busca e mercados`.

---

### Tarefa 10: Política de privacidade, dados de teste e servidor

**Arquivos:**
- Criar: `apps/api/src/rotas/privacidade.ts`, `src/scripts/seed.ts`, `src/server.ts`, `apps/api/README.md`
- Testar: `apps/api/src/rotas/privacidade.test.ts`, `apps/api/src/seed.test.ts`

**Interfaces:**
- Produz: `GET /privacidade` (HTML público); `seed(repo: Repositorio, pasta: string): Promise<RelatorioImportacao[]>` (importa cada `.xlsx` da pasta como admin); `npm run dev -w @mercado/api` (porta 3000). `server.ts`: repositório em memória; cria o administrador de `ADMIN_EMAIL`/`ADMIN_SENHA`; carrega `dados-de-teste/` ao iniciar, exceto quando `NODE_ENV=production`; exige `JWT_SECRET` em produção.

- [ ] **Passo 1: Testes que falham:** `/privacidade` responde 200 HTML e menciona e-mail, senha criptografada, buscas registradas e exclusão de conta; `seed(repo, '<raiz>/dados-de-teste')` devolve 4 relatórios sem erros e deixa 4 mercados ativos; fim a fim: com o seed, `POST /auth/cadastro` + `login` + `GET /busca?q=papel higienico` devolve os grupos esperados.
- [ ] **Passo 2–4:** FAIL, implementar, PASS. O texto da política é um rascunho curto e **precisa de revisão antes de publicar** (anotar isso no README). **Passo 5: Commit** `feat(api): privacidade, dados de teste e servidor`.

---

### Tarefa 11: Painel — base, login e envio de planilha

**Arquivos:**
- Criar: `apps/painel/` (Vite + React + TS), `src/api.ts`, `src/Login.tsx`, `src/EnviarPlanilha.tsx`, `src/App.tsx`
- Testar: `apps/painel/src/EnviarPlanilha.test.tsx` (vitest + Testing Library, `fetch` simulado)

**Interfaces:**
- Consome (HTTP): `/auth/login`, `GET /planilhas/modelo`, `POST /planilhas`.
- Produz: `api.ts` com `login(email, senha)`, `enviarPlanilha(arquivo: File): Promise<RelatorioImportacao>`, `baixarModelo()`, token guardado em `localStorage`; rotas de tela `/entrar`, `/planilha`.

- [ ] **Passo 1: Testes que falham:** login com senha errada mostra "E-mail ou senha incorretos"; depois de enviar um arquivo, a tela mostra "26 produtos importados" e a lista de linhas com erro (`Linha 7: preço inválido`); resposta 422 mostra a mensagem do servidor num aviso vermelho; botão "Baixar planilha-modelo" chama `baixarModelo`; sem token a rota `/planilha` redireciona para `/entrar`.
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(painel): login e envio de planilha`.

---

### Tarefa 12: Painel — produtos, correção manual e Cobrança

**Arquivos:**
- Criar: `apps/painel/src/Produtos.tsx`, `src/MeuMercado.tsx`, `src/Cobranca.tsx`; Modificar: `src/App.tsx`, `src/api.ts`
- Testar: `Produtos.test.tsx`, `Cobranca.test.tsx`

**Interfaces:**
- Consome: rotas `/painel/*` da Tarefa 8.
- Produz: tela "Produtos" (tabela paginada, edição na própria linha de nome, preço, quantidade, categoria, disponível; botão remover com confirmação; o código de barras aparece só leitura); tela "Meu mercado" (nome, endereço, faixa amarela "N produtos com preço de mais de 7 dias" quando `produtosDesatualizados > 0`); aba "Cobrança" mostrando o texto "Gratuito por enquanto".

- [ ] **Passo 1: Testes que falham:** editar o preço e salvar chama `PATCH /painel/produtos/:codigo` com `{ preco: 15.9 }`; o campo de código de barras está desabilitado; remover pede confirmação e só então chama `DELETE`; erro 400 de preço mostra a mensagem na linha; a faixa de preços velhos aparece com 3 produtos e some com 0; a aba Cobrança mostra "Gratuito por enquanto".
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(painel): produtos, correção manual e cobrança`.

---

### Tarefa 13: Painel — administração

**Arquivos:**
- Criar: `apps/painel/src/admin/Mercados.tsx`; Modificar: `src/App.tsx`, `src/api.ts`
- Testar: `apps/painel/src/admin/Mercados.test.tsx`

**Interfaces:**
- Consome: `/admin/mercados`, `/admin/mercados/:id/acesso`, `/admin/mercados/:id/remover`, `POST /planilhas`.
- Produz: tela "Mercados" visível só para papel `admin`: tabela (nome, endereço, produtos, tem login), botão "Criar acesso" (pede e-mail e mostra a senha temporária uma única vez), botão "Remover" com confirmação, e o envio de planilha (a mesma tela da Tarefa 11) disponível para o admin.

- [ ] **Passo 1: Testes que falham:** usuário `mercado` não vê o menu Administração; "Criar acesso" mostra a senha temporária devolvida e ela some ao fechar; remover pede confirmação; mercado já com login mostra "Já tem acesso" no lugar do botão.
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(painel): administração de mercados`.

---

### Tarefa 14: App — base, cadastro e login

**Arquivos:**
- Criar: `apps/mobile/` (Expo, TypeScript, jest-expo), `src/api.ts`, `src/telas/Entrar.tsx`, `src/telas/Cadastrar.tsx`, `src/telas/EsqueciSenha.tsx`, `src/navegacao.tsx`
- Testar: `apps/mobile/src/telas/Cadastrar.test.tsx`

**Interfaces:**
- Consome: `/auth/*`, `GET /privacidade`.
- Produz: `api.ts` com `cadastrar`, `entrar`, `esqueciSenha`, `excluirConta`, token em `expo-secure-store`; URL da API por `EXPO_PUBLIC_API_URL`. Telas: Entrar, Cadastrar (e-mail, senha, caixa "Li e aceito a política de privacidade" com link para `/privacidade`), Esqueci a senha. Faixa "Confirme seu e-mail" quando `emailVerificado` é falso (não bloqueia o uso).

- [ ] **Passo 1: Testes que falham:** sem marcar a política o botão "Criar conta" fica desabilitado; senha com 7 caracteres mostra "A senha precisa de pelo menos 8 caracteres"; e-mail repetido (409) mostra "Esse e-mail já está cadastrado"; login bem-sucedido guarda o token e navega para a busca; a faixa de confirmação aparece só para e-mail não verificado.
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(mobile): cadastro e login`.

---

### Tarefa 15: App — busca e comparação

**Arquivos:**
- Criar: `apps/mobile/src/telas/Busca.tsx`, `src/componentes/CartaoOferta.tsx`, `src/formatar.ts`
- Testar: `apps/mobile/src/formatar.test.ts`, `src/telas/Busca.test.tsx`

**Interfaces:**
- Consome: `GET /busca`; `GrupoProduto`/`Oferta` de `@mercado/shared`.
- Produz: `formatarPreco(n: number): string` (`'R$ 14,90'`); `textoIdade(dias: number): string` (`0` → `'atualizado hoje'`, `1` → `'atualizado há 1 dia'`, `n` → `'atualizado há n dias'`); `textoPorUnidade(o: Oferta): string | null` (`'R$ 1,24 por rolo'`, `'R$ 5,80 por kg'`, `null` sem unidade). Tela Busca: campo de busca (espera 400 ms para chamar a API), alternância "Menor preço por unidade / Menor preço da embalagem", grupos com as ofertas lado a lado (mercado, endereço, preço, preço por unidade, idade); etiqueta "mais barato" na primeira oferta de cada grupo com mais de uma oferta; aviso discreto "sem quantidade informada" quando `precoPorUnidade` é nulo; aviso amarelo em oferta `desatualizado`; mensagem "Nada encontrado" na lista vazia.

- [ ] **Passo 1: Testes que falham:** os três formatadores com os exemplos acima (inclui `formatarPreco(1234.5)` → `'R$ 1.234,50'`); busca "papel higienico" com resposta simulada mostra os dois mercados do grupo Fox 12 rolos, com "mais barato" só na primeira; oferta sem quantidade mostra o aviso; oferta desatualizada mostra o aviso amarelo; trocar a alternância refaz a chamada com `ordem=embalagem`; não existe nenhum botão ou campo de edição de produto ou preço na tela.
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(mobile): busca e comparação`.

---

### Tarefa 16: App — mercados, conta e exclusão

**Arquivos:**
- Criar: `apps/mobile/src/telas/Mercados.tsx`, `src/telas/MercadoDetalhe.tsx`, `src/telas/Conta.tsx`
- Testar: `Mercados.test.tsx`, `Conta.test.tsx`

**Interfaces:**
- Consome: `GET /mercados`, `GET /mercados/:id/produtos`, `DELETE /conta`.
- Produz: lista de mercados (nome, endereço, total de produtos); detalhe do mercado com produtos paginados (rolagem infinita) e a idade de cada preço; tela Conta com "Sair" e "Excluir minha conta" (confirmação em duas etapas; após excluir, apaga o token e volta ao login).

- [ ] **Passo 1: Testes que falham:** a lista mostra os 4 mercados do seed simulado; tocar abre o detalhe com a primeira página e carrega a segunda ao rolar; excluir conta só chama `DELETE /conta` depois da segunda confirmação e limpa o token; "Sair" limpa o token.
- [ ] **Passo 2–4:** FAIL, implementar, PASS. **Passo 5: Commit** `feat(mobile): mercados e conta`.

---

### Tarefa 17: Verificação fim a fim e README

**Arquivos:**
- Criar: `README.md` (raiz); Testar: `apps/api/src/fimafim.test.ts`

**Interfaces:**
- Consome: tudo da API.

- [ ] **Passo 1: Teste que falha** — um roteiro só, contra a API real com repositório em memória: criar admin; enviar as 4 planilhas por `POST /planilhas`; criar acesso para o Mercado Bom Preço e entrar como ele; corrigir o preço de um produto à mão; reenviar a planilha e conferir que o preço voltou ao da planilha; marcar um produto como `não` na planilha e conferir que sumiu da busca; cadastrar um cliente e buscar "papel higienico"; envelhecer 8 dias uma oferta e conferir `desatualizado`; excluir a conta do cliente e conferir que a busca dele ficou com `usuarioId` nulo.
- [ ] **Passo 2–4:** rodar (`npm test` na raiz, todos os pacotes); FAIL se algo divergir do spec; corrigir; PASS. O `README.md` explica em português simples: instalar (`npm install`), subir a API (`npm run dev -w @mercado/api`, já com os dados de teste), o painel e o app (`npx expo start`), e o que falta antes de publicar: **banco de dados (próxima fase)**, provedor de e-mail real, texto de privacidade revisado, contas de loja de apps.
- [ ] **Passo 5: Commit** `test: roteiro fim a fim e README`.

---

## Fase seguinte (fora deste plano): banco de dados

Quando o Luiz liberar o banco, o trabalho é uma tarefa só: implementar `Repositorio` em PostgreSQL e fazer passar a suíte `testarRepositorio` (Tarefa 4), trocando a escolha em `server.ts` por `DATABASE_URL`. Esboço do esquema previsto, **só para essa fase, não usar agora**:

```sql
create extension if not exists pg_trgm;
create table usuarios (id serial primary key, email text not null unique, senha_hash text not null,
  papel text not null check (papel in ('cliente','mercado','admin')),
  email_verificado boolean not null default false, criado_em timestamptz not null default now());
create table mercados (id serial primary key, nome text not null, endereco text not null,
  nome_norm text not null, endereco_norm text not null,
  status text not null default 'ativo' check (status in ('ativo','removido')),
  conta_situacao text not null default 'gratuita' check (conta_situacao in ('gratuita','ativa','em_atraso')),
  usuario_id int unique references usuarios(id), unique (nome_norm, endereco_norm));
create table ofertas (id serial primary key, mercado_id int not null references mercados(id),
  codigo_barras text not null, nome text not null, nome_norm text not null,
  preco numeric(10,2) not null check (preco > 0), quantidade_texto text, quantidade_valor numeric,
  quantidade_unidade text, categoria text, disponivel boolean not null default true,
  preco_atualizado_em timestamptz not null default now(),
  promocao_preco numeric(10,2), promocao_inicio timestamptz, promocao_fim timestamptz,
  unique (mercado_id, codigo_barras));
create index ofertas_nome_trgm on ofertas using gin (nome_norm gin_trgm_ops);
```
(mais as tabelas `tokens` e `buscas`, equivalentes aos tipos de `repositorio.ts`.) Nessa fase, ou antes dela se a lista de ofertas em memória pesar na busca, `listarOfertasParaBusca` pode ser trocado por uma consulta filtrada.

## Revisão do plano contra o spec

- Cobertura: seção 2 (busca, preço por unidade, gratuito) → Tarefas 3, 9, 15; seção 3 (fora do escopo) → nenhuma tarefa cria cadastro um a um, pagamento ou localização; seção 5 (planilha, atualização, correção manual) → Tarefas 6, 7, 8, 12; seção 6 (busca, ordem, avisos) → Tarefas 9 e 15; seção 7 (cobrança) → campos no modelo da Tarefa 4, rota na 8, aba na 12; seção 8 (começar do zero, admin, publicação automática) → Tarefas 6, 7, 13; seção 9 (contas, LGPD) → Tarefas 5, 10, 14, 16; seção 12 (registro de buscas) → Tarefas 4 e 9.
- Tipos: `Unidade`, `Quantidade`, `Oferta`, `GrupoProduto`, `Repositorio`, `Ator`, `RelatorioImportacao` têm o mesmo nome e forma em todas as tarefas que os usam.
- Pontos que dependem do usuário e não entram no código: banco de dados (fase seguinte), provedor de e-mail, hospedagem, revisão do texto de privacidade, contas de desenvolvedor para Google Play e App Store (spec seção 10: publicação nas lojas fica para depois do piloto).
