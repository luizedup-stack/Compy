import type { NavigatorScreenParams } from '@react-navigation/native';

/** Abas da área principal (com sessão). */
export type AbasParamList = {
  Busca: undefined;
  Mercados: undefined;
  Conta: undefined;
};

/** Telas do app e os parâmetros de cada uma. */
export type RootStackParamList = {
  // Sem sessão
  Entrar: { aviso?: string } | undefined;
  Cadastrar: undefined;
  EsqueciSenha: undefined;
  // Com sessão: as abas (Busca, Mercados, Conta) e as telas que abrem por cima delas
  Principal: NavigatorScreenParams<AbasParamList> | undefined;
  MercadoDetalhe: { id: number; nome: string };
};

/** Telas de quem ainda não entrou; usadas também como tela inicial nos testes. */
export type RotaInicial = 'Entrar' | 'Cadastrar' | 'EsqueciSenha';
