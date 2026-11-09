-- Bolso Certo: foto ilustrativa (a foto do TIPO de produto, usada quando não há a foto específica).
-- Aqui só se acrescenta a origem 'ilustrativa' à lista permitida.

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FotosProduto_origem' AND parent_object_id = OBJECT_ID(N'dbo.FotosProduto'))
  ALTER TABLE dbo.FotosProduto DROP CONSTRAINT CK_FotosProduto_origem;
GO

ALTER TABLE dbo.FotosProduto ADD CONSTRAINT CK_FotosProduto_origem CHECK (origem IN ('openfoodfacts', 'mercado', 'planilha', 'ilustrativa'));
GO
