import type { ChatMessage } from '../shared/types';
import type { FeatureVector, RoutingInput } from './types';

/**
 * Feature extraction layer.
 *
 * Pure functions — no I/O, no side effects.
 * All features are computed synchronously from the input messages.
 * Designed to run in <5ms for 2000 messages.
 */

// ── Main Extractor ────────────────────────────────────────────────────

export function extractFeatures(input: RoutingInput): FeatureVector {
  const { messages } = input;

  if (messages.length === 0) {
    return EMPTY_FEATURES;
  }

  const bodies = messages.map((m) => m.body);
  const allText = bodies.join('\n');

  return {
    messageCount: messages.length,
    estimatedTokens: estimateTokens(allText),
    complexity: computeComplexity(messages),
    sensitivity: computeSensitivity(bodies),
    urgency: computeUrgency(messages, input.isIncremental),
    languageCount: detectLanguageCount(bodies),
    avgMessageLength: allText.length / messages.length,
    participantDensity: computeParticipantDensity(messages),
    containsCode: CODE_PATTERN.test(allText),
    containsUrls: URL_PATTERN.test(allText),
  };
}

const EMPTY_FEATURES: FeatureVector = {
  messageCount: 0,
  estimatedTokens: 0,
  complexity: 0,
  sensitivity: 0,
  urgency: 0,
  languageCount: 0,
  avgMessageLength: 0,
  participantDensity: 0,
  containsCode: false,
  containsUrls: false,
};

// ── Complexity ────────────────────────────────────────────────────────

/**
 * Complexity score [0, 1].
 *
 * Factors:
 * - Number of topic shifts (approximated by large gaps in conversation)
 * - Number of unique participants
 * - Presence of questions (high ? density)
 * - Message count (more messages = harder to summarize well)
 * - Thread depth (replies, interleaving speakers)
 */
export function computeComplexity(messages: ChatMessage[]): number {
  const n = messages.length;
  if (n === 0) return 0;

  // Factor 1: Message volume (log scale, saturates at 1000)
  const volumeScore = Math.min(1, Math.log10(n + 1) / 3);

  // Factor 2: Participant count (more speakers = more complex)
  const uniqueSenders = new Set(messages.map((m) => m.senderJid)).size;
  const participantScore = Math.min(1, uniqueSenders / 15);

  // Factor 3: Question density
  const questionMessages = messages.filter((m) => m.body.includes('?')).length;
  const questionDensity = questionMessages / n;

  // Factor 4: Topic shift estimation (gaps > 30 minutes between messages)
  const GAP_THRESHOLD = 30 * 60; // 30 minutes
  let topicShifts = 0;
  for (let i = 1; i < n; i++) {
    if (messages[i].timestamp - messages[i - 1].timestamp > GAP_THRESHOLD) {
      topicShifts++;
    }
  }
  const shiftScore = Math.min(1, topicShifts / 10);

  // Factor 5: Speaker interleaving (rapid back-and-forth = discussion, not monologue)
  let speakerChanges = 0;
  for (let i = 1; i < n; i++) {
    if (messages[i].senderJid !== messages[i - 1].senderJid) {
      speakerChanges++;
    }
  }
  const interleavingScore = n > 1 ? speakerChanges / (n - 1) : 0;

  // Weighted combination
  return clamp(
    volumeScore * 0.25 +
    participantScore * 0.20 +
    questionDensity * 0.20 +
    shiftScore * 0.15 +
    interleavingScore * 0.20
  );
}

// ── Sensitivity ───────────────────────────────────────────────────────

/**
 * Sensitivity score [0, 1].
 *
 * Detects content that should stay local:
 * - Financial information (account numbers, amounts)
 * - Personal identifiers (emails, phone numbers, addresses)
 * - Medical/health terms
 * - Legal language
 * - Explicit "confidential" / "private" markers
 */
export function computeSensitivity(bodies: string[]): number {
  const allText = bodies.join(' ').toLowerCase();
  const totalChars = allText.length;
  if (totalChars === 0) return 0;

  let score = 0;

  // Pattern-based detection with weights
  for (const { pattern, weight } of SENSITIVITY_PATTERNS) {
    const matches = allText.match(pattern);
    if (matches) {
      // More matches = higher confidence, but saturate
      score += weight * Math.min(1, matches.length / 3);
    }
  }

  // Explicit confidentiality markers are strong signals
  if (CONFIDENTIAL_PATTERN.test(allText)) {
    score += 0.4;
  }

  return clamp(score);
}

const SENSITIVITY_PATTERNS: { pattern: RegExp; weight: number }[] = [
  // Financial
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, weight: 0.3 },  // Card numbers
  { pattern: /\$\d+[\d,.]*|\b\d+[\d,.]*\s*(?:usd|eur|gbp|dollars?)\b/gi, weight: 0.15 },
  { pattern: /\b(?:account|routing|swift|iban)\s*(?:number|#|no\.?)?[\s:]*[\w\d-]+/gi, weight: 0.25 },

  // Personal identifiers
  { pattern: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, weight: 0.1 },  // Email
  { pattern: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, weight: 0.25 },  // SSN-like
  { pattern: /\b(?:passport|license|id)\s*(?:number|#|no\.?)?[\s:]*[\w\d-]+/gi, weight: 0.2 },

  // Medical
  { pattern: /\b(?:diagnosis|prescription|medication|symptoms?|treatment|doctor|hospital|patient)\b/gi, weight: 0.15 },

  // Legal
  { pattern: /\b(?:lawsuit|attorney|court|settlement|nda|non-disclosure|contract)\b/gi, weight: 0.15 },
];

const CONFIDENTIAL_PATTERN = /\b(?:confidential|private|secret|do not share|don't share|off the record)\b/i;

// ── Urgency ───────────────────────────────────────────────────────────

/**
 * Urgency score [0, 1].
 *
 * Higher urgency = user expects a faster response.
 * Factors:
 * - Recency of messages (recent = urgent)
 * - Message velocity (burst of messages = active conversation)
 * - Incremental mode (already seen some, just need delta)
 */
export function computeUrgency(messages: ChatMessage[], isIncremental: boolean): number {
  if (messages.length === 0) return 0;

  const now = Math.floor(Date.now() / 1000);

  // Factor 1: Recency — how recent is the latest message?
  const latestTs = Math.max(...messages.map((m) => m.timestamp));
  const ageSec = now - latestTs;
  // Messages from the last 5 minutes = very urgent, >1 hour = not urgent
  const recencyScore = Math.max(0, 1 - ageSec / 3600);

  // Factor 2: Velocity — messages per minute in the last 10 minutes
  const tenMinAgo = now - 600;
  const recentMessages = messages.filter((m) => m.timestamp > tenMinAgo).length;
  const velocityScore = Math.min(1, recentMessages / 30); // 30 msgs/10min = high velocity

  // Factor 3: Incremental boost (smaller delta = faster expected response)
  const incrementalBoost = isIncremental ? 0.2 : 0;

  return clamp(
    recencyScore * 0.45 +
    velocityScore * 0.35 +
    incrementalBoost
  );
}

// ── Language Detection ────────────────────────────────────────────────

/**
 * Rough language count estimation.
 * We don't need a full NLP pipeline — just detect script diversity.
 */
export function detectLanguageCount(bodies: string[]): number {
  const sample = bodies.slice(0, 100).join(' ');

  const scripts = new Set<string>();

  if (/[a-zA-Z]/.test(sample)) scripts.add('latin');
  if (/[\u0590-\u05FF]/.test(sample)) scripts.add('hebrew');
  if (/[\u0600-\u06FF]/.test(sample)) scripts.add('arabic');
  if (/[\u4E00-\u9FFF]/.test(sample)) scripts.add('cjk');
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) scripts.add('japanese');
  if (/[\uAC00-\uD7AF]/.test(sample)) scripts.add('korean');
  if (/[\u0400-\u04FF]/.test(sample)) scripts.add('cyrillic');
  if (/[\u0900-\u097F]/.test(sample)) scripts.add('devanagari');
  if (/[\u0E00-\u0E7F]/.test(sample)) scripts.add('thai');

  return Math.max(1, scripts.size);
}

// ── Participant Density ───────────────────────────────────────────────

function computeParticipantDensity(messages: ChatMessage[]): number {
  if (messages.length === 0) return 0;
  const uniqueSenders = new Set(messages.map((m) => m.senderJid)).size;
  return uniqueSenders / messages.length;
}

// ── Token Estimation ──────────────────────────────────────────────────

/**
 * Rough token estimation.
 * English: ~4 chars per token. CJK: ~2 chars per token.
 * We use 3.5 as a middle ground for mixed-language content.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ── Utility ───────────────────────────────────────────────────────────

const CODE_PATTERN = /```[\s\S]*?```|`[^`]+`|\b(?:function|const|let|var|import|export|class|def|return)\b.*[{(;]/;
const URL_PATTERN = /https?:\/\/[^\s]+/;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
