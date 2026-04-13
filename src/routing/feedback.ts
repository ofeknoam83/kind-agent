import type { ProviderType } from '../shared/types';
import type { RoutingOutcome } from './types';
import type { BackendRegistry } from './backend-registry';

/**
 * Feedback loop — learns from outcomes to improve future routing.
 *
 * After each summarization completes (success or failure), the caller
 * records the outcome. The feedback system uses this to:
 *
 * 1. Update success rates (exponential moving average)
 * 2. Update latency estimates
 * 3. Adjust backend weights (reward good backends, penalize bad ones)
 *
 * This runs synchronously and touches no I/O.
 * Outcomes are stored in memory — reset on app restart.
 * For persistence, call `exportOutcomes()` and store to SQLite.
 */

/** EMA smoothing factor. 0.2 = recent outcomes matter more. */
const ALPHA = 0.2;

/** Minimum weight floor. Prevents a backend from being permanently excluded. */
const MIN_WEIGHT = 0.3;

/** Maximum weight ceiling. */
const MAX_WEIGHT = 1.5;

/** Number of recent outcomes to keep per backend. */
const MAX_HISTORY = 100;

export class FeedbackLoop {
  private history: Map<ProviderType, RoutingOutcome[]> = new Map();

  constructor(private registry: BackendRegistry) {}

  /**
   * Record an outcome and update backend metrics.
   */
  record(outcome: RoutingOutcome): void {
    const backend = outcome.decision.selectedBackend;

    // Store in history
    const history = this.history.get(backend) ?? [];
    history.push(outcome);
    if (history.length > MAX_HISTORY) {
      history.shift(); // Drop oldest
    }
    this.history.set(backend, history);

    // Update backend metrics
    this.updateMetrics(backend);
  }

  /** Get recent outcomes for a backend. */
  getHistory(backend: ProviderType): RoutingOutcome[] {
    return this.history.get(backend) ?? [];
  }

  /** Get all outcomes across all backends. */
  getAllHistory(): RoutingOutcome[] {
    const all: RoutingOutcome[] = [];
    for (const outcomes of this.history.values()) {
      all.push(...outcomes);
    }
    return all.sort((a, b) => b.recordedAt - a.recordedAt);
  }

  /** Export all outcomes for persistence. */
  exportOutcomes(): RoutingOutcome[] {
    return this.getAllHistory();
  }

  /** Import previously persisted outcomes (e.g., on app startup). */
  importOutcomes(outcomes: RoutingOutcome[]): void {
    for (const outcome of outcomes) {
      const backend = outcome.decision.selectedBackend;
      const history = this.history.get(backend) ?? [];
      history.push(outcome);
      this.history.set(backend, history);
    }

    // Update metrics for all backends that had imported data
    const backends = new Set(outcomes.map((o) => o.decision.selectedBackend));
    for (const backend of backends) {
      this.updateMetrics(backend);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────

  private updateMetrics(backend: ProviderType): void {
    const outcomes = this.history.get(backend);
    if (!outcomes || outcomes.length === 0) return;

    const profile = this.registry.get(backend);
    if (!profile) return;

    // Update success rate (EMA)
    const latestSuccess = outcomes[outcomes.length - 1].success ? 1.0 : 0.0;
    const newSuccessRate = ALPHA * latestSuccess + (1 - ALPHA) * profile.successRate;

    // Update average latency (EMA of successful calls only)
    const successfulOutcomes = outcomes.filter((o) => o.success);
    let newAvgLatency = profile.avgLatencyMs;
    if (successfulOutcomes.length > 0) {
      const latestLatency = successfulOutcomes[successfulOutcomes.length - 1].latencyMs;
      newAvgLatency = ALPHA * latestLatency + (1 - ALPHA) * profile.avgLatencyMs;
    }

    // Update weight based on recent performance
    const newWeight = this.computeWeight(outcomes);

    this.registry.update(backend, {
      successRate: newSuccessRate,
      avgLatencyMs: newAvgLatency,
      weight: newWeight,
    });
  }

  /**
   * Compute backend weight from recent outcomes.
   *
   * Weight factors:
   * - Success rate (biggest factor)
   * - JSON validity rate (model follows instructions?)
   * - Response completeness (does it include all fields?)
   */
  private computeWeight(outcomes: RoutingOutcome[]): number {
    if (outcomes.length === 0) return 1.0;

    // Use the last 20 outcomes for weight calculation
    const recent = outcomes.slice(-20);
    const n = recent.length;

    const successRate = recent.filter((o) => o.success).length / n;
    const jsonValidRate = recent.filter((o) => o.validJson).length / n;
    const completeRate = recent.filter((o) => o.completeResponse).length / n;

    // Weighted combination
    const raw = successRate * 0.5 + jsonValidRate * 0.3 + completeRate * 0.2;

    // Scale to weight range
    return clamp(raw * 1.5, MIN_WEIGHT, MAX_WEIGHT);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
