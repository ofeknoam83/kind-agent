import type { ChatMessage, ProviderType } from '../shared/types';

// ── Routing Input ─────────────────────────────────────────────────────

/** Everything the router needs to make a decision. */
export interface RoutingInput {
  /** Messages to be summarized. */
  messages: ChatMessage[];
  /** Name of the chat (for context). */
  chatName: string;
  /** Whether the user explicitly requested a specific provider. */
  userOverride?: ProviderType;
  /** Whether this is an incremental summarization (has prior summary). */
  isIncremental: boolean;
  /** User-level privacy preference: 'strict' = never use cloud. */
  privacyMode: PrivacyMode;
}

export type PrivacyMode = 'strict' | 'prefer-local' | 'balanced' | 'prefer-quality';

// ── Feature Vector ────────────────────────────────────────────────────

/**
 * Extracted features from the input. Pure computation — no I/O.
 * Each feature is normalized to [0, 1] unless noted otherwise.
 */
export interface FeatureVector {
  /** Number of messages in the batch. */
  messageCount: number;
  /** Estimated token count for the transcript. */
  estimatedTokens: number;
  /** Complexity score [0, 1]. Higher = more complex conversation. */
  complexity: number;
  /** Sensitivity score [0, 1]. Higher = more sensitive content. */
  sensitivity: number;
  /** Urgency score [0, 1]. Higher = user expects faster response. */
  urgency: number;
  /** Language diversity: number of distinct languages detected. */
  languageCount: number;
  /** Average message length in characters. */
  avgMessageLength: number;
  /** Ratio of unique participants to total messages. */
  participantDensity: number;
  /** Whether conversation contains code snippets. */
  containsCode: boolean;
  /** Whether conversation contains URLs. */
  containsUrls: boolean;
}

// ── Backend Descriptor ────────────────────────────────────────────────

/** Static + dynamic profile of a backend. */
export interface BackendProfile {
  /** Provider type identifier. */
  type: ProviderType;
  /** Human-readable name (e.g., "Ollama / llama3.2:8b"). */
  label: string;
  /** Max context window in tokens. */
  maxContextTokens: number;
  /** Whether this backend runs locally (no data leaves the machine). */
  isLocal: boolean;
  /** Base quality score [0, 1]. How good is this model at summarization? */
  baseQuality: number;
  /** Cost per 1K tokens (0 for local). */
  costPer1kTokens: number;
  /** Whether the backend is currently reachable. */
  available: boolean;
  /** Recent average latency in milliseconds (0 = unknown). */
  avgLatencyMs: number;
  /** Recent success rate [0, 1] (1.0 = unknown/default). */
  successRate: number;
  /** Current adjusted weight (starts at 1.0, modified by feedback). */
  weight: number;
}

// ── Scores ────────────────────────────────────────────────────────────

/** Per-backend score breakdown. Every dimension is [0, 1]. */
export interface BackendScores {
  backend: ProviderType;
  /** Can this backend handle the input? False = hard constraint violation. */
  eligible: boolean;
  /** Reason for ineligibility, if any. */
  ineligibilityReason?: string;
  /** Privacy score: 1.0 = fully local, 0.0 = cloud. */
  privacyScore: number;
  /** Quality score: estimated output quality for this input. */
  qualityScore: number;
  /** Cost score: 1.0 = free, 0.0 = expensive. */
  costScore: number;
  /** Latency score: 1.0 = fast, 0.0 = slow. */
  latencyScore: number;
  /** Availability score: 1.0 = healthy, 0.0 = down. */
  availabilityScore: number;
  /** Final weighted composite score. */
  totalScore: number;
}

// ── Routing Decision ──────────────────────────────────────────────────

export interface RoutingDecision {
  /** Selected backend. */
  selectedBackend: ProviderType;
  /** Scores for all backends (for observability). */
  allScores: BackendScores[];
  /** Human-readable explanation of why this backend was chosen. */
  explanation: string;
  /** Features that drove the decision. */
  features: FeatureVector;
  /** Timestamp of the decision. */
  decidedAt: number;
  /** Whether the user overrode the automatic selection. */
  wasOverridden: boolean;
}

// ── Routing Outcome (Feedback) ────────────────────────────────────────

export interface RoutingOutcome {
  /** The decision that was made. */
  decision: RoutingDecision;
  /** Whether the summarization succeeded. */
  success: boolean;
  /** Actual latency in milliseconds. */
  latencyMs: number;
  /** Whether the response was valid JSON. */
  validJson: boolean;
  /** Whether the response contained all required fields. */
  completeResponse: boolean;
  /** Optional error message if failed. */
  error?: string;
  /** Timestamp of the outcome. */
  recordedAt: number;
}

// ── Scoring Weights ───────────────────────────────────────────────────

/** How much each dimension matters. Sums to 1.0. */
export interface ScoringWeights {
  privacy: number;
  quality: number;
  cost: number;
  latency: number;
  availability: number;
}

/** Default weights per privacy mode. */
export const DEFAULT_WEIGHTS: Record<PrivacyMode, ScoringWeights> = {
  strict: {
    privacy: 0.90,
    quality: 0.05,
    cost: 0.00,
    latency: 0.03,
    availability: 0.02,
  },
  'prefer-local': {
    privacy: 0.50,
    quality: 0.25,
    cost: 0.05,
    latency: 0.10,
    availability: 0.10,
  },
  balanced: {
    privacy: 0.25,
    quality: 0.35,
    cost: 0.15,
    latency: 0.15,
    availability: 0.10,
  },
  'prefer-quality': {
    privacy: 0.10,
    quality: 0.50,
    cost: 0.15,
    latency: 0.15,
    availability: 0.10,
  },
};
