/**
 * Type-safe accessor for the preload bridge.
 * All renderer code goes through this — never access window.electronApi directly.
 */
export function useApi() {
  return window.electronApi;
}
