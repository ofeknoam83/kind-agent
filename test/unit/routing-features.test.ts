import { describe, it, expect } from 'vitest';
import {
  extractFeatures,
  computeComplexity,
  computeSensitivity,
  computeUrgency,
  estimateTokens,
  detectLanguageCount,
} from '../../src/routing/features';
import type { ChatMessage } from '../../src/shared/types';
import type { RoutingInput } from '../../src/routing/types';

// ── Helpers ───────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `msg-${Math.random()}`,
    chatId: 'chat-1@g.us',
    senderJid: 'sender-1@s.whatsapp.net',
    senderName: 'Alice',
    body: 'Hello world',
    timestamp: Math.floor(Date.now() / 1000),
    fromMe: false,
    ...overrides,
  };
}

function makeInput(messages: ChatMessage[], overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    messages,
    chatName: 'Test Chat',
    isIncremental: false,
    privacyMode: 'balanced',
    ...overrides,
  };
}

// ── Token Estimation ──────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('estimates tokens for English text', () => {
    const text = 'Hello, how are you doing today?'; // ~30 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(15);
  });

  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

// ── Complexity ────────────────────────────────────────────────────────

describe('computeComplexity', () => {
  it('returns 0 for empty messages', () => {
    expect(computeComplexity([])).toBe(0);
  });

  it('returns low complexity for a simple 2-person chat', () => {
    const msgs = [
      makeMessage({ senderJid: 'a', body: 'Hey' }),
      makeMessage({ senderJid: 'b', body: 'Hi!' }),
      makeMessage({ senderJid: 'a', body: 'How are you?' }),
    ];
    const complexity = computeComplexity(msgs);
    expect(complexity).toBeLessThan(0.4);
  });

  it('returns high complexity for multi-participant, multi-topic chat', () => {
    const now = Math.floor(Date.now() / 1000);
    const msgs: ChatMessage[] = [];

    // 5 participants, 100 messages, with topic shifts (gaps)
    for (let i = 0; i < 100; i++) {
      msgs.push(
        makeMessage({
          senderJid: `sender-${i % 5}`,
          senderName: `Person ${i % 5}`,
          body: i % 7 === 0 ? 'What about the budget?' : `Message number ${i}`,
          timestamp: now - (100 - i) * (i % 20 === 0 ? 3600 : 60), // Topic shifts every 20 msgs
        })
      );
    }

    const complexity = computeComplexity(msgs);
    expect(complexity).toBeGreaterThan(0.4);
  });

  it('considers question density', () => {
    const noQuestions = [
      makeMessage({ body: 'Statement one.' }),
      makeMessage({ body: 'Statement two.' }),
    ];
    const withQuestions = [
      makeMessage({ body: 'What do you think?' }),
      makeMessage({ body: 'Should we proceed?' }),
    ];

    expect(computeComplexity(withQuestions)).toBeGreaterThan(computeComplexity(noQuestions));
  });
});

// ── Sensitivity ───────────────────────────────────────────────────────

describe('computeSensitivity', () => {
  it('returns 0 for innocuous content', () => {
    const bodies = ['Hey, want to grab lunch?', 'Sure, 12:30 works'];
    expect(computeSensitivity(bodies)).toBe(0);
  });

  it('detects financial information', () => {
    const bodies = ['My card number is 4532-1234-5678-9012', 'Thanks for the account details'];
    expect(computeSensitivity(bodies)).toBeGreaterThan(0.15);
  });

  it('detects confidentiality markers', () => {
    const bodies = ['This is confidential, do not share with anyone'];
    expect(computeSensitivity(bodies)).toBeGreaterThan(0.3);
  });

  it('detects medical content', () => {
    const bodies = ['The doctor said the diagnosis is concerning', 'What medication did they prescribe?'];
    expect(computeSensitivity(bodies)).toBeGreaterThan(0.1);
  });

  it('accumulates multiple signals', () => {
    const single = computeSensitivity(['My account number is 123-456']);
    const multiple = computeSensitivity([
      'My account number is 123-456',
      'This is confidential',
      'The attorney will review the contract',
    ]);
    expect(multiple).toBeGreaterThan(single);
  });
});

// ── Urgency ───────────────────────────────────────────────────────────

describe('computeUrgency', () => {
  it('returns 0 for empty messages', () => {
    expect(computeUrgency([], false)).toBe(0);
  });

  it('returns higher urgency for recent messages', () => {
    const now = Math.floor(Date.now() / 1000);
    const recent = [makeMessage({ timestamp: now - 60 })]; // 1 minute ago
    const old = [makeMessage({ timestamp: now - 7200 })]; // 2 hours ago

    expect(computeUrgency(recent, false)).toBeGreaterThan(computeUrgency(old, false));
  });

  it('boosts urgency for incremental mode', () => {
    const now = Math.floor(Date.now() / 1000);
    const msgs = [makeMessage({ timestamp: now - 300 })];

    const normal = computeUrgency(msgs, false);
    const incremental = computeUrgency(msgs, true);

    expect(incremental).toBeGreaterThan(normal);
  });
});

// ── Language Detection ────────────────────────────────────────────────

describe('detectLanguageCount', () => {
  it('detects single Latin script', () => {
    expect(detectLanguageCount(['Hello world', 'How are you?'])).toBe(1);
  });

  it('detects Hebrew script', () => {
    expect(detectLanguageCount(['שלום עולם', 'Hello world'])).toBe(2);
  });

  it('detects CJK script', () => {
    expect(detectLanguageCount(['你好世界', 'Hello'])).toBe(2);
  });
});

// ── Full Feature Extraction ───────────────────────────────────────────

describe('extractFeatures', () => {
  it('returns empty features for no messages', () => {
    const input = makeInput([]);
    const features = extractFeatures(input);
    expect(features.messageCount).toBe(0);
    expect(features.complexity).toBe(0);
  });

  it('extracts all features for a normal chat', () => {
    const msgs = Array.from({ length: 10 }, (_, i) =>
      makeMessage({
        senderJid: `sender-${i % 3}`,
        body: `Message ${i}: Let's discuss the project. https://example.com`,
        timestamp: Math.floor(Date.now() / 1000) - (10 - i) * 60,
      })
    );

    const features = extractFeatures(makeInput(msgs));

    expect(features.messageCount).toBe(10);
    expect(features.estimatedTokens).toBeGreaterThan(0);
    expect(features.complexity).toBeGreaterThanOrEqual(0);
    expect(features.complexity).toBeLessThanOrEqual(1);
    expect(features.sensitivity).toBeGreaterThanOrEqual(0);
    expect(features.containsUrls).toBe(true);
    expect(features.participantDensity).toBeGreaterThan(0);
  });
});
