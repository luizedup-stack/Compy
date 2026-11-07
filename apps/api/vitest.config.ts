import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Com um banco de testes (BANCO_TESTE_URL), os arquivos de teste apagam e recriam os mesmos dados:
    // rodam um de cada vez para um não atrapalhar o outro.
    fileParallelism: !process.env.BANCO_TESTE_URL,
  },
});
