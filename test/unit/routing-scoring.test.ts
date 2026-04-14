import { describe, it, expect } from 'vitest';
import { scoreBackend } from '../../src/routing/scoring';
import type { BackendProfile, FeatureVector, ScoringWeights } from '../../src/routing/types';
import { DEFAULT_WEIGHTS } from '../../src/routing/types';

// ── Helpers ───────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<BackendProfile> = {}): BackendProfile {
  return {
    type: 'ollama',
    label: 'Ollama / llama3.2:8b',
    maxContextTokens: 8192,
    isLocal: true,
    baseQuality: 0.6,
    costPer1kTokens: 0,
    available: true,
    avgLatencyMs: 5000,
    successRate: 0.95,
    weight: 1.0,
    ...overrides,
  };
}

function makeFeatures(overrides: Partial<FeatureVector> = {}): FeatureVector {
  return {
    messageCount: 50,
    estimatedTokens: 2000,
    complexity: 0.4,
    sensitivity: 0.1,
    urgency: 0.3,
    languageCount: 1,
    avgMessageLength: 40,
    participantDensity: 0.1,
    containsCode: false,
    containsUrls: false,
    ...overrides,
  };
}

const balancedWeights = DEFAULT_WEIGHTS['balanced'];

// ── Eligibility ───────────────────────────────────────────────────────

describe('scoreBackend: eligibility', () => {
  it('marks unavailable backends as ineligible', () => {
    const profile = makeProfile({ available: false });
    const scores = scoreBackend(profile, makeFeatures(), balancedWeights);
    expect(scores.eligible).toBe(false);
    expect(scores.ineligibilityReason).toContain('not available');
  });

  it('marks backends as ineligible when input exceeds context window', () => {
    const profile = makeProfile({ maxContextTokens: 1000 });
    const features = makeFeatures({ estimatedTokens: 2000 });
    const scores = scoreBackend(profile, features, balancedWeights);
    expect(scores.eligible).toBe(false);
    expect(scores.ineligibilityReason).toContain('exceeds');
  });

  it('marks backends with very low success rate as ineligible', () => {
    const profile = makeProfile({ successRate: 0.3 });
    const scores = scoreBackend(profile, makeFeatures(), balancedWeights);
    expect(scores.eligible).toBe(false);
    expect(scores.ineligibilityReason).toContain('success rate');
  });

  it('allows healthy backends within context limits', () => {
    const profile = makeProfile();
    const scores = scoreBackend(profile, makeFeatures(), balancedWeights);
    expect(scores.eligible).toBe(true);
  });
});

// ── Privacy Score ─────────────────────────────────────────────────────

describe('scoreBackend: privacy', () => {
  it('gives local backends a perfect privacy score', () => {
    const profile = makeProfile({ isLocal: true });
    const scores = scoreBackend(profile, makeFeatures(), balancedWeights);
    expect(scores.privacyScore).toBe(1.0);
  });

  it('gives cloud backends a zero privacy score', () => {
    const profile = makeProfile({ type: 'openai', isLocal: false });
    const scores = scoreBackend(profile, makeFeatures(), balancedWeights);
    expect(scores.privacyScore).toBe(0.0);
  });
});

// ── Quality Score ─────────────────────────────────────────────────────

describe('scoreBackend: quality', () => {
  it('penalizes local models on complex inputs', () => {
    const profile = makeProfile({ isLocal: true, baseQuality: 0.6 });
    const simple = makeFeatures({ complexity: 0.1 });
    const complex = makeFeatures({ complexity: 0.9 });

    const simpleScore = scoreBackend(profile, simple, balancedWeights);
    const complexScore = scoreBackend(profile, complex, balancedWeights);

    expect(simpleScore.qualityScore).toBeGreaterThan(complexScore.qualityScore);
  });

  it('does not penalize cloud models on complex inputs', () => {
    const profile = makeProfile({ type: 'openai', isLocal: false, baseQuality: 0.95 });
    const simple = makeFeatures({ complexity: 0.1 });
    const complex = makeFeatures({ complexity: 0.9 });

    const simpleScore = scoreBackend(profile, simple, balancedWeights);
    const complexScore = scoreBackend(profile, complex, balancedWeights);

    // Cloud models maintain quality
    expect(Math.abs(simpleScore.qualityScore - complexScore.qualityScore)).toBeLessThan(0.05);
  });

  it('penalizes local models for multi-language content', () => {
    const profile = makeProfile({ isLocal: true });
    const single = makeFeatures({ languageCount: 1 });
    const multi = makeFeatures({ languageCount: 3 });

    expect(scoreBackend(profile, single, balancedWeights).qualityScore).toBeGreaterThan(
      scoreBackend(profile, multi, balancedWeights).qualityScore
    );
  });
});

// ── Cost Score ─────────────────────────────────────────────────────────

describe('scoreBackend: cost', () => {
  it('gives free backends a perfect cost score', () => {
    const profile = makeProfile({ costPer1kTokens: 0 });
    const scores = scoreBackend(profile, makeFeatures(), balancedWeights);
    expect(scores.costScore).toBe(1.0);
  });

  it('penalizes expensive backends proportionally', () => {
    const cheap = makeProfile({ type: 'openai', isLocal: false, costPer1kTokens: 0.001 });
    const expensive = makeProfile({ type: 'openai', isLocal: false, costPer1kTokens: 0.01 });
    const features = makeFeatures({ estimatedTokens: 5000 });

    const cheapScore = scoreBackend(cheap, features, balancedWeights);
    const expensiveScore = scoreBackend(expensive, features, balancedWeights);

    expect(cheapScore.costScore).toBeGreaterThan(expensiveScore.costScore);
  });
});

// ── Total Score with Weights ──────────────────────────────────────────

describe('scoreBackend: weighted total', () => {
  it('privacy-heavy weights favor local backends', () => {
    const local = makeProfile({ type: 'ollama', isLocal: true, baseQuality: 0.5 });
    const cloud = makeProfile({ type: 'openai', isLocal: false, baseQuality: 0.95 });
    const features = makeFeatures();
    const privacyWeights = DEFAULT_WEIGHTS['strict'];

    const localScore = scoreBackend(local, features, privacyWeights);
    const cloudScore = scoreBackend(cloud, features, privacyWeights);

    expect(localScore.totalScore).toBeGreaterThan(cloudScore.totalScore);
  });

  it('quality-heavy weights favor cloud backends', () => {
    const local = makeProfile({ type: 'ollama', isLocal: true, baseQuality: 0.5 });
    const cloud = makeProfile({ type: 'openai', isLocal: false, baseQuality: 0.95 });
    const features = makeFeatures({ complexity: 0.8 });
    const qualityWeights = DEFAULT_WEIGHTS['prefer-quality'];

    const localScore = scoreBackend(local, features, qualityWeights);
    const cloudScore = scoreBackend(cloud, features, qualityWeights);

    expect(cloudScore.totalScore).toBeGreaterThan(localScore.totalScore);
  });

  it('applies backend weight from feedback loop', () => {
    const penalized = makeProfile({ weight: 0.5 });
    const normal = makeProfile({ weight: 1.0, type: 'lmstudio' });
    const features = makeFeatures();

    const penalizedScore = scoreBackend(penalized, features, balancedWeights);
    const normalScore = scoreBackend(normal, features, balancedWeights);

    expect(normalScore.totalScore).toBeGreaterThan(penalizedScore.totalScore);
  });
});
