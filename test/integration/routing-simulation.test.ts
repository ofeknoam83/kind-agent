import { describe, it, expect, beforeEach } from 'vitest';
import { BackendRegistry } from '../../src/routing/backend-registry';
import { PolicyEngine } from '../../src/routing/policy';
import { FeedbackLoop } from '../../src/routing/feedback';
import type { RoutingInput, RoutingOutcome, RoutingDecision } from '../../src/routing/types';
import type { ChatMessage } from '../../src/shared/types';

/**
 * Simulation tests for the routing engine.
 *
 * These tests simulate sequences of routing decisions and feedback
 * to verify that the system adapts correctly over time.
 */

let registry: BackendRegistry;
let policy: PolicyEngine;
let feedback: FeedbackLoop;

function makeMessages(count: number, opts: { sensitive?: boolean; complex?: boolean } = {}): ChatMessage[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    chatId: 'sim-chat@g.us',
    senderJid: `sender-${i % (opts.complex ? 10 : 2)}@s.whatsapp.net`,
    senderName: `Person ${i % (opts.complex ? 10 : 2)}`,
    body: opts.sensitive
      ? `My account number is 4532-${i} and this is confidential`
      : opts.complex
        ? `Question ${i}: What about the ${i % 3 === 0 ? 'budget' : 'timeline'}? Should we escalate?`
        : `Normal message ${i}`,
    timestamp: now - (count - i) * (opts.complex ? (i % 10 === 0 ? 3600 : 30) : 60),
    fromMe: i % 5 === 0,
  }));
}

function makeInput(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    messages: makeMessages(20),
    chatName: 'Simulation Chat',
    isIncremental: false,
    privacyMode: 'balanced',
    ...overrides,
  };
}

function simulateOutcome(decision: RoutingDecision, success: boolean, latencyMs: number): RoutingOutcome {
  return {
    decision,
    success,
    latencyMs,
    validJson: success,
    completeResponse: success,
    error: success ? undefined : 'Simulated failure',
    recordedAt: Math.floor(Date.now() / 1000),
  };
}

beforeEach(() => {
  registry = new BackendRegistry();
  registry.setAvailability('ollama', true, 5000);
  registry.setAvailability('lmstudio', true, 4000);
  registry.setAvailability('openai', true, 2000);
  policy = new PolicyEngine(registry);
  feedback = new FeedbackLoop(registry);
});

describe('Routing simulation: backend degradation', () => {
  it('reduces weight of a backend that repeatedly fails', () => {
    const initialWeight = registry.get('ollama')!.weight;

    // Simulate 10 failures from Ollama
    for (let i = 0; i < 10; i++) {
      const decision = policy.decide(makeInput());
      const outcome = simulateOutcome(decision, false, 30000);
      // Force the outcome to be attributed to ollama
      outcome.decision = { ...decision, selectedBackend: 'ollama' };
      feedback.record(outcome);
    }

    const updatedWeight = registry.get('ollama')!.weight;
    expect(updatedWeight).toBeLessThan(initialWeight);
  });

  it('increases weight of a consistently successful backend', () => {
    // Start with a low weight
    registry.update('lmstudio', { weight: 0.5 });
    const initialWeight = registry.get('lmstudio')!.weight;

    // Simulate 20 successes
    for (let i = 0; i < 20; i++) {
      const decision = policy.decide(makeInput());
      const outcome = simulateOutcome(
        { ...decision, selectedBackend: 'lmstudio' },
        true,
        3000
      );
      feedback.record(outcome);
    }

    const updatedWeight = registry.get('lmstudio')!.weight;
    expect(updatedWeight).toBeGreaterThan(initialWeight);
  });
});

describe('Routing simulation: privacy escalation', () => {
  it('routes sensitive content to local even in balanced mode', () => {
    const decisions: string[] = [];

    // Run 10 routing decisions with increasingly sensitive content
    for (let i = 0; i < 10; i++) {
      const messages = makeMessages(20 + i * 10, { sensitive: i > 5 });
      const decision = policy.decide(makeInput({ messages }));
      decisions.push(decision.selectedBackend);
    }

    // Later decisions (with sensitive content) should prefer local
    const laterDecisions = decisions.slice(6);
    const localCount = laterDecisions.filter((d) => {
      const profile = registry.get(d as 'ollama' | 'lmstudio' | 'openai');
      return profile?.isLocal;
    }).length;

    expect(localCount).toBe(laterDecisions.length);
  });
});

describe('Routing simulation: complexity escalation', () => {
  it('escalates to cloud for very complex content in quality mode', () => {
    const complexMessages = makeMessages(200, { complex: true });
    const decision = policy.decide(
      makeInput({
        messages: complexMessages,
        privacyMode: 'prefer-quality',
      })
    );

    // With 200 complex messages and quality preference, should pick OpenAI
    expect(decision.selectedBackend).toBe('openai');
    expect(decision.features.complexity).toBeGreaterThan(0.3);
  });
});

describe('Routing simulation: fallback on unavailability', () => {
  it('falls back when primary backend becomes unavailable', () => {
    // First decision: Ollama is available
    const decision1 = policy.decide(makeInput({ privacyMode: 'prefer-local' }));
    expect(registry.get(decision1.selectedBackend)?.isLocal).toBe(true);

    // Ollama goes down
    registry.setAvailability('ollama', false);

    // Second decision: should fall back to LM Studio
    const decision2 = policy.decide(makeInput({ privacyMode: 'prefer-local' }));
    expect(decision2.selectedBackend).toBe('lmstudio');

    // LM Studio also goes down
    registry.setAvailability('lmstudio', false);

    // Third decision: only OpenAI left
    const decision3 = policy.decide(makeInput({ privacyMode: 'prefer-local' }));
    expect(decision3.selectedBackend).toBe('openai');
  });
});

describe('Routing simulation: latency adaptation', () => {
  it('updates latency estimates from feedback', () => {
    const initialLatency = registry.get('ollama')!.avgLatencyMs;

    // Simulate outcomes with increasing latency
    for (let i = 0; i < 10; i++) {
      const decision = policy.decide(makeInput());
      const outcome = simulateOutcome(
        { ...decision, selectedBackend: 'ollama' },
        true,
        10000 + i * 1000 // 10s, 11s, 12s, ...
      );
      feedback.record(outcome);
    }

    const updatedLatency = registry.get('ollama')!.avgLatencyMs;
    expect(updatedLatency).toBeGreaterThan(initialLatency);
  });
});
