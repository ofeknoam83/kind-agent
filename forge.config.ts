import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import path from 'node:path';
import fs from 'node:fs';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'WhatsApp Summarizer',
    appBundleId: 'com.local.whatsapp-summarizer',
    asar: false,
  },
  hooks: {
    // Debug: log what's in the packaged app to diagnose missing modules
    packageAfterPrune: async (_config, buildPath) => {
      const nmPath = path.join(buildPath, 'node_modules');
      const hasBetterSqlite3 = fs.existsSync(path.join(nmPath, 'better-sqlite3'));
      const hasBaileys = fs.existsSync(path.join(nmPath, '@whiskeysockets', 'baileys'));
      console.log(`[forge-hook] build path: ${buildPath}`);
      console.log(`[forge-hook] node_modules exists: ${fs.existsSync(nmPath)}`);
      console.log(`[forge-hook] better-sqlite3: ${hasBetterSqlite3}`);
      console.log(`[forge-hook] baileys: ${hasBaileys}`);

      // If native modules are missing after prune, reinstall them
      if (!hasBetterSqlite3) {
        console.log('[forge-hook] better-sqlite3 missing — installing...');
        const { execSync } = await import('node:child_process');
        execSync('npm install better-sqlite3 --no-save', {
          cwd: buildPath,
          stdio: 'inherit',
        });
      }
    },
  },
  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerDMG({
      format: 'ULFO',
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
