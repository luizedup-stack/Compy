# Produtos, ordenar/filtrar, comércios e descontos pagos — Plano de implementação

> **Para quem executa:** use superpowers:executing-plans (execução nesta conversa, tarefa por tarefa). Passos com caixas `- [ ]`.

**Objetivo:** app de produtos com ordenar/filtrar, textos "comércio/estabelecimento", promoções pagas (R$ 5, Pix manual), administração dos valores, site e posts de divulgação.

**Arquitetura:** a conta de busca/ordenação/filtro mora em `packages/shared/src/busca.ts` (servidor e cópia do celular usam a mesma). Promoção entra como campos na oferta e no catálogo; o preço efetivo (promoção ativa ou preço normal) é usado na comparação. Planilha com aba "Descontos" vira um **pedido retido** (tabela nova) até a dona marcar "pago" na administração; só então a planilha é aplicada.

**Tecnologia:** TypeScript (Fastify, React+Vite, Expo/React Native), SQL Server (migração 008), vitest/jest.

**Spec:** `docs/superpowers/specs/2026-11-10-produtos-descontos-design.md`

## Restrições globais
- Nada que gere custo (`docs/TRAVAS-DE-CUSTO.md`); sem provedor de pagamento; Pix manual.
- Código comentado em português; atualizar `docs/GUIA-DO-CODIGO.md`.
- Só os textos visíveis mudam de "mercado" para "comércio/estabelecimento"; rotas, tabelas e nomes do código seguem "mercado".
- Valor padrão por promoção: **R$ 5,00** (500 centavos), editável pela dona; guardado em centavos. Chave Pix editável pela dona.
- Cor de destaque de promoção: laranja `#F28C28`.
- Dados de terceiros (preços das redes) nunca vão para o site/posts nem para o git.

## Revisão de foco (o que mais pode dar errado)
1. Planilha com Descontos, mas com erro de linha: não cria pedido, devolve os erros (como hoje).
2. Preço promocional >= preço normal, ou "Válido até" no passado: linha recusada com mensagem clara.
3. Promoção vencida some sozinha (preço volta ao normal) — conta feita na hora da consulta, sem rotina agendada.
4. Dois pedidos retidos do mesmo comércio: ao pagar o segundo, não pode desfazer o primeiro (aplicados na ordem de pagamento).
5. Mudar o valor por promoção não altera pedidos já criados (o valor fica gravado no pedido).

---

### Tarefa 1: Textos "comércio/estabelecimento" e a lua do modo escuro
**Arquivos:** `apps/painel/src/*.tsx` (App, Navegacao, MeuMercado, Produtos, admin/Mercados, EnviarPlanilha, CadastrarMercado, FormularioMercado, Login…), `apps/mobile/src/navegacao.tsx`, `apps/mobile/src/telas/Mercados.tsx` e `MercadoDetalhe.tsx`, testes que citam os textos antigos.
- [ ] Painel: trocar "Mercado(s)" por "Comércio(s)" nos textos visíveis; botão de tema vira só `🌙`/`☀️` com `aria-label="Modo escuro"`/`"Modo claro"` e `title`.
- [ ] App: aba `Mercados` → título **Estabelecimentos** (rótulo da aba e cabeçalho); textos das telas falam em "estabelecimentos".
- [ ] Ajustar os testes que procuram os textos antigos; rodar `npm test`.
- [ ] Commit.

### Tarefa 2: Ordenar e filtrar (shared + API + app)
**Interfaces (produz):**
- `export type CriterioOrdem = 'relevancia' | 'menor-preco' | 'maior-preco' | 'recentes'`
- `export interface Filtros { precoMin?: number; precoMax?: number; quantidadeMin?: number; quantidadeMax?: number; unidade?: Unidade; mercadoIds?: number[]; soPromocao?: boolean; soComparaveis?: boolean; comparar?: 'unidade' | 'embalagem' }`
- `buscarNoCatalogo(catalogo, { q, ordem?: OrdemBusca, criterio?: CriterioOrdem, filtros?: Filtros })` e `listarProdutosNoCatalogo(catalogo, { ordem?, criterio?, filtros?, pagina?, agora? })` (parâmetros novos opcionais; sem eles o resultado é o de hoje).
- Rotas `GET /busca` e `GET /produtos` aceitam `ordenar` (os 4 critérios), `precoMin`, `precoMax`, `qtdMin`, `qtdMax`, `unidade`, `comercios` (ids separados por vírgula), `promocao=1`, `comparaveis=1`, `comparar` (`unidade|embalagem`); valor inválido → 400.
- **Regras:** *Menor/Maior preço* = menor preço efetivo do produto (por unidade quando `comparar=unidade` e dá; senão da embalagem); *Recentes* = `precoAtualizadoEm` mais novo do produto; *Relevância* = a que existe hoje (busca) e, sem busca, mais comércios primeiro; desempate sempre nome e código (ordem estável).
- [ ] Teste (shared): para cada critério e filtro, resultado esperado; sem parâmetros novos = resultado idêntico ao atual (regressão).
- [ ] Implementar em `packages/shared/src/busca.ts`; a lista inicial segue rápida (resumo leve por código, montar só a página).
- [ ] Teste de equivalência servidor × cópia (já existe em `apps/api/src/rotas/catalogo.test.ts`): incluir os novos critérios/filtros.
- [ ] API: ler/validar os parâmetros em `apps/api/src/rotas/busca.ts`.
- [ ] App: `apps/mobile/src/api.ts` (`buscar`, `listarProdutos` recebem critério e filtros; vale na cópia offline), `telas/Busca.tsx`: no lugar dos dois botões, seletor **Ordenar por** (4 opções) e botão **Filtros** abrindo um painel (modal) com faixa de preço, quantidade+unidade, comércios, "Só promoções", "Só comparáveis", "Comparar preço por"; botão "Limpar".
- [ ] Testes do app (Busca.test.tsx ajustado + novos). Commit.

### Tarefa 3: Promoção no modelo, no catálogo e no app
**Interfaces:** `OfertaArmazenada` já tem `promocaoPreco|Inicio|Fim`. Acrescentar em `Oferta` e `OfertaCatalogo`: `precoPromocional?: number | null`, `promocaoInicio?: string | null`, `promocaoFim?: string | null` (ISO). Função em shared: `precoEfetivo(o, agora): { preco: number; emPromocao: boolean }` (promoção ativa = início ≤ agora ≤ fim e preço promocional < preço).
- [ ] Teste de `precoEfetivo` (ativa, futura, vencida, preço promocional inválido).
- [ ] `montarCatalogo`, rotas de busca/lista e `produtosDoMercado` devolvem os campos; comparação, ordenação e `precoPorUnidade` usam o preço efetivo.
- [ ] App: cartão da oferta e da lista com **selo laranja "PROMOÇÃO"**, preço promocional grande, preço antigo riscado, "até dd/mm", borda/fundo laranja; filtro "Só promoções" funcional. Teste de componente.
- [ ] Commit.

### Tarefa 4: Aba "Descontos", pedido retido e tela Cobrança do comércio
**Interfaces (produz):**
- Migração `apps/api/src/banco/migracoes/008-promocoes.sql`: tabela `PedidosPromocao(id int identity PK, mercadoId int FK→Mercados ON DELETE CASCADE, criadoEm, situacao varchar(20) CHECK IN ('aguardando','pago','cancelado'), quantidade int, valorUnitarioCentavos int, totalCentavos int, avisouPagamentoEm datetime2 NULL, pagoEm datetime2 NULL, planilha nvarchar(max))` (`planilha` = produtos e descontos já lidos, em JSON).
- Repositório (memória e SQL): `criarPedidoPromocao`, `acharPedidoPromocao(id)`, `listarPedidosPromocao(filtro?: { mercadoId?: number })`, `atualizarPedidoPromocao(id, parcial)`. Configurações via `acharConfiguracao/salvarConfiguracao`: `promocao.valorCentavos` (padrão 500) e `pix.chave`.
- `importarPlanilha(...)`: lê aba **Descontos** (colunas `Código de barras*`, `Preço promocional*`, `Válido de`, `Válido até*`); se houver ≥ 1 linha de desconto válida e o ator for `mercado`, **não grava nada**: cria o pedido (`situacao: 'aguardando'`) e devolve `{ pedido: { id, quantidade, valorUnitarioCentavos, totalCentavos } }` com status HTTP 202; erros de linha → 422 como hoje; ator `admin` aplica direto (sem cobrança).
- `aplicarPedidoPromocao(repo, pedido)`: grava produtos e promoções do pedido (`salvarOferta` com `promocaoPreco/Inicio/Fim`).
- Rotas do comércio: `GET /painel/promocoes` (pedidos do comércio + `{ valorCentavos, pixChave }`), `POST /painel/promocoes/:id/avisar` (marca "Já paguei"), `POST /painel/promocoes/:id/cancelar`.
- [ ] Testes: planilha sem Descontos = igual a hoje; com Descontos cria pedido e não grava; linha inválida (preço ≥ normal, sem "Válido até", produto inexistente) = 422; admin aplica direto; cancelar.
- [ ] Modelo de planilha (`planilha/modelo.ts`) ganha a aba Descontos com exemplo e legenda.
- [ ] Painel: `Cobranca.tsx` mostra pedidos (valor, chave Pix, código do pedido), botões "Já paguei" e "Cancelar"; `EnviarPlanilha.tsx` mostra o aviso "N promoções = R$ X: pague e aguarde a liberação" ao receber 202.
- [ ] Commit.

### Tarefa 5: Aba "Promoções" na administração
**Interfaces:** `GET /admin/promocoes` → `{ resumo: { pagas, aguardando, canceladas, recebidoCentavos, aReceberCentavos }, porComercio: [{ mercadoId, nome, pagas, aguardando, recebidoCentavos, devidoCentavos }], pedidos: [...] , config: { valorCentavos, pixChave } }`; `POST /admin/promocoes/:id/pagar` (aplica a planilha retida, marca `pago`), `POST /admin/promocoes/:id/cancelar`; `PUT /admin/promocoes/config` (`valorCentavos` inteiro ≥ 0, `pixChave` texto até 140).
- [ ] Testes de cada rota (só admin; pagar aplica as promoções; pagar duas vezes não duplica; valor novo vale só para pedidos novos).
- [ ] Painel: `admin/Promocoes.tsx` + item "Promoções" na navegação do administrador: cartões de totais, tabela de pedidos com ações, visão por comércio e caixa de configurações (valor e chave Pix).
- [ ] Commit.

### Tarefa 6: Site de divulgação e publicações do Instagram
**Arquivos:** `site/index.html`, `site/estilos.css`, `site/*.svg|png`; `divulgacao/instagram/post-01..09.png` (1080x1350), `divulgacao/legendas.md`, `divulgacao/perfil.md` (nome, @, bio, destaques, link).
- [ ] Site de uma página, chamativo, com as cores da marca: o que é, como funciona o app (3 passos), como funciona o software/painel do comércio (3 passos), promoções (como destacar e quanto custa: o valor atual vem da dona), perguntas frequentes, botões de baixar o app e cadastrar o comércio. Sem preços reais de terceiros.
- [ ] 9 publicações (arte HTML renderizada em imagem) + legendas e hashtags; tudo em português.
- [ ] Conferir o site e as artes no navegador do aplicativo (captura de tela).
- [ ] Commit (nada publicado: publicar o site e abrir a conta do Instagram é com a dona).

### Tarefa 7: Fechamento
- [ ] `npm test` (tudo), `docs/GUIA-DO-CODIGO.md` e `docs/BANCO.md` atualizados (promoções, pedidos, configurações), `dados-reais` intocado.
- [ ] Novo APK (versão 1.2.0, código 9) e novo programa de Windows; `releases/LEIA-ME.md` atualizado.
- [ ] Relatar à dona o que foi e o que NÃO foi testado (nenhum celular real; Pix não testado com dinheiro real); perguntar antes de enviar ao GitHub.
