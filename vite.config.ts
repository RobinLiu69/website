import { defineConfig } from 'vitest/config';

// BASE_PATH is set by the deploy workflow (e.g. "/website/" for a GitHub Pages
// project site). Locally and on a custom domain it stays "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
