-- Bolso Certo: fotos dos produtos.
-- A foto é do CÓDIGO DE BARRAS (igual para todos os mercados que vendem o produto). Pode ser achada sozinha num banco aberto de
-- produtos (origem 'openfoodfacts', guarda só o endereço da imagem) ou enviada por um mercado (origem 'mercado', guarda a imagem
-- pequena como texto "data:image/jpeg;base64,..."). Uma linha sem url e sem imagem quer dizer "procurou e não achou": a busca
-- automática só tenta de novo depois de um tempo.

IF OBJECT_ID(N'dbo.FotosProduto', N'U') IS NULL
CREATE TABLE dbo.FotosProduto (
  codigoBarras varchar(32) NOT NULL CONSTRAINT PK_FotosProduto PRIMARY KEY,
  origem       varchar(15) NOT NULL CONSTRAINT CK_FotosProduto_origem CHECK (origem IN ('openfoodfacts', 'mercado')),
  url          nvarchar(1000) NULL,
  imagem       nvarchar(max) NULL,
  -- Mercado que enviou a foto. Se o mercado for apagado do banco, a foto fica (sem dono).
  mercadoId    int NULL CONSTRAINT FK_FotosProduto_Mercados REFERENCES dbo.Mercados (id) ON DELETE SET NULL,
  atualizadaEm datetime2(3) NOT NULL
);
GO
