import { safeStorage, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderType } from '../shared/types';

/**
 * Secure API key storage using Electron's safeStorage (OS keychain).
 *
 * Keys are encrypted with the OS credential store (Keychain on macOS)
 * and stored as encrypted base64 strings in a JSON file.
 * They NEVER exist in plaintext on disk or in the SQLite database.
 */

const KEY_PREFIX = 'provider-key:';

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'encrypted-keys.json');
}

function readStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, string>): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8');
}

export function setApiKey(provider: ProviderType, apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available. Cannot store API keys securely.');
  }
  const encrypted = safeStorage.encryptString(apiKey);
  const store = readStore();
  store[`${KEY_PREFIX}${provider}`] = encrypted.toString('base64');
  writeStore(store);
}

export function getApiKey(provider: ProviderType): string | null {
  const store = readStore();
  const stored = store[`${KEY_PREFIX}${provider}`];
  if (!stored) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available. Cannot decrypt API keys.');
  }

  const buffer = Buffer.from(stored, 'base64');
  return safeStorage.decryptString(buffer);
}

export function deleteApiKey(provider: ProviderType): void {
  const store = readStore();
  delete store[`${KEY_PREFIX}${provider}`];
  writeStore(store);
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
