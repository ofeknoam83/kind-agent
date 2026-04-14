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
    packageAfterPrune: async (_config, buildPath) => {
      const nmPath = path.join(buildPath, 'node_modules');

      // The Forge Vite plugin doesn't always copy production node_modules.
      // Install them if missing.
      if (!fs.existsSync(path.join(nmPath, 'better-sqlite3'))) {
        console.log('[forge] Installing production dependencies...');
        const { execSync } = await import('node:child_process');
        execSync('npm install --omit=dev --ignore-scripts', {
          cwd: buildPath,
          stdio: 'inherit',
        });
      }

      // Rebuild native modules for Electron's Node.js (not system Node).
      // Get Electron version from the project root (it's pruned from buildPath).
      const electronPkgPath = path.resolve('node_modules', 'electron', 'package.json');
      const electronVersion = JSON.parse(fs.readFileSync(electronPkgPath, 'utf-8')).version;

      console.log(`[forge] Rebuilding native modules for Electron v${electronVersion}...`);
      const { execSync } = await import('node:child_process');
      execSync(
        `npx @electron/rebuild -v ${electronVersion} -m "${buildPath}"`,
        { stdio: 'inherit' }
      );
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
