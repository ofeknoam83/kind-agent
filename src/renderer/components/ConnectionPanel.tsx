import React from 'react';
import type { ConnectionState } from '../../shared/types';

interface Props {
  state: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  loading: boolean;
}

export function ConnectionPanel({ state, onConnect, onDisconnect, loading }: Props) {
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
      ) : null}
    </div>
  );
}
