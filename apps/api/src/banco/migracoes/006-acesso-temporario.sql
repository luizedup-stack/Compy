-- Bolso Certo: acesso temporário. Um mercado "removido" (sem acesso) pode ter uma data para voltar sozinho.
-- removidoAte vazio com status 'removido' = sem acesso por tempo indeterminado (permanente, até alguém dar o acesso de novo).

IF COL_LENGTH(N'dbo.Mercados', N'removidoAte') IS NULL
  ALTER TABLE dbo.Mercados ADD removidoAte datetime2(3) NULL;
GO
