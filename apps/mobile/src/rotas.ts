import type { NavigatorScreenParams } from '@react-navigation/native';

/** Abas da área principal (com ou sem login). */
export type AbasParamList = {
  Busca: undefined;
  Mercados: undefined;
  Conta: undefined;
};

/** Telas do app e os parâmetros de cada uma. */
export type RootStackParamList = {
  // Abrem por cima das abas, a partir da aba Conta (o login é opcional)
  Entrar: { aviso?: string } | undefined;
  Cadastrar: undefined;
  EsqueciSenha: undefined;
  // As abas (Busca, Mercados, Conta) e o detalhe de um mercado
  Principal: NavigatorScreenParams<AbasParamList> | undefined;
  MercadoDetalhe: { id: number; nome: string; /** Para o "Como chegar". */ endereco?: string };
};

/** Telas de acesso à conta; usadas também como tela inicial nos testes. */
export type RotaInicial = 'Entrar' | 'Cadastrar' | 'EsqueciSenha';
