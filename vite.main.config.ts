import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

export default defineConfig({
  resolve: {
    conditions: ['node'],
  },
  build: {
    rollupOptions: {
      // Externalize everything that shouldn't be bundled:
      // - Node builtins (fs, path, crypto, etc.)
      // - Native addons (better-sqlite3, sharp)
      // - Baileys and all its deps (they use native/optional modules)
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        'electron',
        'better-sqlite3',
        '@whiskeysockets/baileys',
        '@hapi/boom',
        '@cacheable/node-cache',
        'async-mutex',
        'axios',
        'libsignal',
        'link-preview-js',
        'long',
        'pino',
        'sharp',
        'ws',
      ],
    },
  },
});
