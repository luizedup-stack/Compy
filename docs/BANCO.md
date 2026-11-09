# O banco de dados (SQL Server / Azure SQL)

O servidor guarda tudo num banco SQL Server. Este guia é para quem abre o **SSMS** e quer saber o que tem lá dentro.
Como ligar o banco na internet, de graça: `docs/HOSPEDAGEM.md`.

## Como o servidor escolhe entre banco e memória

| Variável `BANCO_URL` | O que acontece |
|---|---|
| definida | usa o banco; ao ligar, cria/atualiza as tabelas sozinho |
| vazia (desenvolvimento) | usa a memória (como antes): rápido para testar, tudo some ao reiniciar |
| vazia em produção | o servidor **não liga**, a menos que `PERMITIR_SEM_BANCO=1` |

O programa de Windows **no modo local** continua usando memória + arquivo salvo (não precisa de banco). No modo nuvem ele nem liga a API.

O texto de conexão é o do portal do Azure / SSMS (formato ADO.NET), por exemplo:

```
Server=tcp:meu-servidor.database.windows.net,1433;Initial Catalog=bolso;User ID=bolsoadmin;Password=...;Encrypt=True;TrustServerCertificate=False;
```

Para um SQL Server no seu computador: `Server=localhost,1433;Database=bolso;User ID=sa;Password=...;Encrypt=False;TrustServerCertificate=True`
(crie o banco vazio no SSMS antes: `CREATE DATABASE bolso;`).

## Tabelas

Criadas por `apps/api/src/banco/migracoes/001-criar-tabelas.sql` e `002-configuracao.sql` (você pode ler e até rodar no SSMS: não apagam nada).

| Tabela | O que guarda | Observações |
|---|---|---|
| `Usuarios` | Contas: clientes, mercados e o administrador | `emailNorm` (minúsculas) é único. Senha só como hash (bcrypt), nunca a senha. |
| `Tokens` | Códigos de "esqueci minha senha" (e de verificação) | Só o **hash** do código; apagados ao usar ou vencer. |
| `Mercados` | Cada mercado (nome, endereço, telefone, dono) | `status` = `ativo`/`removido` (remover não apaga). Nome + endereço não se repetem (`chave`, um hash). `detalhes` é um JSON com o endereço por partes. |
| `Ofertas` | Produto + preço de cada mercado | Chave: (`mercadoId`, `codigoBarras`). `seq` é a ordem de entrada. |
| `Buscas` | Cada busca feita no app | Sem ligação com a pessoa depois que ela exclui a conta. `feitaEm` (UTC) mede o uso do piloto. |
| `FotosProduto` | Foto de cada produto, pelo **código de barras** (vale para todos os mercados) | `imagem` = o JPEG pequeno guardado no banco. `origem` = `mercado` (enviada pelo painel), `planilha` (link da coluna "Foto", baixado pelo servidor), `openfoodfacts` (achada sozinha) ou `ilustrativa` (a foto do tipo de produto, quando não há a específica; é trocada sozinha quando esta aparece). `url` = o link de origem. Linha com `url` e sem `imagem` = na fila para baixar; sem `url` e sem `imagem` = "procurou e não achou" (procura de novo depois de 30 dias). |
| `FotosDoMercado` | Foto PRÓPRIA de um mercado para um produto (`url` = link da planilha ainda não baixado; `imagem` = o JPEG pequeno) | Só existe quando o produto já tinha foto de verdade de outro mercado ou do banco aberto: a foto compartilhada (`FotosProduto`) continua para os outros e a do mercado fica só para ele. Se o produto não tinha foto, a do mercado vira a de todos e esta tabela não é usada. |
| `Configuracao` | `instancia`: identifica **este banco** | Entra nas sessões (logins). Apagar e recriar o banco muda o valor e desloga todos, de propósito. |
| `SchemaVersao` | Quais arquivos de migração já foram aplicados | |

## Consultas úteis no SSMS

```sql
-- Quantos produtos cada mercado tem (e quando o preço mais recente foi atualizado)
SELECT m.id, m.nome, m.status, COUNT(o.codigoBarras) AS produtos, MAX(o.precoAtualizadoEm) AS ultimaAtualizacao
FROM dbo.Mercados m LEFT JOIN dbo.Ofertas o ON o.mercadoId = m.id
GROUP BY m.id, m.nome, m.status ORDER BY m.id;

-- Produtos mais baratos de um tipo, entre os mercados ativos
SELECT TOP 20 m.nome AS mercado, o.nome, o.preco, o.quantidadeTexto
FROM dbo.Ofertas o JOIN dbo.Mercados m ON m.id = o.mercadoId
WHERE m.status = 'ativo' AND o.disponivel = 1 AND o.nomeNorm LIKE N'%papel higienico%'
ORDER BY o.preco;

-- Produtos com preço desatualizado (mais de 7 dias)
SELECT m.nome AS mercado, o.nome, o.preco, o.precoAtualizadoEm
FROM dbo.Ofertas o JOIN dbo.Mercados m ON m.id = o.mercadoId
WHERE o.precoAtualizadoEm < DATEADD(DAY, -7, SYSUTCDATETIME()) ORDER BY o.precoAtualizadoEm;

-- Uso do piloto: buscas por dia, quantas acharam algo e quantas comparam 2+ mercados
SELECT CAST(feitaEm AS date) AS dia, COUNT(*) AS buscas,
       SUM(CASE WHEN resultados > 0 THEN 1 ELSE 0 END) AS comResultado,
       SUM(CASE WHEN mercadosDistintos >= 2 THEN 1 ELSE 0 END) AS comparamMercados
FROM dbo.Buscas GROUP BY CAST(feitaEm AS date) ORDER BY dia DESC;

-- O que as pessoas buscam e não encontram
SELECT TOP 30 termo, COUNT(*) AS vezes FROM dbo.Buscas WHERE resultados = 0 GROUP BY termo ORDER BY vezes DESC;

-- Quantos produtos têm foto, e de onde veio
SELECT origem, COUNT(*) AS produtos FROM dbo.FotosProduto WHERE url IS NOT NULL OR imagem IS NOT NULL GROUP BY origem;

-- Produtos à venda que ainda estão sem foto (nunca procurados ou não achados), com quantos mercados vendem
SELECT o.codigoBarras, MIN(o.nome) AS nome, COUNT(*) AS mercados
FROM dbo.Ofertas o LEFT JOIN dbo.FotosProduto f ON f.codigoBarras = o.codigoBarras
WHERE f.url IS NULL AND f.imagem IS NULL
GROUP BY o.codigoBarras ORDER BY mercados DESC, nome;

-- Contas por papel
SELECT papel, COUNT(*) AS contas FROM dbo.Usuarios GROUP BY papel;
```

Mexer nos dados pelo SSMS funciona (o servidor lê o banco; a cópia que ele guarda da lista da busca vale no máximo 30 segundos),
mas prefira o painel para preços e mercados: ele aplica as regras (por exemplo, a planilha sempre vence a correção manual).
**Não apague nem altere** `Configuracao` e `SchemaVersao` à mão.

## Mudar a estrutura do banco (para quem for mexer no código)

1. Crie um arquivo novo e numerado em `apps/api/src/banco/migracoes/`, por exemplo `003-nome-da-mudanca.sql`. **Nunca edite um arquivo
   já aplicado** em algum banco: o servidor não roda de novo o que já foi aplicado.
2. Escreva em T-SQL que possa rodar mais de uma vez sem erro (`IF OBJECT_ID(...) IS NULL ...`); `GO` sozinho numa linha separa blocos, como no SSMS.
3. Ajuste `apps/api/src/repositorioSqlServer.ts` e rode os testes com banco (abaixo).

## Rodar os testes com um SQL Server de verdade

Sem configuração nenhuma, `npm test` roda só com a memória e **pula** os testes do banco. Para incluí-los, crie um banco **vazio e só de testes**
(o teste apaga tudo o que houver nele) e informe o texto de conexão:

```powershell
$env:BANCO_TESTE_URL = "Server=localhost,1433;Database=bolso_teste;User ID=sa;Password=...;Encrypt=False;TrustServerCertificate=True"
npm test -w @mercado/api
```

Isso roda o mesmo contrato do repositório em memória contra o banco, mais o roteiro fim a fim da API (`fimafim.test.ts`). Os testes ligam
`READ_COMMITTED_SNAPSHOT` no banco de testes (o Azure SQL já vem assim; num SQL Server local o servidor funciona nos dois modos, mas leituras
passam a esperar gravações em andamento quando ele está desligado).

## Cuidados

- **Transações:** quem altera várias coisas juntas (enviar planilha, por exemplo) usa uma transação que pega uma trava do banco
  (`sp_getapplock`); duas dessas nunca rodam ao mesmo tempo, mesmo com dois servidores. Para o piloto isso é mais simples e seguro que travar linha a linha.
- **Cópia da busca:** o servidor guarda por até 30 s a lista de produtos usada na busca, e a descarta a cada escrita feita por ele. Assim cada
  busca não baixa o catálogo inteiro do banco pela internet.
- **Banco gratuito do Azure pausado:** a primeira conexão pode levar ~1 minuto. O servidor tenta de novo sozinho (por alguns minutos na partida;
  4 tentativas durante o uso).
