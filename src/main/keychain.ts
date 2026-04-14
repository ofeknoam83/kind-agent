import { safeStorage } from 'electron';
import Store from 'electron-store';
import type { ProviderType } from '../shared/types';

/**
 * Secure API key storage using Electron's safeStorage (OS keychain).
 *
 * Keys are encrypted with the OS credential store (Keychain on macOS)
 * and stored as encrypted buffers in electron-store. They NEVER exist
 * in plaintext on disk or in the SQLite database.
 */

const store = new Store<Record<string, string>>({
  name: 'encrypted-keys',
  encryptionKey: undefined, // We use safeStorage, not electron-store encryption
});

const KEY_PREFIX = 'provider-key:';

export function setApiKey(provider: ProviderType, apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available. Cannot store API keys securely.');
  }
  const encrypted = safeStorage.encryptString(apiKey);
  store.set(`${KEY_PREFIX}${provider}`, encrypted.toString('base64'));
}

export function getApiKey(provider: ProviderType): string | null {
  const stored = store.get(`${KEY_PREFIX}${provider}`);
  if (!stored) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available. Cannot decrypt API keys.');
  }

  const buffer = Buffer.from(stored, 'base64');
  return safeStorage.decryptString(buffer);
}

export function deleteApiKey(provider: ProviderType): void {
  store.delete(`${KEY_PREFIX}${provider}`);
}

/** Get all stored API keys (decrypted). Used by provider factory. */
export function getAllApiKeys(): Partial<Record<ProviderType, string>> {
  const keys: Partial<Record<ProviderType, string>> = {};
  for (const type of ['openai', 'lmstudio', 'ollama'] as ProviderType[]) {
    const key = getApiKey(type);
    if (key) keys[type] = key;
  }
  return keys;
}
