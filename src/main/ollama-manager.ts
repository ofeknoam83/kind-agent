import { ChildProcess, spawn, execSync } from 'node:child_process';
import type { BrowserWindow } from 'electron';

/**
 * Manages the Ollama process lifecycle.
 *
 * The manager:
 * 1. Detects if ollama is installed
 * 2. Checks if it's already running
 * 3. Starts `ollama serve` if needed
 * 4. Auto-pulls the configured model if not available
 * 5. Kills it on app quit
 */

let ollamaProcess: ChildProcess | null = null;

const OLLAMA_PATHS = [
  '/usr/local/bin/ollama',
  '/opt/homebrew/bin/ollama',
  '/usr/bin/ollama',
];

const OLLAMA_BASE_URL = 'http://localhost:11434';

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
    execSync(`curl -s -o /dev/null -w "%{http_code}" ${OLLAMA_BASE_URL}/api/tags`, {
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

    ollamaProcess.stdout?.on('data', () => {
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

/**
 * Ensure the given model is available. Pull it if not.
 * Reports progress to the mainWindow if provided.
 */
export async function ensureModel(
  model: string,
  mainWindow?: BrowserWindow | null,
): Promise<boolean> {
  // Wait for Ollama to be ready (up to 10 seconds)
  for (let i = 0; i < 20; i++) {
    if (isOllamaRunning()) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!isOllamaRunning()) {
    console.log('[OLLAMA] Server not running — cannot check model');
    return false;
  }

  try {
    // Check if model exists
    const tagsRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!tagsRes.ok) return false;

    const tags = (await tagsRes.json()) as { models: { name: string }[] };
    const modelNames = tags.models.map((m) => m.name);

    // Check both exact match and without tag (e.g., "llama3.2" matches "llama3.2:latest")
    const hasModel = modelNames.some(
      (n) => n === model || n.startsWith(`${model}:`)
    );

    if (hasModel) {
      console.log(`[OLLAMA] Model '${model}' available`);
      return true;
    }

    // Model not found — pull it
    console.log(`[OLLAMA] Model '${model}' not found, pulling...`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:model-pull-progress', {
        model,
        status: 'pulling',
        progress: 0,
      });
    }

    const pullRes = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!pullRes.ok || !pullRes.body) {
      console.error(`[OLLAMA] Pull failed: HTTP ${pullRes.status}`);
      return false;
    }

    // Read streaming response for progress
    const reader = pullRes.body.getReader();
    const decoder = new TextDecoder();
    let lastPercent = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Each line is a JSON object
      for (const line of chunk.split('\n').filter(Boolean)) {
        try {
          const progress = JSON.parse(line) as {
            status: string;
            total?: number;
            completed?: number;
          };

          if (progress.total && progress.completed) {
            const percent = Math.round(
              (progress.completed / progress.total) * 100
            );
            if (percent !== lastPercent) {
              lastPercent = percent;
              console.log(`[OLLAMA] Pulling ${model}: ${percent}%`);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('event:model-pull-progress', {
                  model,
                  status: 'pulling',
                  progress: percent,
                });
              }
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    console.log(`[OLLAMA] Model '${model}' pulled successfully`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:model-pull-progress', {
        model,
        status: 'ready',
        progress: 100,
      });
    }

    return true;
  } catch (err) {
    console.error(`[OLLAMA] Error checking/pulling model '${model}':`, err);
    return false;
  }
}
