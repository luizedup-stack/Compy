-- Bolso Certo: pedidos de promoções (descontos pagos).
-- Quando um comércio envia uma planilha com a aba "Descontos", a planilha inteira fica RETIDA aqui (nada vai para o ar) até a dona
-- confirmar o pagamento (Pix manual). Só então a planilha é aplicada. O valor por promoção e a chave Pix ficam na tabela Configuracao
-- (chaves 'promocao.valorCentavos' e 'pix.chave'). O valor de cada promoção fica gravado no pedido: mudar o preço depois não altera pedidos antigos.
-- Se o comércio for apagado, os pedidos dele somem junto (ON DELETE CASCADE).

IF OBJECT_ID(N'dbo.PedidosPromocao', N'U') IS NULL
CREATE TABLE dbo.PedidosPromocao (
  id                    int IDENTITY(1,1) NOT NULL CONSTRAINT PK_PedidosPromocao PRIMARY KEY,
  mercadoId             int NOT NULL CONSTRAINT FK_PedidosPromocao_Mercados REFERENCES dbo.Mercados (id) ON DELETE CASCADE,
  criadoEm              datetime2(3) NOT NULL,
  situacao              varchar(12) NOT NULL CONSTRAINT CK_PedidosPromocao_situacao CHECK (situacao IN ('aguardando', 'pago', 'cancelado')),
  quantidade            int NOT NULL,
  valorUnitarioCentavos int NOT NULL,
  totalCentavos         int NOT NULL,
  avisouPagamentoEm     datetime2(3) NULL,
  pagoEm                datetime2(3) NULL,
  -- A planilha já lida (produtos, fotos e descontos) em JSON; esvaziada quando o pedido é pago ou cancelado.
  planilha              nvarchar(max) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosPromocao_mercado' AND object_id = OBJECT_ID(N'dbo.PedidosPromocao'))
CREATE INDEX IX_PedidosPromocao_mercado ON dbo.PedidosPromocao (mercadoId, situacao);
GO
