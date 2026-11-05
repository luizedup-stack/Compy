/** Telas do app e os parâmetros de cada uma. */
export type RootStackParamList = {
  // Sem sessão
  Entrar: { aviso?: string } | undefined;
  Cadastrar: undefined;
  EsqueciSenha: undefined;
  // Com sessão
  Busca: undefined;
  VerificarEmail: undefined;
};

/** Telas de quem ainda não entrou; usadas também como tela inicial nos testes. */
export type RotaInicial = 'Entrar' | 'Cadastrar' | 'EsqueciSenha';
