import type { RoutingDecision, RoutingOutcome, FeatureVector } from './types';

/**
 * Structured logging for the routing engine.
 *
 * Outputs JSON to stdout. In production, pipe to a log file.
 * In Electron, logs go to the main process console and can be
 * captured via app.on('console') or redirected to a file.
 *
 * Every log entry includes:
 * - Timestamp
 * - Event type
 * - Structured payload
 *
 * No PII is logged — we log chat IDs (JIDs) but not message content.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

let minLevel: LogLevel = 'info';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function emit(entry: LogEntry): void {
  if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[minLevel]) return;
  console.log(JSON.stringify(entry));
}

// ── Routing-specific log functions ────────────────────────────────────

export function logRoutingDecision(decision: RoutingDecision): void {
  emit({
    ts: new Date().toISOString(),
    level: 'info',
    event: 'routing.decision',
    selected: decision.selectedBackend,
    overridden: decision.wasOverridden,
    explanation: decision.explanation,
    scores: Object.fromEntries(
      decision.allScores.map((s) => [
        s.backend,
        {
          eligible: s.eligible,
          total: round(s.totalScore),
          privacy: round(s.privacyScore),
          quality: round(s.qualityScore),
          cost: round(s.costScore),
          latency: round(s.latencyScore),
        },
      ])
    ),
    features: summarizeFeatures(decision.features),
  });
}

export function logRoutingOutcome(outcome: RoutingOutcome): void {
  emit({
    ts: new Date().toISOString(),
    level: outcome.success ? 'info' : 'warn',
    event: 'routing.outcome',
    backend: outcome.decision.selectedBackend,
    success: outcome.success,
    latencyMs: outcome.latencyMs,
    validJson: outcome.validJson,
    completeResponse: outcome.completeResponse,
    ...(outcome.error ? { error: outcome.error } : {}),
  });
}

export function logFeatureExtraction(features: FeatureVector): void {
  emit({
    ts: new Date().toISOString(),
    level: 'debug',
    event: 'routing.features',
    ...summarizeFeatures(features),
  });
}

export function logBackendHealthUpdate(
  backend: string,
  available: boolean,
  latencyMs?: number,
): void {
  emit({
    ts: new Date().toISOString(),
    level: available ? 'info' : 'warn',
    event: 'routing.health',
    backend,
    available,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
  });
}

// ── Internal ──────────────────────────────────────────────────────────

/** Summarize features for logging (no PII, compact). */
function summarizeFeatures(f: FeatureVector): Record<string, unknown> {
  return {
    msgs: f.messageCount,
    tokens: f.estimatedTokens,
    complexity: round(f.complexity),
    sensitivity: round(f.sensitivity),
    urgency: round(f.urgency),
    languages: f.languageCount,
    hasCode: f.containsCode,
    hasUrls: f.containsUrls,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
