import React from 'react';
import type { ConnectionState } from '../../shared/types';

interface Props {
  state: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  loading: boolean;
}

const STATUS_COLORS: Record<ConnectionState['status'], string> = {
  disconnected: '#666',
  connecting: '#f39c12',
  qr: '#3498db',
  connected: '#25d366',
  error: '#e74c3c',
};

export function ConnectionPanel({ state, onConnect, onDisconnect, loading }: Props) {
  const color = STATUS_COLORS[state.status];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Status indicator */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: color,
        }}
      />

      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        {state.status === 'connected' && `Connected (${state.phoneNumber})`}
        {state.status === 'connecting' && 'Connecting...'}
        {state.status === 'qr' && 'Scan QR code in WhatsApp'}
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
            borderRadius: 'var(--radius)',
            padding: '4px 12px',
            fontSize: 12,
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
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            padding: '4px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Disconnect
        </button>
      ) : null}
    </div>
  );
}
