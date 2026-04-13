import React, { useState, useEffect } from 'react';
import type { ProviderConfig, ProviderStatus } from '../../shared/types';
import { useApi } from '../hooks/use-api';

export function SettingsPanel() {
  const api = useApi();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [healthStatus, setHealthStatus] = useState<Record<string, ProviderStatus>>({});
  const [apiKeyInput, setApiKeyInput] = useState('');

  useEffect(() => {
    api.providers.list().then(setProviders);
  }, [api]);

  const checkHealth = async () => {
    const results = await api.providers.healthCheck();
    const map: Record<string, ProviderStatus> = {};
    for (const r of results) {
      map[r.type] = r;
    }
    setHealthStatus(map);
  };

  const setActive = async (type: string) => {
    const provider = providers.find((p) => p.type === type);
    if (!provider) return;
    await api.providers.update({ ...provider, active: true });
    const updated = await api.providers.list();
    setProviders(updated);
  };

  const saveOpenAIKey = async () => {
    if (!apiKeyInput.trim()) return;
    await api.providers.setApiKey('openai', apiKeyInput.trim());
    setApiKeyInput('');
  };

  return (
    <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 24 }}>Provider Settings</h2>

      <button
        onClick={checkHealth}
        style={{
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '8px 16px',
          cursor: 'pointer',
          marginBottom: 24,
        }}
      >
        Check All Providers
      </button>

      {providers.map((provider) => {
        const health = healthStatus[provider.type];
        return (
          <div
            key={provider.type}
            style={{
              background: 'var(--bg-secondary)',
              border: `1px solid ${provider.active ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: 14 }}>{provider.label}</strong>
                {provider.active && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      background: 'var(--accent)',
                      color: '#fff',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    Active
                  </span>
                )}
              </div>
              {!provider.active && (
                <button
                  onClick={() => setActive(provider.type)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--accent)',
                    color: 'var(--accent)',
                    borderRadius: 'var(--radius)',
                    padding: '4px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Set Active
                </button>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              {provider.baseUrl} · Model: {provider.model}
            </div>

            {health && (
              <div
                style={{
                  fontSize: 12,
                  marginTop: 8,
                  color: health.reachable ? 'var(--accent)' : 'var(--danger)',
                }}
              >
                {health.reachable
                  ? `Reachable · ${health.models.length} models available`
                  : `Unreachable: ${health.error}`}
              </div>
            )}

            {/* OpenAI-specific: API key input */}
            {provider.type === 'openai' && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '6px 12px',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                />
                <button
                  onClick={saveOpenAIKey}
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Save Key
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
