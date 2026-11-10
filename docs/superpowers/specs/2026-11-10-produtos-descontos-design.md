# Bolso Certo vira app de PRODUTOS: ordenar/filtrar, comércios e descontos pagos

Data: 2026-11-10. Pedido da dona do projeto. Regras fixas: nada que gere custo sem ela autorizar (veja `docs/TRAVAS-DE-CUSTO.md`); código bem
comentado em português; tudo continua nos planos gratuitos.

## Intenção
O Bolso Certo deixa de ser "app de mercados" e passa a ser "app de **produtos**": qualquer comércio pode cadastrar seus produtos. O cliente
precisa achar o produto mais fácil (ordenar e filtrar) e os comércios podem **pagar para destacar promoções**, o que gera receita (R$ 5 por promoção).

## O que muda

### 1. Ordenar e filtrar no app (decidido pela dona)
- Sai "Menor preço por unidade / da embalagem". Entra um seletor **Ordenar por**: **Relevância**, **Menor preço**, **Maior preço**, **Recentes**.
- Entra um painel **Filtros**: faixa de preço, quantidade, e outros que façam sentido (*meu palpite: comércio, "só em promoção", "só produtos comparáveis"*).
- *Minha decisão:* a escolha "comparar por unidade ou por embalagem" não some: vai para dentro dos Filtros ("Comparar preço por: unidade / embalagem"), para
  continuar comparando kg com kg e litro com litro. *Menor/Maior preço* ordena pelo menor preço do produto (o preço por unidade, quando dá).
  *Recentes* = preço atualizado mais recentemente. *Relevância* = o que combina mais com o que foi digitado; sem busca, os vendidos em mais comércios primeiro.
- Vale também sem internet (mesma conta em `packages/shared`, usada pelo servidor e pela cópia do celular).

### 2. "Mercado" vira "Comércio" (decidido)
- No app: a aba **Mercados** vira **Estabelecimentos**; textos falam em estabelecimentos/comércios.
- No painel web: "Mercados" vira **Comércios**; cada comércio entra, faz o acesso normal e cadastra os seus.
- *Minha decisão:* só os **textos que o usuário vê** mudam. Endereços internos da API, tabelas do banco e nomes no código continuam "mercado" (mudar isso não
  traz nada para o usuário e arrisca quebrar o que já funciona). Fica registrado no guia do código.

### 3. Painel: lua do modo escuro (decidido)
- O botão ao lado de "Sair" mostra só a **luazinha** 🌙 (☀️ no escuro), sem o texto, com rótulo de acessibilidade "Modo escuro".

### 4. Aba "Descontos" na planilha (decidido: existe e é cobrada)
- A planilha ganha a aba **Descontos**. *Minhas decisões de formato:* colunas **Código de barras\***, **Preço promocional\***, **Válido de** (opcional; padrão =
  quando for liberada) e **Válido até\*** (obrigatório, para nenhuma promoção ficar para sempre). O preço promocional tem de ser menor que o preço normal e o
  produto tem de existir (na aba Produtos da mesma planilha ou já cadastrado).
- **Cada linha da aba Descontos = 1 promoção = R$ 5,00** (valor padrão; a dona muda na administração).
- **Planilha com desconto só salva depois do pagamento** (decidido). *Minha decisão:* a planilha inteira (produtos + descontos) fica **retida** num
  **pedido de promoções** "aguardando pagamento"; nada vai para o ar. Quando a dona marca **pago**, a planilha retida é aplicada. Planilha sem a aba Descontos
  (ou vazia) continua como hoje, na hora e de graça.
- No app, uma promoção ativa mostra o preço promocional (já entra na ordenação e na comparação), o preço antigo riscado e "até dd/mm"; ao vencer, some sozinha.

### 5. Pagamento: Pix manual, sem custo (decidido pela dona)
- O comércio vê no painel (tela **Cobrança**, que já existe): o pedido, o valor, a **chave Pix** da dona e o código do pedido para colocar na mensagem do Pix;
  pode tocar em **"Já paguei"** (só avisa a dona) ou **Cancelar** o pedido.
- A dona confere o Pix no banco dela e, na administração, marca **Pago** (ou Cancela). Nenhum provedor de pagamento, nenhuma taxa, nenhuma conta nova.

### 6. Administração (aba nova para a dona)
- Aba **Promoções**: totais (promoções pagas, aguardando pagamento, valor recebido, valor a receber), lista de pedidos (comércio, data, quantidade, valor por
  promoção na data do pedido, total, situação: *aguardando pagamento / pago / cancelado*), ações **Marcar como pago**, **Cancelar**, e uma visão por comércio
  (quem pagou e quem deixou de pagar).
- Configurações editáveis ali: **valor por promoção** (padrão R$ 5,00; muda só os pedidos novos) e **chave Pix** que aparece para os comércios.

## Fora do escopo (agora)
Provedor de pagamento automático (Mercado Pago etc.), confirmação automática do Pix, estorno, nota fiscal/impostos (cuidado da dona), promoção digitada à mão
no painel (só pela planilha), foto do comprovante.

## Como será construído (ordem, cada etapa testável e com testes)
1. Textos "comércio/estabelecimento" + lua. 2. Ordenar e filtrar (shared + API + app). 3. Promoção no modelo e no app (preço efetivo, selo). 4. Aba Descontos
na planilha + pedido retido + tela Cobrança do comércio. 5. Aba Promoções na administração + configurações. 6. Documentação, APK novo, programa novo.
Banco: migração nova (tabela de pedidos de promoções, valor por promoção e chave Pix nas configurações); o servidor a aplica sozinho ao iniciar.

## Acréscimos pedidos depois (mesma data)

### 7. Desconto bem visível no app (decidido pela dona)
- Produto em promoção **chama atenção**: selo **laranja** "PROMOÇÃO" com o preço promocional grande, o preço antigo riscado e "até dd/mm"; o cartão do
  produto ganha borda/fundo em tom laranja-azulado. No topo da lista, uma faixa/filtro "Só promoções". *(Cores: laranja `#F28C28` sobre o azul da marca.)*

### 8. Redes sociais e site de divulgação (nova frente, separada do app)
- **Instagram:** eu **não posso criar a conta** (criar conta é com a dona). Eu preparo tudo para ela só colar: nome e @ sugeridos, bio, link, categorias de
  destaques, e **9 publicações** prontas (imagens 1080x1350 em `divulgacao/instagram/` e legendas com hashtags em `divulgacao/legendas.md`): o que é o app, como
  comparar preços, como o comércio vende, promoções, etc.
- **Site chamativo** (uma página, `site/`): explica como funciona o **app** (para quem compra) e o **software/painel** (para o comércio), com as cores da marca,
  seções curtas, chamadas para baixar o app e para o comércio se cadastrar, e como funcionam as promoções. É um site estático: **custo zero** (pode ficar no GitHub
  Pages, gratuito). Publicar na internet é outro passo, e só com a autorização dela. Nenhum dado de preço de terceiros vai nele (só exemplos inventados).
