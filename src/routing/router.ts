import type { ProviderType } from '../shared/types';
import type { RoutingInput, RoutingDecision, RoutingOutcome, PrivacyMode } from './types';
import { BackendRegistry } from './backend-registry';
import { PolicyEngine } from './policy';
import { FeedbackLoop } from './feedback';
import { logRoutingDecision, logRoutingOutcome, logBackendHealthUpdate } from './logger';
import type { SummarizationProvider } from '../providers/base';
import { createProvider } from '../providers/provider-factory';
import type { ProviderConfig } from '../shared/types';

/**
 * Router — the top-level orchestrator.
 *
 * Owns the lifecycle:
 * 1. Receives a routing input
 * 2. Delegates to PolicyEngine for the decision
 * 3. Executes the decision (creates provider, calls summarize)
 * 4. Records the outcome in the feedback loop
 * 5. Returns the result
 *
 * Usage:
 *   const router = new Router();
 *   await router.updateHealth(providerConfigs, apiKeys);
 *   const { decision, result } = await router.route(input, providerConfigs, apiKeys);
 */
export class Router {
  private registry: BackendRegistry;
  private policy: PolicyEngine;
  private feedback: FeedbackLoop;

  constructor() {
    this.registry = new BackendRegistry();
    this.policy = new PolicyEngine(this.registry);
    this.feedback = new FeedbackLoop(this.registry);
  }

  /**
   * Route a summarization request.
   *
   * Returns both the decision (for observability) and the summarization result.
   * Throws if the selected backend fails AND there's no fallback.
   */
  async route(
    input: RoutingInput,
    providerConfigs: ProviderConfig[],
    apiKeys: Partial<Record<ProviderType, string>>,
  ): Promise<RouteResult> {
    // Step 1: Decide
    const decision = this.policy.decide(input);
    logRoutingDecision(decision);

    // Step 2: Execute with fallback
    const startMs = Date.now();
    try {
      const provider = this.resolveProvider(decision.selectedBackend, providerConfigs, apiKeys);
      const result = await provider.summarize({
        messages: input.messages,
        chatName: input.chatName,
        isGroup: false,
      });

      const latencyMs = Date.now() - startMs;

      // Step 3: Record success
      const outcome: RoutingOutcome = {
        decision,
        success: true,
        latencyMs,
        validJson: true,
        completeResponse: Boolean(result.summary && result.actionItems && result.unresolvedQuestions),
        recordedAt: Math.floor(Date.now() / 1000),
      };
      this.feedback.record(outcome);
      logRoutingOutcome(outcome);

      return { decision, result, outcome };
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Record failure
      const outcome: RoutingOutcome = {
        decision,
        success: false,
        latencyMs,
        validJson: false,
        completeResponse: false,
        error: errorMsg,
        recordedAt: Math.floor(Date.now() / 1000),
      };
      this.feedback.record(outcome);
      logRoutingOutcome(outcome);

      // Attempt fallback to next-best backend
      const fallback = this.tryFallback(decision, input, providerConfigs, apiKeys);
      if (fallback) {
        return fallback;
      }

      throw new Error(
        `Summarization failed on ${decision.selectedBackend}: ${errorMsg}. No fallback available.`
      );
    }
  }

  /**
   * Update backend health status.
   * Call this periodically or before routing.
   */
  async updateHealth(
    providerConfigs: ProviderConfig[],
    apiKeys: Partial<Record<ProviderType, string>>,
  ): Promise<void> {
    const checks = providerConfigs.map(async (config) => {
      const startMs = Date.now();
      try {
        const provider = createProvider(config, apiKeys);
        const health = await provider.healthCheck();
        const latencyMs = Date.now() - startMs;

        this.registry.setAvailability(config.type, health.reachable, latencyMs);
        logBackendHealthUpdate(config.type, health.reachable, latencyMs);

        // Update context window info if we got model details
        if (health.models.length > 0) {
          this.registry.update(config.type, { label: `${config.type} / ${config.model}` });
        }
      } catch {
        this.registry.setAvailability(config.type, false);
        logBackendHealthUpdate(config.type, false);
      }
    });

    await Promise.allSettled(checks);
  }

  /** Get the feedback loop for inspection/persistence. */
  getFeedback(): FeedbackLoop {
    return this.feedback;
  }

  /** Get the registry for inspection. */
  getRegistry(): BackendRegistry {
    return this.registry;
  }

  // ── Internal ────────────────────────────────────────────────────────

  private resolveProvider(
    type: ProviderType,
    configs: ProviderConfig[],
    apiKeys: Partial<Record<ProviderType, string>>,
  ): SummarizationProvider {
    const config = configs.find((c) => c.type === type);
    if (!config) {
      throw new Error(`No configuration found for provider: ${type}`);
    }
    return createProvider(config, apiKeys);
  }

  private async tryFallback(
    originalDecision: RoutingDecision,
    input: RoutingInput,
    providerConfigs: ProviderConfig[],
    apiKeys: Partial<Record<ProviderType, string>>,
  ): Promise<RouteResult | null> {
    // Find next-best eligible backend that isn't the one that just failed
    const alternatives = originalDecision.allScores
      .filter((s) => s.eligible && s.backend !== originalDecision.selectedBackend)
      .sort((a, b) => b.totalScore - a.totalScore);

    if (alternatives.length === 0) return null;

    const fallbackBackend = alternatives[0].backend;
    const startMs = Date.now();

    try {
      const provider = this.resolveProvider(fallbackBackend, providerConfigs, apiKeys);
      const result = await provider.summarize({
        messages: input.messages,
        chatName: input.chatName,
        isGroup: false,
      });

      const latencyMs = Date.now() - startMs;

      const fallbackDecision: RoutingDecision = {
        ...originalDecision,
        selectedBackend: fallbackBackend,
        explanation: `Fallback to ${fallbackBackend} after ${originalDecision.selectedBackend} failed.`,
      };

      const outcome: RoutingOutcome = {
        decision: fallbackDecision,
        success: true,
        latencyMs,
        validJson: true,
        completeResponse: Boolean(result.summary && result.actionItems && result.unresolvedQuestions),
        recordedAt: Math.floor(Date.now() / 1000),
      };

      this.feedback.record(outcome);
      logRoutingOutcome(outcome);

      return { decision: fallbackDecision, result, outcome };
    } catch {
      return null;
    }
  }
}

/** Result of a routed summarization request. */
export interface RouteResult {
  decision: RoutingDecision;
  result: {
    summary: string;
    actionItems: { assignee: string | null; description: string; deadline: string | null }[];
    unresolvedQuestions: string[];
  };
  outcome: RoutingOutcome;
}
