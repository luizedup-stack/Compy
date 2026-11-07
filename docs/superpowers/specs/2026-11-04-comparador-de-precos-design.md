# Comparador de preços de supermercados — Design

Data: 2026-11-04
Piloto: Vila Sônia, São Paulo (perto do Butantã)

Legenda: tudo que não está marcado foi dito pelo Luiz. Itens marcados com **(minha decisão)** são escolhas feitas na hora de escrever este documento, que o Luiz ainda não confirmou.

## 1. Intenção e motivo

O Luiz quer olhar o preço dos produtos em vários mercados **antes de sair de casa**, ver onde está mais barato e só então comprar. Hoje isso exige ir de mercado em mercado ou procurar folhetos. A ideia é ter um lugar único onde os mercados da região mostram seus produtos e preços e o cliente compara.

São dois produtos que conversam entre si:

1. **Painel do mercado (software web).** O mercado envia uma **planilha Excel com tudo dentro** (dados do estabelecimento, produtos e preços). Depois de enviada, tudo sobe sozinho para o software e para o app, sem outro passo. Se algo estiver errado, o mercado pode **corrigir à mão dentro do software** (preço, nome, quantidade, remover produto, dados do estabelecimento). Não é para cadastrar tudo um a um: a planilha sobe tudo de uma vez e a edição manual serve só para ajustes.
2. **App do cliente (celular).** O cliente usa o app **sem precisar de conta** (desde 2026-11-07; cadastro e login são opcionais, na aba Conta), vê os mercados e os produtos e compara preços entre mercados. O app é **só para ver e comparar: não tem nenhuma edição** de produtos, preços ou mercados. Toda correção é feita no software, pelo mercado.

Começa do zero: **não existe nenhum mercado parceiro ainda.** O Luiz mora na Vila Sônia e quer começar por ali.

## 2. Objetivos

- O cliente busca um produto e vê, numa lista só, o mesmo tipo de produto em todos os mercados da região, com preço e mercado, ordenado do mais barato ao mais caro.
- O mercado consegue colocar seus produtos no ar em poucos minutos e atualizar preços sem esforço.
- **A quantidade do produto é importante** (palavras do Luiz): a comparação deve ser justa, então o app mostra o preço por unidade (por rolo, por kg, por litro) quando a quantidade foi informada.
- O piloto funciona na Vila Sônia com poucos mercados (minha decisão: 3 a 5).
- No início o uso é **gratuito** para mercados e clientes.
- O sistema nasce preparado para, mais tarde, **cobrar o mercado quando ele quiser colocar promoção** (seção 7).

## 3. Não objetivos da primeira versão

- Cobrança de verdade e promoções pagas (só a preparação, seção 7).
- Cadastrar os produtos um por um pela tela. O Luiz disse que não dá para subir tudo 1 a 1: a planilha é o caminho. A tela serve só para corrigir o que a planilha trouxe (seção 5). Incluir um produto **novo** à mão fica de fora; produto novo entra por planilha. (minha decisão sobre o limite)
- Qualquer edição de produto, preço ou mercado pelo app do cliente (o app é só para ver e comparar).
- Compra, pagamento ou entrega pelo app: o cliente só consulta e compra no mercado. (minha decisão)
- Outras regiões além da Vila Sônia. (minha decisão)
- Produtos sem código de barras (pão, frutas, verduras, a granel): ficam de fora, consequência do código obrigatório.
- Lista de compras com soma do total por mercado. Foi uma ideia minha durante a conversa, o Luiz não decidiu. Fica como candidata para a versão seguinte. (minha decisão)

## 4. O que seria um fracasso mesmo que tecnicamente funcione (anti-objetivos)

- **Preço errado ou velho.** Se o cliente chega no mercado e o preço é outro, ele deixa de confiar. (minha leitura do risco; o Luiz não falou disso diretamente)
- **Cadastro trabalhoso.** Se o dono do mercado desiste na primeira tentativa, o app fica vazio.
- **No futuro:** promoção paga que bagunça a lista e faz o cliente achar que o mais barato não é o mais barato (seção 7).

## 5. Regras de cadastro do mercado

Decididas pelo Luiz:

- **Inicialmente o cadastro é só por planilha.** A planilha precisa ter tudo: é só enviá-la, e todas as informações sobem para o software e **automaticamente para o app**.
- **O mercado pode corrigir os dados à mão, somente no software**, depois de subir a planilha. O app do cliente não edita nada.
- **Obrigatório do produto:** código de barras, nome e preço.
- **Obrigatório do estabelecimento:** nome e endereço (também vêm na planilha).
- O resto é opcional.
- **Código de barras obrigatório em todo produto.** O motivo do Luiz: é o código que faz o sistema entender quais são os produtos de fato, inclusive quando os nomes são muito parecidos. Consequência que ele ainda não comentou: pão, fruta, verdura e produto a granel não têm código, então ficam fora da primeira versão. Só entram produtos embalados com código de barras. (minha leitura da consequência)
- Publicação automática: não há aprovação de um administrador entre o envio e o app.

Planilha-modelo (minha decisão sobre o formato): um arquivo Excel com **duas abas**.

- Aba `Mercado`: duas linhas, `Nome do mercado*` e `Endereço*`, com o valor ao lado.
- Aba `Produtos`: colunas `Código de barras*`, `Produto*`, `Preço*`, `Quantidade`, `Categoria`, e uma coluna opcional `Disponível` (`sim`/`não`; em branco vale `sim`).

O painel oferece o modelo para baixar. Os arquivos de exemplo estão em `dados-de-teste/`.

Comportamento da planilha (minha decisão):

- A primeira vez que chega uma planilha com um nome e endereço novos, o mercado é **criado**. Quando chega de novo, o mercado é **atualizado**.

- Preço aceita `14,90` e `14.90`.
- Linha com erro não derruba a planilha inteira: o sistema importa as linhas boas e devolve uma lista clara das linhas com problema.
- Enviar a planilha de novo **atualiza** os preços dos produtos que já existem naquele mercado em vez de duplicar. Dois itens do mesmo mercado são o mesmo produto quando têm o mesmo código de barras. Linha sem código é rejeitada e entra na lista de erros da planilha.
- Produto que estava cadastrado e não veio na planilha nova **continua no app**, e a idade do preço dele vai aumentando (o aviso de preço velho cuida disso). Para tirar um produto do app, o mercado envia a planilha com `Disponível` = `não` nessa linha, ou remove o produto pela tela do painel. Nada some sozinho.
- **Correção manual no painel** (minha decisão sobre o que ela cobre): uma lista dos produtos do mercado, onde cada linha pode ter nome, preço, quantidade, categoria e disponibilidade alterados, e o produto pode ser removido. O código de barras não é editável (para trocar, envia-se de novo pela planilha). Os dados do estabelecimento (nome e endereço) também podem ser corrigidos. A correção publica na hora no app e atualiza a "idade do preço".
- **Se o mercado corrigir à mão e depois enviar a planilha de novo, a planilha vence**: ela sobrescreve a correção manual dos produtos que estão nela. Produtos que não estão na planilha mantêm a correção. (minha decisão; o Luiz não disse como resolver esse choque)
- Quantidade na planilha é texto livre que o sistema tenta entender. Se não entender ou estiver em branco, o produto aparece sem preço por unidade e com um aviso discreto.
- Unidades que o sistema entende na primeira versão: `g`, `kg`, `ml`, `L`, `un`/`unidade`, `rolo(s)`, `dúzia`, e embalagens do tipo `2 x 500 g`. Fora da primeira versão: "leve 3 pague 2" e comparar rolos com metros (papel higiênico compara por rolo). Preço por unidade só compara produtos da mesma unidade (por kg com por kg, por rolo com por rolo).

## 6. Como o cliente usa o app

Decidido pelo Luiz:

- O cliente **usa o app sem login**; se quiser, entra ou cria conta pela aba Conta. (Mudança de 2026-11-07: antes o cadastro era obrigatório.)
- Vê os supermercados e os produtos.
- Compara cada produto entre os mercados, com preços.

Busca (como o Luiz descreveu): o cliente digita "papel higiênico" e vem a lista de tudo que é papel higiênico, "Fox" num mercado, "X" em outro, e ele compara os preços. Não é preciso que os dois mercados escrevam igual.

A identidade do produto tem duas camadas (minha decisão sobre como juntar as duas coisas que o Luiz pediu):

1. **Busca por nome.** Os dois nomes ("Papel Higiênico Fox" e "Papel Higiênico X") contêm as palavras "papel higiênico", e a busca encontra por **palavras do nome**. Não existe catálogo de tipos de produto: o cliente olha a lista e decide, e cada mercado só precisa escrever o tipo de produto no nome.
2. **Código de barras.** Quando dois mercados cadastram o **mesmo código**, o sistema sabe com certeza que é o mesmo produto, mesmo que o nome esteja escrito diferente ou parecido demais. Esses itens aparecem juntos como "mesmo produto" na lista, com o preço de cada mercado lado a lado. O código também evita duplicar um produto dentro do mesmo mercado.

Como o código é obrigatório, todo produto tem as duas camadas. Se o mesmo código vier com nomes diferentes em mercados diferentes, o app mostra o produto como um só, usando o nome mais completo (a regra exata fica para o construtor).

Detalhes que eu proponho (minha decisão):

- A busca tolera acento, maiúsculas, erro leve de digitação e nomes parecidos.
- Cada resultado mostra: nome do produto, mercado, endereço, preço, preço por unidade (quando há quantidade) e **há quantos dias o preço foi atualizado**.
- Ordem padrão: do menor preço por unidade ao maior. Produtos sem quantidade entendida vêm **depois** dos que têm, ordenados pelo preço da embalagem, com aviso. O cliente pode trocar para ordenar só pelo preço da embalagem.
- O app só mostra a idade do preço e um aviso quando está velho (sugestão: mais de 7 dias). Preço velho **não é escondido** nem rebaixado automaticamente.
- Sem filtro de localização na primeira versão: o cliente vê todos os mercados cadastrados do piloto, cada um com seu endereço. Distância, GPS e mapa ficam para depois.
- O mercado recebe um aviso no painel quando seus preços estão velhos (sugestão: mais de 7 dias).
- O desenho que o Luiz viu está na pasta `.superpowers/brainstorm/` (tela do app e tela do painel). Ele é **anterior** às decisões de código de barras e de cadastro só por planilha: a tela do painel mostra cadastro um por um e não mostra o código. Vale o texto deste documento.

## 7. Cobrança futura (aba de cobrança)

Pedido do Luiz: no início não se cobra nada; **depois, o mercado precisará pagar para colocar promoção.** Ele quer que o projeto já seja pensado para isso.

O que isso significa para a primeira versão (minha decisão):

- O painel do mercado já tem uma aba **Cobrança**, mostrando algo como "gratuito por enquanto". Assim o lugar existe e o mercado já sabe que vem aí.
- O modelo de dados já tem espaço para: situação da conta do mercado (gratuita, ativa, em atraso) e, no produto, campos de promoção (preço promocional, data de início e fim). A primeira versão não usa esses campos.
- Promoções ficam **desligadas** na primeira versão.
- Regra a respeitar quando a cobrança chegar: promoção paga aparece marcada como "Promoção" e **não pode alterar a ordem de preço** da busca, para o cliente continuar confiando que o mais barato é o mais barato. (minha decisão; vale confirmar com o Luiz na hora)
- A forma de pagamento (Pix, cartão, boleto, quem processa) e os valores **não foram decididos** e ficam para depois.

## 8. Começar do zero

Sem mercados parceiros, o app nasce vazio. Plano (minha decisão):

- **Os primeiros mercados entram só enviando a planilha** (decisão do Luiz). Para o teste, existem 4 mercados e seus produtos inventados em `dados-de-teste/`, no formato da seção 5.
- O painel tem um papel de **administrador interno** (a equipe do Luiz) que pode enviar a planilha de qualquer mercado, para montar os primeiros mercados do bairro. Depois cada mercado envia a própria. (minha decisão)
- Como a publicação é automática, um dado errado ou falso aparece direto no app. No piloto isso é aceito; a revisão por administrador pode voltar se virar problema. (minha observação sobre a consequência da decisão do Luiz)
- A conversa com os donos de mercado depende de mostrar algo que já funciona, então o app com dados da Vila Sônia vem antes da primeira visita.

## 9. Restrições

- Cliente e mercado têm login próprio (e-mail e senha). Guardar só os dados mínimos do cliente por causa da LGPD. (minha decisão)
- Cadastro do cliente é **opcional** (decisão do Luiz, 2026-11-07; antes era obrigatório): buscar, ver mercados e produtos é público. Quem cria conta tem perfil (foto, nome). Dados: e-mail e senha, com recuperação de senha. Verificação de e-mail e política de privacidade com exclusão de conta entram na primeira versão. (minha decisão)
- Uma conta de mercado = um estabelecimento (um nome e um endereço) e um login. Rede com várias lojas cadastra cada loja separadamente. O modelo de dados deve permitir, depois, vários usuários por loja e várias lojas por dono. Mercado removido por um administrador deixa de aparecer no app, mas os dados são mantidos. Um mercado com login que envia planilha com nome ou endereço diferentes do cadastrado **atualiza o próprio cadastro** e não cria outro mercado; só o administrador cria mercados novos. (minha decisão)
- A primeira versão deve poder ser construída e mantida por uma equipe muito pequena.

## 10. Como será construído (minha decisão, o Luiz não escolheu)

O Luiz deixou isto comigo. Sugestão:

- Uma linguagem só (TypeScript) para tudo.
- App de celular com React Native (um código só para Android e iPhone).
- Painel web em React.
- **Sem banco de dados nesta fase (decisão do Luiz: "isso faremos posteriormente").** O servidor guarda tudo em memória, atrás de uma interface que o banco substituirá depois sem mudar o resto. Os dados somem ao reiniciar o servidor; para testar, o servidor recarrega os arquivos de `dados-de-teste/` ao iniciar.
- Quando o banco entrar: PostgreSQL (minha sugestão; tem busca por nome parecido pronta, que combina com a busca tolerante).
- Leitura de Excel por biblioteca pronta.

Distribuição do app (minha decisão): o Luiz pediu um app de celular, então ele é nativo (Android e iPhone). No piloto, com poucas pessoas, ele é entregue por link de teste. Publicar nas lojas (Google Play e App Store, com conta de desenvolvedor paga e revisão) fica como passo posterior, quando o piloto funcionar.

O construtor pode trocar qualquer um desses se tiver um bom motivo, desde que o resultado para o usuário seja o mesmo.

## 11. Deixado para o construtor

- Telas finais, cores, nomes de botões e textos.
- Detalhes técnicos da busca por nome parecido e da leitura da quantidade.
- Onde hospedar.
- Estrutura dos dados, respeitando a seção 7 (e a do banco de dados, quando ele entrar).
- Validação do código de barras (formato e dígito verificador) e se vale preencher nome e imagem automaticamente a partir de um catálogo público de códigos.

## 12. Ainda em aberto

- ~~Nome do produto/marca do app.~~ Resolvido: o nome é **Bolso Certo** (escolhido pelo Luiz). O logo está em `marca/` (bolso com sinal de certo e moeda, verde). Falta conferir o nome no INPI, no Google Play, na App Store e se há domínio livre.
- Valor e forma da cobrança futura.
- Se a lista de compras com total fica para a versão 2.
- Como medir se o piloto deu certo. Sugestão minha: pelo menos 3 mercados com algumas centenas de produtos cada, de modo que uma busca comum retorne mais de um mercado. A primeira versão registra as buscas feitas (para medir isso depois), sem painel de métricas. (minha decisão)