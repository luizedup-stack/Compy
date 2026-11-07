# API do Bolso Certo

O Bolso Certo compara preços de produtos entre mercados. Esta é a API (servidor) que o painel web e o aplicativo usam: cadastro e login, importação das planilhas de preços dos mercados, busca com comparação e painel do mercado.

## Como rodar

Na raiz do repositório:

```
npm install
npm run dev -w @mercado/api
```

O servidor sobe em `http://localhost:3000` e mostra essa URL no terminal. O modo `dev` reinicia sozinho quando você altera o código (e, como os dados ficam na memória, eles são recarregados a cada reinício). Para rodar sem reiniciar automático: `npm start -w @mercado/api`.

Testes: `npm test -w @mercado/api`.

## Variáveis de ambiente

| Variável | Para que serve | Padrão |
|---|---|---|
| `PORT` | Porta do servidor | `3000` |
| `HOST` | Endereço em que escuta | `0.0.0.0` |
| `NODE_ENV` | `production` liga as regras de produção. Aceita só `development`, `test` ou `production` (sem diferença de maiúsculas); qualquer outro valor impede o servidor de iniciar. | (vazio = desenvolvimento) |
| `JWT_SECRET` | Segredo que assina os logins. **Obrigatório em produção**, com pelo menos 32 caracteres. Fora de produção, se faltar, um segredo novo é gerado a cada início (os logins antigos deixam de valer). | gerado |
| `ADMIN_EMAIL` e `ADMIN_SENHA` | Administrador do sistema. **Obrigatórios em produção** (senha com pelo menos 8 caracteres). | veja abaixo |
| `CARREGAR_DADOS_DE_TESTE` | `1` carrega as planilhas de teste ao iniciar, `0` não carrega | ligado fora de produção, desligado em produção |
| `PASTA_DADOS_DE_TESTE` | Pasta com as planilhas `.xlsx` a carregar | `dados-de-teste/` na raiz do repositório |
| `LIMITAR_REQUISICOES` | `0` desliga os limites de requisições (veja abaixo) | ligado em qualquer ambiente |
| `BANCO_URL` | Texto de conexão do SQL Server / Azure SQL (formato ADO.NET). Com ele os dados ficam no banco e as tabelas são criadas sozinhas. Sem ele, memória. **Obrigatório em produção** (ou `PERMITIR_SEM_BANCO=1` para um teste descartável). Veja `docs/BANCO.md`. | (vazio = memória) |
| `PAINEL_DIST` | Pasta do painel já compilado; se existir, a API o entrega em `/painel-web/` (a raiz `/` leva para lá). | `apps/painel/dist` |
| `CONFIAR_PROXY` | `1` quando a API está atrás de um proxy de hospedagem (Render): o IP de cada pessoa vem de `X-Forwarded-For`, para o limite de tentativas contar por pessoa. | desligado |
| `PERMITIR_EMAIL_NO_LOG` | `1` aceita que os e-mails (com os códigos de verificação e de redefinição de senha) apareçam só no log. **Obrigatório em produção** enquanto não houver provedor de e-mail. | desligado |

Se uma variável obrigatória faltar em produção, o servidor não inicia e diz qual é.

## Limites de requisições

Por endereço do cliente, numa janela de 1 minuto: todas as rotas `POST /auth/*` juntas (login, cadastro, esqueci a senha, redefinir senha, verificar e reenviar verificação) até **20**; `GET /busca` até **60**. Acima disso a resposta é `429` com `{ "erro": "Muitas tentativas. Tente de novo em alguns instantes." }` e o cabeçalho `Retry-After` (segundos). As demais rotas não têm limite. Os valores são um ponto de partida: ajuste-os com o uso real do piloto.

## Sessões e log

- Cada login leva a identificação da "instância" do servidor. **Sem banco** (memória), ela é nova a cada início: os logins emitidos antes de um reinício deixam de valer (`401 "Sessão inválida"`) e todos entram de novo, porque os ids recomeçam em 1 e um login antigo apontaria para a conta de outra pessoa. **Com banco**, ela fica guardada no próprio banco (`dbo.Configuracao`): reiniciar o servidor não desloga ninguém; recriar o banco do zero sim.
- O log de cada requisição guarda só o método, o caminho (sem a consulta, ou seja, sem o texto das buscas) e o endereço do cliente.

## Dados: banco SQL Server ou memória

- **Com `BANCO_URL`:** tudo (contas, mercados, preços, buscas) fica no banco e sobrevive a reinícios. Ao ligar, o servidor aplica as migrações de `src/banco/migracoes/` (a partir do zero ou só as que faltam).
  A carga dos dados de teste (`CARREGAR_DADOS_DE_TESTE=1`) só acontece se ainda não existe nenhum mercado, para não desfazer correções feitas à mão. Detalhes e consultas para o SSMS: `docs/BANCO.md`.
- **Sem `BANCO_URL`:** tudo fica **na memória** e se perde quando o servidor reinicia (útil para desenvolver e testar). Em desenvolvimento os 4 mercados de teste de `dados-de-teste/`
  (dados inventados) são carregados sozinhos ao iniciar; use `CARREGAR_DADOS_DE_TESTE=0` para começar vazio.
- Planilhas reais em lote para o banco: `npm run carregar -w @mercado/api -- <pasta>` (com `BANCO_URL` definida).
- Testes do banco: `BANCO_TESTE_URL` com o texto de conexão de um banco **vazio e só de testes** (veja `docs/BANCO.md`).

## Entrar como administrador (desenvolvimento)

- Se você definir `ADMIN_EMAIL` e `ADMIN_SENHA`, esse é o administrador.
- Se não definir nada (fora de produção), o servidor cria o administrador `admin@bolsocerto.local` com uma **senha aleatória de 16 caracteres, mostrada uma única vez no terminal** ao iniciar. Ela muda a cada início.

Para entrar: `POST /auth/login` com `{ "email": "...", "senha": "..." }`. A resposta traz um `token`, que vai nas outras chamadas no cabeçalho `Authorization: Bearer <token>`.

Os e-mails do sistema (código de verificação, redefinição de senha) **não são enviados de verdade** pelo servidor de linha de comando: aparecem só no terminal (ou no log da hospedagem). `/saude` responde `{"status":"ok"}` sem tocar no banco; `/saude/banco` confere o banco.

## Principais rotas

| Rota | Quem acessa | O que faz |
|---|---|---|
| `GET /privacidade` | Público | Política de privacidade (página HTML) |
| `POST /auth/cadastro`, `POST /auth/login` | Público | Criar conta de cliente e entrar |
| `POST /auth/verificar-email` | Público | Confirmar o e-mail com o código |
| `POST /auth/reenviar-verificacao` | Logado (exige login) | Enviar de novo o código de confirmação |
| `POST /auth/esqueci-senha`, `POST /auth/redefinir-senha` | Público | Recuperar a senha |
| `DELETE /conta` | Cliente | Excluir a própria conta (as buscas ficam anônimas) |
| `GET /busca?q=...&ordem=unidade\|embalagem` | Cliente | Busca e compara preços entre mercados |
| `GET /mercados`, `GET /mercados/:id/produtos` | Cliente | Mercados ativos e seus produtos |
| `GET /planilhas/modelo`, `POST /planilhas` | Mercado, admin | Baixar o modelo e enviar a planilha de preços |
| `GET /painel/mercado`, `PATCH /painel/mercado`, `GET /painel/cobranca` | Mercado | Painel do mercado |
| `GET /painel/produtos?pagina=N` | Mercado | Lista paginada dos produtos do mercado |
| `PATCH /painel/produtos/:codigo`, `DELETE /painel/produtos/:codigo` | Mercado | Corrigir ou remover um produto |
| `GET /admin/mercados` e demais rotas `/admin/...` | Admin | Gestão dos mercados |

## Antes de publicar

- [ ] **Banco de dados de verdade** (próxima fase): hoje tudo se perde ao reiniciar.
- [ ] **Provedor de e-mail real**: hoje os e-mails só são escritos no log (em produção, só com `PERMITIR_EMAIL_NO_LOG=1`).
- [ ] **Revisar o texto da política de privacidade** (`GET /privacidade`) com alguém qualificado: é um rascunho, e a linha de contato ainda está "a definir".
- [ ] **HTTPS e hospedagem**: definir onde a API roda e colocá-la atrás de HTTPS; configurar `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_SENHA`.
- [ ] **Contas nas lojas de aplicativos** (Google Play e App Store) para publicar o aplicativo.
