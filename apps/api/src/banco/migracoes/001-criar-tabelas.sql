-- Bolso Certo: tabelas do banco (SQL Server / Azure SQL).
-- O servidor roda este arquivo sozinho ao ligar (só uma vez: a tabela SchemaVersao guarda o que já foi aplicado),
-- mas você também pode rodá-lo à mão no SSMS: ele não apaga nada que já exista.
-- Linhas com apenas GO separam blocos, como no SSMS.

IF OBJECT_ID(N'dbo.Usuarios', N'U') IS NULL
CREATE TABLE dbo.Usuarios (
  id              int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Usuarios PRIMARY KEY,
  email           nvarchar(320) NOT NULL,
  -- E-mail em minúsculas: é ele que não pode se repetir (a API grava já pronto).
  emailNorm       nvarchar(320) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT UQ_Usuarios_emailNorm UNIQUE,
  senhaHash       nvarchar(200) NOT NULL,
  papel           varchar(10)   NOT NULL CONSTRAINT CK_Usuarios_papel CHECK (papel IN ('cliente', 'mercado', 'admin')),
  emailVerificado bit           NOT NULL,
  nome            nvarchar(200) NULL,
  -- Foto de perfil pequena, como texto "data:image/...;base64,...".
  foto            nvarchar(max) NULL
);
GO

IF OBJECT_ID(N'dbo.Tokens', N'U') IS NULL
CREATE TABLE dbo.Tokens (
  id        bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Tokens PRIMARY KEY,
  usuarioId int NOT NULL CONSTRAINT FK_Tokens_Usuarios REFERENCES dbo.Usuarios (id) ON DELETE CASCADE,
  tipo      varchar(20)  NOT NULL CONSTRAINT CK_Tokens_tipo CHECK (tipo IN ('verificar_email', 'redefinir_senha')),
  -- Só o hash do código é guardado, nunca o código.
  tokenHash varchar(128) NOT NULL,
  expiraEm  datetime2(3) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Tokens_busca' AND object_id = OBJECT_ID(N'dbo.Tokens'))
CREATE INDEX IX_Tokens_busca ON dbo.Tokens (tipo, tokenHash) INCLUDE (usuarioId, expiraEm);
GO

IF OBJECT_ID(N'dbo.Mercados', N'U') IS NULL
CREATE TABLE dbo.Mercados (
  id            int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Mercados PRIMARY KEY,
  nome          nvarchar(max) NOT NULL,
  endereco      nvarchar(max) NOT NULL,
  nomeNorm      nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
  enderecoNorm  nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
  status        varchar(10) NOT NULL CONSTRAINT CK_Mercados_status CHECK (status IN ('ativo', 'removido')),
  contaSituacao varchar(12) NOT NULL CONSTRAINT CK_Mercados_conta CHECK (contaSituacao IN ('gratuita', 'ativa', 'em_atraso')),
  -- Dono do mercado. Se a conta for excluída, o mercado fica (sem dono), como combinado no design.
  usuarioId     int NULL CONSTRAINT FK_Mercados_Usuarios REFERENCES dbo.Usuarios (id) ON DELETE SET NULL,
  -- Endereço por partes (JSON: logradouro, numero, complemento, bairro, cidade, uf, cep).
  detalhes      nvarchar(max) NULL,
  telefone      varchar(20) NULL,
  -- Nome + endereço não podem se repetir. O hash existe porque textos longos não cabem num índice único.
  chave AS (CONVERT(binary(64), HASHBYTES('SHA2_256', nomeNorm) + HASHBYTES('SHA2_256', enderecoNorm))) PERSISTED
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_Mercados_chave' AND object_id = OBJECT_ID(N'dbo.Mercados'))
CREATE UNIQUE INDEX UQ_Mercados_chave ON dbo.Mercados (chave);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Mercados_usuario' AND object_id = OBJECT_ID(N'dbo.Mercados'))
CREATE INDEX IX_Mercados_usuario ON dbo.Mercados (usuarioId);
GO

IF OBJECT_ID(N'dbo.Ofertas', N'U') IS NULL
CREATE TABLE dbo.Ofertas (
  mercadoId         int          NOT NULL CONSTRAINT FK_Ofertas_Mercados REFERENCES dbo.Mercados (id),
  codigoBarras      varchar(32)  NOT NULL,
  -- Ordem em que o produto entrou (a lista do painel segue essa ordem).
  seq               bigint IDENTITY(1,1) NOT NULL,
  nome              nvarchar(max) NOT NULL,
  nomeNorm          nvarchar(max) NOT NULL,
  preco             decimal(12,2) NOT NULL,
  quantidadeTexto   nvarchar(max) NULL,
  quantidadeValor   float NULL,
  quantidadeUnidade varchar(10) NULL,
  categoria         nvarchar(max) NULL,
  disponivel        bit NOT NULL,
  precoAtualizadoEm datetime2(3) NOT NULL,
  promocaoPreco     decimal(12,2) NULL,
  promocaoInicio    datetime2(3) NULL,
  promocaoFim       datetime2(3) NULL,
  CONSTRAINT PK_Ofertas PRIMARY KEY (mercadoId, codigoBarras)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Ofertas_seq' AND object_id = OBJECT_ID(N'dbo.Ofertas'))
CREATE UNIQUE INDEX IX_Ofertas_seq ON dbo.Ofertas (seq);
GO

IF OBJECT_ID(N'dbo.Buscas', N'U') IS NULL
CREATE TABLE dbo.Buscas (
  id               bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Buscas PRIMARY KEY,
  -- A busca fica guardada sem ligação com a pessoa quando ela exclui a conta.
  usuarioId        int NULL CONSTRAINT FK_Buscas_Usuarios REFERENCES dbo.Usuarios (id) ON DELETE SET NULL,
  termo            nvarchar(400) NOT NULL,
  resultados       int NOT NULL,
  mercadosDistintos int NOT NULL,
  -- Data e hora (UTC) da busca: serve para medir o uso do piloto.
  feitaEm          datetime2(3) NOT NULL CONSTRAINT DF_Buscas_feitaEm DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Buscas_usuario' AND object_id = OBJECT_ID(N'dbo.Buscas'))
CREATE INDEX IX_Buscas_usuario ON dbo.Buscas (usuarioId);
GO
