import type { ProviderType } from '../shared/types';
import type { BackendProfile } from './types';

/**
 * Backend registry.
 *
 * Maintains the static + dynamic profile of each available backend.
 * Profiles are updated by:
 * - Health checks (available, avgLatencyMs)
 * - Feedback loop (successRate, weight)
 * - User configuration (baseQuality, costPer1kTokens)
 *
 * New models are added here — no changes needed in scoring or policy.
 */

/** Default profiles. Adjusted at runtime by feedback loop. */
const DEFAULT_PROFILES: BackendProfile[] = [
  {
    type: 'ollama',
    label: 'Ollama / llama3.2:8b',
    maxContextTokens: 8192,
    isLocal: true,
    baseQuality: 0.55,
    costPer1kTokens: 0,
    available: false,
    avgLatencyMs: 0,
    successRate: 1.0,
    weight: 1.0,
  },
  {
    type: 'lmstudio',
    label: 'LM Studio',
    maxContextTokens: 8192,
    isLocal: true,
    baseQuality: 0.60,
    costPer1kTokens: 0,
    available: false,
    avgLatencyMs: 0,
    successRate: 1.0,
    weight: 1.0,
  },
  {
    type: 'openai',
    label: 'OpenAI / gpt-4o',
    maxContextTokens: 128000,
    isLocal: false,
    baseQuality: 0.95,
    costPer1kTokens: 0.005,
    available: false,
    avgLatencyMs: 0,
    successRate: 1.0,
    weight: 1.0,
  },
];

export class BackendRegistry {
  private profiles: Map<ProviderType, BackendProfile>;

  constructor(overrides?: Partial<BackendProfile>[]) {
    this.profiles = new Map();

    for (const defaults of DEFAULT_PROFILES) {
      const override = overrides?.find((o) => o.type === defaults.type);
      this.profiles.set(defaults.type, { ...defaults, ...override });
    }
  }

  /** Get all registered backend profiles. */
  getAll(): BackendProfile[] {
    return Array.from(this.profiles.values());
  }

  /** Get a specific backend profile. */
  get(type: ProviderType): BackendProfile | undefined {
    return this.profiles.get(type);
  }

  /** Get only available backends. */
  getAvailable(): BackendProfile[] {
    return this.getAll().filter((b) => b.available);
  }

  /** Update a backend's dynamic properties (from health check or feedback). */
  update(type: ProviderType, patch: Partial<BackendProfile>): void {
    const existing = this.profiles.get(type);
    if (existing) {
      this.profiles.set(type, { ...existing, ...patch });
    }
  }

  /** Mark a backend as available/unavailable after a health check. */
  setAvailability(type: ProviderType, available: boolean, latencyMs?: number): void {
    this.update(type, {
      available,
      ...(latencyMs !== undefined ? { avgLatencyMs: latencyMs } : {}),
    });
  }

  /**
   * Register a new backend at runtime.
   * This is how new models are added without touching scoring/policy code.
   */
  register(profile: BackendProfile): void {
    this.profiles.set(profile.type, profile);
  }
}
