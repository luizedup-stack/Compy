const path = require('path');

// O monorepo tem duas versões do React: a 18 do painel (na raiz) e a 19 deste app (em apps/mobile/node_modules).
// Bibliotecas de navegação sobem para a raiz e enxergariam o React 18; aqui todo `import 'react'` vai para o do app.
const reactDoApp = path.dirname(require.resolve('react/package.json', { paths: [__dirname] }));

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Com o computador ocupado (vários testes em paralelo) alguns testes de tela passam de 5 s: folga para não falharem à toa.
  testTimeout: 30000,
  moduleNameMapper: {
    '^react$': reactDoApp,
    '^react/(.*)$': `${reactDoApp}/$1`,
  },
};
