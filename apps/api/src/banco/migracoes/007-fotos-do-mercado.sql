-- Compy: foto PRÓPRIA de cada mercado. A foto de um produto (tabela FotosProduto) é uma só, vista por todos. Quando um mercado envia uma
-- foto de um produto que JÁ tem foto de verdade (de outro mercado ou achada no banco aberto), a dele fica guardada aqui, só para ele
-- (painel e lista de produtos do mercado), e a que já existia continua para os outros.
-- url preenchida com imagem vazia = link da planilha ainda não baixado (o servidor baixa em segundo plano).

IF OBJECT_ID(N'dbo.FotosDoMercado', N'U') IS NULL
CREATE TABLE dbo.FotosDoMercado (
  mercadoId    int          NOT NULL CONSTRAINT FK_FotosDoMercado_Mercados REFERENCES dbo.Mercados (id) ON DELETE CASCADE,
  codigoBarras varchar(32)  NOT NULL,
  url          nvarchar(1000) NULL,
  imagem       nvarchar(max)  NULL,
  atualizadaEm datetime2(3) NOT NULL,
  CONSTRAINT PK_FotosDoMercado PRIMARY KEY (mercadoId, codigoBarras)
);
GO
