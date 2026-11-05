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

jest.mock('expo-linking', () => ({
  __esModule: true,
  openURL: jest.fn(async () => true),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (jest.requireMock('expo-secure-store') as { __mapa: Map<string, string> }).__mapa.clear();
});
