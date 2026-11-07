-- Bolso Certo: configurações guardadas no próprio banco.
-- "instancia" identifica ESTE banco. Ela entra nas sessões (tokens) das pessoas: se o banco for apagado e recriado,
-- ela muda e as sessões antigas deixam de valer (senão um login antigo poderia cair na conta nova de outra pessoa).

IF OBJECT_ID(N'dbo.Configuracao', N'U') IS NULL
CREATE TABLE dbo.Configuracao (
  chave nvarchar(100) NOT NULL CONSTRAINT PK_Configuracao PRIMARY KEY,
  valor nvarchar(max) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Configuracao WHERE chave = N'instancia')
INSERT INTO dbo.Configuracao (chave, valor) VALUES (N'instancia', CONVERT(nvarchar(36), NEWID()));
GO
