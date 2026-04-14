import React from 'react';
import type { ConnectionState } from '../../shared/types';

interface Props {
  state: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  onLogout: () => void;
  loading: boolean;
}

export function ConnectionPanel({ state, onConnect, onDisconnect, onLogout, loading }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {state.status === 'connected' && state.phoneNumber}
        {state.status === 'connecting' && 'Connecting...'}
        {state.status === 'qr' && 'Scan QR...'}
        {state.status === 'disconnected' && 'Disconnected'}
        {state.status === 'error' && `Error: ${state.message}`}
      </span>

      {state.status === 'disconnected' || state.status === 'error' ? (
        <button
          onClick={onConnect}
          disabled={loading}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      ) : state.status === 'connected' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onDisconnect}
            style={{
              background: 'none',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Disconnect
          </button>
          <button
            onClick={onLogout}
            style={{
              background: 'none',
              color: '#e74c3c',
              border: '1px solid rgba(231, 76, 60, 0.3)',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
