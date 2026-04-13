import type { FeatureVector, BackendProfile, BackendScores, ScoringWeights } from './types';

/**
 * Scoring system.
 *
 * Computes a per-backend score across 5 dimensions:
 *   privacy, quality, cost, latency, availability
 *
 * Each dimension produces a score in [0, 1].
 * The final score is a weighted sum based on the user's privacy mode.
 *
 * HARD CONSTRAINTS are checked first — if a backend violates one,
 * it's marked ineligible and removed from consideration.
 */

// ── Main Scorer ───────────────────────────────────────────────────────

export function scoreBackend(
  backend: BackendProfile,
  features: FeatureVector,
  weights: ScoringWeights,
): BackendScores {
  // Check hard constraints first
  const eligibility = checkEligibility(backend, features);
  if (!eligibility.eligible) {
    return {
      backend: backend.type,
      eligible: false,
      ineligibilityReason: eligibility.reason,
      privacyScore: 0,
      qualityScore: 0,
      costScore: 0,
      latencyScore: 0,
      availabilityScore: 0,
      totalScore: 0,
    };
  }

  const privacyScore = scorePrivacy(backend);
  const qualityScore = scoreQuality(backend, features);
  const costScore = scoreCost(backend, features);
  const latencyScore = scoreLatency(backend, features);
  const availabilityScore = scoreAvailability(backend);

  const totalScore =
    privacyScore * weights.privacy +
    qualityScore * weights.quality +
    costScore * weights.cost +
    latencyScore * weights.latency +
    availabilityScore * weights.availability;

  // Apply backend weight from feedback loop (multiplicative)
  const adjustedTotal = totalScore * backend.weight;

  return {
    backend: backend.type,
    eligible: true,
    privacyScore,
    qualityScore,
    costScore,
    latencyScore,
    availabilityScore,
    totalScore: adjustedTotal,
  };
}

// ── Hard Constraints ──────────────────────────────────────────────────

interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

function checkEligibility(
  backend: BackendProfile,
  features: FeatureVector,
): EligibilityResult {
  // Must be reachable
  if (!backend.available) {
    return { eligible: false, reason: `${backend.label} is not available` };
  }

  // Must fit in context window (with 20% buffer for system prompt + output)
  const requiredTokens = features.estimatedTokens * 1.2;
  if (requiredTokens > backend.maxContextTokens) {
    return {
      eligible: false,
      reason: `Input (~${features.estimatedTokens} tokens) exceeds ${backend.label} context window (${backend.maxContextTokens})`,
    };
  }

  // Backend with <50% success rate is effectively broken
  if (backend.successRate < 0.5) {
    return {
      eligible: false,
      reason: `${backend.label} success rate too low (${(backend.successRate * 100).toFixed(0)}%)`,
    };
  }

  return { eligible: true };
}

// ── Dimension Scorers ─────────────────────────────────────────────────

/**
 * Privacy score.
 * Local = 1.0, Cloud = 0.0.
 * Binary — there's no "partially local."
 */
function scorePrivacy(backend: BackendProfile): number {
  return backend.isLocal ? 1.0 : 0.0;
}

/**
 * Quality score.
 * Based on the backend's base quality, adjusted for input complexity.
 *
 * Key insight: local models are fine for simple conversations but degrade
 * on complex, multi-topic, multi-language inputs. Cloud models maintain
 * quality across the board.
 */
function scoreQuality(backend: BackendProfile, features: FeatureVector): number {
  let score = backend.baseQuality;

  // Local models lose quality on complex inputs
  if (backend.isLocal) {
    // Complexity penalty: up to -0.25 for very complex inputs
    score -= features.complexity * 0.25;

    // Multi-language penalty: local models struggle with code-switching
    if (features.languageCount > 1) {
      score -= 0.10 * (features.languageCount - 1);
    }

    // Code content penalty: structured output is harder for small models
    if (features.containsCode) {
      score -= 0.05;
    }
  }

  // Bonus for high success rate (proven track record)
  score *= 0.7 + 0.3 * backend.successRate;

  return clamp(score);
}

/**
 * Cost score.
 * Free (local) = 1.0. Expensive = 0.0.
 * Considers both per-token cost and estimated total cost.
 */
function scoreCost(backend: BackendProfile, features: FeatureVector): number {
  if (backend.costPer1kTokens === 0) return 1.0;

  // Estimated cost in dollars
  const estimatedCost = (features.estimatedTokens / 1000) * backend.costPer1kTokens * 2;
  // *2 accounts for output tokens

  // Score: $0 = 1.0, $0.10+ = 0.0 (linear decay)
  return clamp(1 - estimatedCost / 0.10);
}

/**
 * Latency score.
 * Based on historical average latency and estimated input size.
 *
 * Local models: latency scales linearly with input size.
 * Cloud models: latency is relatively stable (network + queue time dominates).
 */
function scoreLatency(backend: BackendProfile, features: FeatureVector): number {
  if (backend.avgLatencyMs === 0) {
    // Unknown latency — assume moderate
    return backend.isLocal ? 0.5 : 0.7;
  }

  // Estimate latency for this specific input
  let estimatedMs = backend.avgLatencyMs;

  if (backend.isLocal) {
    // Local models: latency scales with token count
    const tokenFactor = features.estimatedTokens / 2000; // normalize around 2K tokens
    estimatedMs *= Math.max(0.5, tokenFactor);
  }

  // Score: <5s = 1.0, >60s = 0.0 (log scale)
  const seconds = estimatedMs / 1000;
  return clamp(1 - Math.log10(seconds + 1) / Math.log10(61));
}

/**
 * Availability score.
 * Combines reachability and recent success rate.
 */
function scoreAvailability(backend: BackendProfile): number {
  if (!backend.available) return 0;
  return backend.successRate;
}

// ── Utility ───────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
