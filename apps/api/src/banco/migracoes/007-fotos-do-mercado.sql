-- Bolso Certo: foto do produto que vale SÓ para o mercado que a enviou.
-- A regra: quando um mercado envia a foto de um produto que ainda NÃO tem foto, ela vira a foto de todos (tabela FotosProduto).
-- Se o produto já tem foto, a do mercado fica guardada aqui, e só aparece para o próprio mercado.
-- Se o mercado for apagado, as fotos dele daqui somem junto (ON DELETE CASCADE).

IF OBJECT_ID(N'dbo.FotosProdutoMercado', N'U') IS NULL
CREATE TABLE dbo.FotosProdutoMercado (
  mercadoId    int NOT NULL CONSTRAINT FK_FotosProdutoMercado_Mercados REFERENCES dbo.Mercados (id) ON DELETE CASCADE,
  codigoBarras varchar(32) NOT NULL,
  imagem       nvarchar(max) NOT NULL,
  atualizadaEm datetime2(3) NOT NULL,
  CONSTRAINT PK_FotosProdutoMercado PRIMARY KEY (mercadoId, codigoBarras)
);
GO
