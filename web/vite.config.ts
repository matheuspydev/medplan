import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Dev: a API FastAPI roda em 127.0.0.1:8000 (uvicorn medplan.api:app).
// Nenhum segredo ou URL de API embutido nos assets: o front sempre chama /api relativo.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
    // Só nos testes: o teste de guarda lê medplan/engine.py para conferir o aviso de viés literal.
    // O servidor de desenvolvimento continua sem acesso a arquivos fora de web/.
    ...(mode === 'test' ? { fs: { allow: ['.', '../medplan'] } } : {}),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
