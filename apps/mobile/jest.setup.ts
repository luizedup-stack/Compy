// Mocks globais dos módulos nativos: nenhum teste toca o cofre do aparelho nem abre links de verdade.
jest.mock('expo-secure-store', () => {
  const mapa = new Map<string, string>();
  return {
    __esModule: true,
    __mapa: mapa,
    getItemAsync: jest.fn(async (chave: string) => mapa.get(chave) ?? null),
    setItemAsync: jest.fn(async (chave: string, valor: string) => {
      mapa.set(chave, valor);
    }),
    deleteItemAsync: jest.fn(async (chave: string) => {
      mapa.delete(chave);
    }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-linking', () => ({
  __esModule: true,
  openURL: jest.fn(async () => true),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  // Cada teste começa sem cópias guardadas e com o servidor "respondendo".
  await (jest.requireMock('@react-native-async-storage/async-storage') as { clear(): Promise<void> }).clear();
  (jest.requireActual('./src/conexao') as { marcarComConexao(): void }).marcarComConexao();
  (jest.requireActual('./src/catalogo') as { esquecerCatalogoEmMemoria(): void }).esquecerCatalogoEmMemoria();
  // Nos testes, a renovação da cópia em segundo plano fica desligada (os testes dela a ligam).
  (jest.requireActual('./src/api') as { definirRenovacaoAutomatica(ligada: boolean): void }).definirRenovacaoAutomatica(false);
  (jest.requireMock('expo-secure-store') as { __mapa: Map<string, string> }).__mapa.clear();
});
