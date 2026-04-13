import type { ElectronApi } from './index';

/**
 * Augment the global Window interface so the renderer
 * can access window.electronApi with full type safety.
 */
declare global {
  interface Window {
    electronApi: ElectronApi;
  }
}
