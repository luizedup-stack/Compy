-- Compy: o comércio escolhe se quer ser avisado por e-mail quando uma promoção dele é aprovada.
-- Padrão: avisar (1). Editável em "Meu comércio".

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Mercados') AND name = 'avisarPromocaoEmail')
ALTER TABLE dbo.Mercados ADD avisarPromocaoEmail bit NOT NULL CONSTRAINT DF_Mercados_avisarPromocaoEmail DEFAULT (1);
GO
