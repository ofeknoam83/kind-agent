import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@main': '/src/main',
      '@db': '/src/db',
      '@providers': '/src/providers',
      '@connector': '/src/connector',
    },
  },
});
