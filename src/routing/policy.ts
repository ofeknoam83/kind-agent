import type { ProviderType } from '../shared/types';
import type {
  RoutingInput,
  RoutingDecision,
  FeatureVector,
  BackendScores,
  ScoringWeights,
  BackendProfile,
} from './types';
import { DEFAULT_WEIGHTS } from './types';
import { extractFeatures } from './features';
import { scoreBackend } from './scoring';
import type { BackendRegistry } from './backend-registry';

/**
 * Policy engine — the decision maker.
 *
 * Orchestrates:
 * 1. Feature extraction
 * 2. Hard constraint filtering
 * 3. Soft scoring across all backends
 * 4. Final selection with tie-breaking
 * 5. Decision explanation generation
 *
 * The policy does NOT call providers. It only decides which one to use.
 * The caller is responsible for executing the decision.
 */
export class PolicyEngine {
  constructor(private registry: BackendRegistry) {}

  /**
   * Route a summarization request to the best backend.
   *
   * This is the main entry point. Runs synchronously in <1ms.
   */
  decide(input: RoutingInput): RoutingDecision {
    const features = extractFeatures(input);
    const weights = this.getWeights(input);

    // User override — skip scoring entirely
    if (input.userOverride) {
      return this.buildOverrideDecision(input.userOverride, features, weights);
    }

    // Score all backends
    const backends = this.registry.getAll();
    const allScores = backends.map((b) => scoreBackend(b, features, weights));

    // Filter to eligible backends
    const eligible = allScores.filter((s) => s.eligible);

    if (eligible.length === 0) {
      return this.buildNoBackendDecision(allScores, features);
    }

    // Sort by total score (descending)
    eligible.sort((a, b) => b.totalScore - a.totalScore);

    // Apply policy overrides (hard rules that override scoring)
    const selected = this.applyPolicyOverrides(eligible, features, input);

    const explanation = this.explain(selected, eligible, features, input);

    return {
      selectedBackend: selected.backend,
      allScores,
      explanation,
      features,
      decidedAt: Math.floor(Date.now() / 1000),
      wasOverridden: false,
    };
  }

  /**
   * Policy overrides — hard rules that can override the scoring result.
   *
   * These encode business logic that can't be captured by weighted scores:
   * - Strict privacy mode: NEVER use cloud, regardless of scores
   * - Sensitivity threshold: if sensitivity > 0.7, force local
   * - Fallback: if top local model has quality < 0.3, allow cloud upgrade
   */
  private applyPolicyOverrides(
    ranked: BackendScores[],
    features: FeatureVector,
    input: RoutingInput,
  ): BackendScores {
    const top = ranked[0];

    // Rule 1: Strict privacy — cloud is never allowed
    if (input.privacyMode === 'strict') {
      const localOnly = ranked.filter((s) => {
        const profile = this.registry.get(s.backend);
        return profile?.isLocal;
      });
      if (localOnly.length > 0) return localOnly[0];
      // If no local backends available, we still return top (which will fail at execution)
      return top;
    }

    // Rule 2: High sensitivity content — force local when possible
    if (features.sensitivity > 0.7 && input.privacyMode !== 'prefer-quality') {
      const localOptions = ranked.filter((s) => {
        const profile = this.registry.get(s.backend);
        return profile?.isLocal && s.eligible;
      });
      if (localOptions.length > 0) return localOptions[0];
    }

    // Rule 3: Quality floor — if best local model is too weak for this input,
    // and user allows cloud, upgrade to cloud
    if (input.privacyMode !== 'strict' && input.privacyMode !== 'prefer-local') {
      const topProfile = this.registry.get(top.backend);
      if (topProfile?.isLocal && top.qualityScore < 0.3 && features.complexity > 0.7) {
        const cloudOption = ranked.find((s) => {
          const profile = this.registry.get(s.backend);
          return !profile?.isLocal && s.eligible;
        });
        if (cloudOption && cloudOption.qualityScore > top.qualityScore + 0.2) {
          return cloudOption;
        }
      }
    }

    return top;
  }

  /** Get scoring weights for the user's privacy mode. */
  private getWeights(input: RoutingInput): ScoringWeights {
    return DEFAULT_WEIGHTS[input.privacyMode];
  }

  /** Build a decision when the user explicitly selected a provider. */
  private buildOverrideDecision(
    provider: ProviderType,
    features: FeatureVector,
    weights: ScoringWeights,
  ): RoutingDecision {
    const backends = this.registry.getAll();
    const allScores = backends.map((b) => scoreBackend(b, features, weights));

    return {
      selectedBackend: provider,
      allScores,
      explanation: `User explicitly selected ${provider}. Automatic routing bypassed.`,
      features,
      decidedAt: Math.floor(Date.now() / 1000),
      wasOverridden: true,
    };
  }

  /** Build a decision when no backends are eligible. */
  private buildNoBackendDecision(
    allScores: BackendScores[],
    features: FeatureVector,
  ): RoutingDecision {
    const reasons = allScores
      .filter((s) => !s.eligible)
      .map((s) => `${s.backend}: ${s.ineligibilityReason}`)
      .join('; ');

    return {
      selectedBackend: 'ollama', // Fallback — will fail at execution with a clear error
      allScores,
      explanation: `No eligible backends. Reasons: ${reasons}`,
      features,
      decidedAt: Math.floor(Date.now() / 1000),
      wasOverridden: false,
    };
  }

  /** Generate a human-readable explanation of the routing decision. */
  private explain(
    selected: BackendScores,
    candidates: BackendScores[],
    features: FeatureVector,
    input: RoutingInput,
  ): string {
    const parts: string[] = [];

    const profile = this.registry.get(selected.backend);
    parts.push(`Selected ${profile?.label ?? selected.backend}.`);

    // Why this backend?
    if (profile?.isLocal) {
      parts.push('Local backend preferred for privacy.');
    }

    if (features.complexity > 0.6) {
      parts.push(`High complexity (${(features.complexity * 100).toFixed(0)}%) — cloud may produce better results.`);
    }

    if (features.sensitivity > 0.5) {
      parts.push(`Sensitive content detected (${(features.sensitivity * 100).toFixed(0)}%) — favoring local.`);
    }

    if (features.estimatedTokens > 4000) {
      parts.push(`Large input (~${features.estimatedTokens} tokens).`);
    }

    // Runner-up context
    if (candidates.length > 1) {
      const runnerUp = candidates[1];
      const delta = selected.totalScore - runnerUp.totalScore;
      if (delta < 0.05) {
        parts.push(`Close call — ${runnerUp.backend} scored within ${(delta * 100).toFixed(1)}%.`);
      }
    }

    parts.push(`Privacy mode: ${input.privacyMode}. Score: ${selected.totalScore.toFixed(3)}.`);

    return parts.join(' ');
  }
}
