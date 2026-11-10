# Segurança do Bolso Certo

Resumo simples do que foi feito para proteger o app, o painel (site dos comércios) e o site de divulgação, e das perguntas
que a dona do projeto fez em 2026-11-10. Tudo aqui é **gratuito** (bibliotecas de código aberto), sem nenhuma conta ou
serviço pago novo.

## O que já protege o dinheiro e os dados

- **Senhas:** nunca guardadas em texto puro. Ficam como hash (`bcryptjs`), que não dá para "descriptografar" de volta.
- **Login:** token assinado (JWT) com uma chave só do servidor; o papel (cliente/mercado/admin) é **sempre conferido no banco**
  a cada pedido, nunca confiado no que está escrito no token (`apps/api/src/auth/guardas.ts`). Trocar o papel à mão no
  token não funciona: a assinatura não bate e o servidor recusa (401). Ver teste em `apps/api/src/seguranca.test.ts`.
- **Um comércio não acessa o de outro:** toda rota confere se o item (produto, pedido de promoção, foto) é mesmo do
  comércio logado antes de mostrar ou alterar (`apps/api/src/painel/mercadoEscolhido.ts` e as rotas de promoção).
- **SQL:** todas as consultas usam parâmetros (nunca o texto digitado é colado dentro do comando SQL), então "injeção
  de SQL" não funciona — testado com várias tentativas clássicas em `seguranca.test.ts`.
- **Dinheiro das promoções:** o valor de cada pedido vem sempre do que está configurado no servidor
  (`apps/api/src/promocoes/pedidos.ts`), nunca do que o aplicativo do comércio envia. Só a administração (você) marca um
  pedido como pago, e isso acontece numa única transação (não dá para "pagar" duas vezes nem aplicar pela metade).
- **Fotos e caminhos de arquivo:** o endereço da foto só aceita um código de barras (8 a 14 dígitos); qualquer tentativa
  de pedir outro arquivo do computador (`../../etc/passwd`, por exemplo) é recusada antes de qualquer leitura.
- **Limite de tentativas:** login e buscas têm um teto de pedidos por minuto, por endereço de internet
  (`apps/api/src/app.ts`, `registrarLimites`), para dificultar um ataque de "tentar muitas senhas".
- **Cabeçalhos de segurança do navegador (novo, 10/11/2026):** instalado o `@fastify/helmet`, que acrescenta, em
  **toda resposta**: proibição de abrir o painel dentro de outro site (clique-sequestro), proibição do navegador
  "adivinhar" o tipo de um arquivo, e uma política de conteúdo (CSP) que só deixa o próprio código do painel rodar
  (nenhum script de fora consegue ser injetado e executado).

## Testes de segurança (não é só "funciona"; é "resiste a ataque")

Arquivo `apps/api/src/seguranca.test.ts`, roda com `npm test`, cobre:
1. Cabeçalhos de segurança presentes em toda resposta.
2. Tentativas de injeção de SQL no login, na busca e no cadastro de produto.
3. Token adulterado (papel trocado à mão) e token de um início antigo do servidor.
4. Um comércio tentando ver/mexer no pedido ou nos produtos de outro (IDOR).
5. Tentativas de "sair da pasta" pelo endereço da foto.
6. Confirmação de que o valor de uma promoção nunca vem do cliente.

## O que foi pedido e não é possível (e por quê) — "deixar o código criptografado para não ter cópia com REA"

Isto é importante explicar sem prometer o que não existe:

- **O código do app (React Native) e do programa de Windows (Electron) são JavaScript.** Para o celular ou o
  computador rodarem esse código, o aparelho **precisa conseguir lê-lo** em algum momento — então qualquer
  "criptografia" teria que guardar a chave de decifrar junto com o próprio programa, e quem decifra o programa
  também acha a chave. Isso vale para **qualquer** app feito nessas tecnologias (não é um problema só do Bolso Certo).
- O que existe de verdade, e **já está em uso**:
  - O app Android já roda com o código compilado para **bytecode do Hermes** (não o texto do JavaScript), que é bem
    mais difícil de ler do que o código-fonte, mas ainda pode ser examinado por quem tem ferramentas como o REA.
  - O programa de Windows empacota o código num arquivo `.asar`, que já não é "uma pasta de arquivos .js soltos".
  - **Nenhum segredo de verdade fica no app nem no programa**: nem senha de banco de dados, nem chave de assinar
    login (isso mora só no servidor, em variáveis de ambiente, fora do que é instalado no celular/computador).
    É por isso que mesmo alguém lendo o código do app não consegue, por exemplo, criar um administrador ou mexer
    no banco: essas chaves nunca saem do servidor.
- **Então a defesa certa não é "esconder o código", é não colocar nada secreto nele** — e isso já é como o projeto
  funciona hoje. Ofuscar o JavaScript do app (deixar os nomes das variáveis sem sentido, por exemplo) atrapalha um
  pouco a leitura, mas não impede de verdade uma ferramenta de engenharia reversa; por isso não prometo isso como
  "proteção", só como uma dificuldade a mais, e não é algo que mudamos agora.

## O que ainda vale considerar (sem custo nenhum, a qualquer momento)

- Ativar a verificação em duas etapas da sua própria conta do GitHub, do Render e do Azure (são contas, não do app).
- Pedir de vez em quando (ex.: a cada mês) que eu rode de novo `apps/api/src/seguranca.test.ts` depois de qualquer
  mudança grande, para confirmar que nada abriu uma brecha nova.
- Se um dia quiser uma avaliação externa (um "pentest" de verdade, por outra empresa), isso tem custo e eu aviso
  antes — não é algo que eu faça sozinho.
