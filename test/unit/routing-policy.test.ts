import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from '../../src/routing/policy';
import { BackendRegistry } from '../../src/routing/backend-registry';
import type { RoutingInput } from '../../src/routing/types';
import type { ChatMessage } from '../../src/shared/types';

// ── Helpers ───────────────────────────────────────────────────────────

function makeMessages(count: number, bodyOverride?: string): ChatMessage[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    chatId: 'chat-1@g.us',
    senderJid: `sender-${i % 3}@s.whatsapp.net`,
    senderName: `Person ${i % 3}`,
    body: bodyOverride ?? `Message ${i}: let's discuss the project plan`,
    timestamp: now - (count - i) * 60,
    fromMe: i % 5 === 0,
  }));
}

function makeInput(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    messages: makeMessages(20),
    chatName: 'Test Group',
    isIncremental: false,
    privacyMode: 'balanced',
    ...overrides,
  };
}

let registry: BackendRegistry;
let policy: PolicyEngine;

beforeEach(() => {
  registry = new BackendRegistry();
  // Mark all backends as available
  registry.setAvailability('ollama', true, 5000);
  registry.setAvailability('lmstudio', true, 4000);
  registry.setAvailability('openai', true, 2000);
  policy = new PolicyEngine(registry);
});

// ── Basic Decision Flow ───────────────────────────────────────────────

describe('PolicyEngine: basic decisions', () => {
  it('returns a valid decision with all fields', () => {
    const decision = policy.decide(makeInput());

    expect(decision.selectedBackend).toBeDefined();
    expect(decision.allScores.length).toBe(3);
    expect(decision.explanation).toBeTruthy();
    expect(decision.features.messageCount).toBe(20);
    expect(decision.decidedAt).toBeGreaterThan(0);
    expect(decision.wasOverridden).toBe(false);
  });

  it('prefers local backends in balanced mode for simple content', () => {
    const decision = policy.decide(makeInput({ privacyMode: 'balanced' }));
    const profile = registry.get(decision.selectedBackend);
    // With balanced weights and low complexity, local should win
    // (privacy score + cost score + reasonable quality)
    expect(profile?.isLocal).toBe(true);
  });
});

// ── User Override ─────────────────────────────────────────────────────

describe('PolicyEngine: user override', () => {
  it('respects user override regardless of scores', () => {
    const decision = policy.decide(
      makeInput({ userOverride: 'openai', privacyMode: 'strict' })
    );
    expect(decision.selectedBackend).toBe('openai');
    expect(decision.wasOverridden).toBe(true);
  });
});

// ── Privacy Modes ─────────────────────────────────────────────────────

describe('PolicyEngine: privacy modes', () => {
  it('strict mode never selects cloud', () => {
    const decision = policy.decide(makeInput({ privacyMode: 'strict' }));
    const profile = registry.get(decision.selectedBackend);
    expect(profile?.isLocal).toBe(true);
  });

  it('prefer-quality mode selects cloud for complex content', () => {
    // Create complex input: many participants, questions, topic shifts
    const now = Math.floor(Date.now() / 1000);
    const complexMessages = Array.from({ length: 200 }, (_, i) => ({
      id: `msg-${i}`,
      chatId: 'chat-1@g.us',
      senderJid: `sender-${i % 12}@s.whatsapp.net`,
      senderName: `Person ${i % 12}`,
      body: i % 3 === 0 ? `What about item ${i}? Should we proceed?` : `Response to point ${i}`,
      timestamp: now - (200 - i) * (i % 15 === 0 ? 3600 : 30),
      fromMe: false,
    }));

    const decision = policy.decide(
      makeInput({ messages: complexMessages, privacyMode: 'prefer-quality' })
    );

    // With high complexity + prefer-quality, OpenAI should win
    expect(decision.selectedBackend).toBe('openai');
  });
});

// ── Sensitivity Override ──────────────────────────────────────────────

describe('PolicyEngine: sensitivity override', () => {
  it('forces local when content is highly sensitive', () => {
    const sensitiveMessages = makeMessages(20, 'My account number is 4532-1234-5678-9012 and this is confidential');

    const decision = policy.decide(
      makeInput({
        messages: sensitiveMessages,
        privacyMode: 'balanced', // Even in balanced mode
      })
    );

    const profile = registry.get(decision.selectedBackend);
    expect(profile?.isLocal).toBe(true);
  });
});

// ── Fallback: No Available Backends ───────────────────────────────────

describe('PolicyEngine: edge cases', () => {
  it('handles no available backends gracefully', () => {
    registry.setAvailability('ollama', false);
    registry.setAvailability('lmstudio', false);
    registry.setAvailability('openai', false);

    const decision = policy.decide(makeInput());

    // Should still return a decision (will fail at execution)
    expect(decision.selectedBackend).toBeDefined();
    expect(decision.explanation).toContain('No eligible');
  });

  it('handles single available backend', () => {
    registry.setAvailability('ollama', false);
    registry.setAvailability('lmstudio', false);
    // Only OpenAI is available

    const decision = policy.decide(makeInput({ privacyMode: 'balanced' }));
    expect(decision.selectedBackend).toBe('openai');
  });
});
