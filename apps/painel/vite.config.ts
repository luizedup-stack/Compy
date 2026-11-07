/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Endereço em que o painel fica. Na raiz ('/') no programa de computador; na hospedagem a API entrega o painel
  // em /painel-web/ (PAINEL_BASE=/painel-web/ na hora de compilar).
  base: process.env.PAINEL_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      // O pacote compartilhado só tem código-fonte (main aponta para src/index.ts).
      '@mercado/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    // Testes que digitam formulários inteiros ficam lentos com o computador ocupado: folga para não falharem à toa.
    testTimeout: 30_000,
  },
});
