import { ChildProcess, spawn, execSync } from 'node:child_process';

/**
 * Manages the Ollama process lifecycle.
 *
 * On macOS, Ollama installs to /usr/local/bin/ollama (Homebrew)
 * or ~/.ollama/bin/ollama (direct install).
 *
 * The manager:
 * 1. Detects if ollama is installed
 * 2. Checks if it's already running
 * 3. Starts `ollama serve` if needed
 * 4. Kills it on app quit
 */

let ollamaProcess: ChildProcess | null = null;

const OLLAMA_PATHS = [
  '/usr/local/bin/ollama',
  '/opt/homebrew/bin/ollama',
  '/usr/bin/ollama',
];

function findOllama(): string | null {
  // Try which first
  try {
    const path = execSync('which ollama', { encoding: 'utf-8' }).trim();
    if (path) return path;
  } catch { /* not in PATH */ }

  // Try known locations
  for (const p of OLLAMA_PATHS) {
    try {
      execSync(`test -f "${p}"`, { encoding: 'utf-8' });
      return p;
    } catch { /* not found */ }
  }

  return null;
}

function isOllamaRunning(): boolean {
  try {
    // Check if Ollama's default port is responding
    execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags', {
      encoding: 'utf-8',
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start Ollama serve if installed and not already running.
 * Returns true if Ollama is available (either started or already running).
 */
export function startOllama(): boolean {
  if (isOllamaRunning()) {
    console.log('[OLLAMA] Already running');
    return true;
  }

  const ollamaPath = findOllama();
  if (!ollamaPath) {
    console.log('[OLLAMA] Not installed — skipping auto-start');
    return false;
  }

  console.log(`[OLLAMA] Starting: ${ollamaPath} serve`);

  try {
    ollamaProcess = spawn(ollamaPath, ['serve'], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    ollamaProcess.stdout?.on('data', (data: Buffer) => {
      // Ollama logs go to stderr, stdout is minimal
    });

    ollamaProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[OLLAMA] ${line}`);
      }
    });

    ollamaProcess.on('error', (err) => {
      console.error('[OLLAMA] Failed to start:', err.message);
      ollamaProcess = null;
    });

    ollamaProcess.on('exit', (code) => {
      console.log(`[OLLAMA] Exited with code ${code}`);
      ollamaProcess = null;
    });

    return true;
  } catch (err) {
    console.error('[OLLAMA] Failed to spawn:', err);
    return false;
  }
}

/**
 * Stop the Ollama process if we started it.
 */
export function stopOllama(): void {
  if (ollamaProcess) {
    console.log('[OLLAMA] Stopping...');
    ollamaProcess.kill('SIGTERM');
    ollamaProcess = null;
  }
}
