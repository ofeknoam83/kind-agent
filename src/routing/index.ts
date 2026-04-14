export { Router } from './router';
export type { RouteResult } from './router';
export { BackendRegistry } from './backend-registry';
export { PolicyEngine } from './policy';
export { FeedbackLoop } from './feedback';
export { extractFeatures, computeComplexity, computeSensitivity, computeUrgency, estimateTokens } from './features';
export { scoreBackend } from './scoring';
export { logRoutingDecision, logRoutingOutcome, setLogLevel } from './logger';
export type {
  RoutingInput,
  RoutingDecision,
  RoutingOutcome,
  FeatureVector,
  BackendProfile,
  BackendScores,
  ScoringWeights,
  PrivacyMode,
} from './types';
export { DEFAULT_WEIGHTS } from './types';
