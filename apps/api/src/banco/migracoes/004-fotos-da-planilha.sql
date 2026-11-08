-- Bolso Certo: foto indicada na planilha do mercado (coluna "Foto", com o link da imagem).
-- O servidor baixa a imagem, reduz e guarda no banco; enquanto isso a linha tem só o link (url) e nenhuma imagem.
-- Aqui só se acrescenta a origem 'planilha' à lista permitida.

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FotosProduto_origem' AND parent_object_id = OBJECT_ID(N'dbo.FotosProduto'))
  ALTER TABLE dbo.FotosProduto DROP CONSTRAINT CK_FotosProduto_origem;
GO

ALTER TABLE dbo.FotosProduto ADD CONSTRAINT CK_FotosProduto_origem CHECK (origem IN ('openfoodfacts', 'mercado', 'planilha'));
GO
