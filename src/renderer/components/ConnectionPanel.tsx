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
          flexShrink: 0,
        }}
      />

      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        {state.status === 'connected' && `Connected (${state.phoneNumber})`}
        {state.status === 'connecting' && 'Connecting...'}
        {state.status === 'qr' && 'Scan QR code with WhatsApp'}
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

      {/* QR Code overlay */}
      {state.status === 'qr' && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <img
              src={state.qrData}
              alt="WhatsApp QR Code"
              style={{ width: 280, height: 280 }}
            />
            <div style={{ marginTop: 16, color: '#333', fontSize: 14, fontWeight: 500 }}>
              Open WhatsApp &gt; Linked Devices &gt; Link a Device
            </div>
            <div style={{ marginTop: 8, color: '#666', fontSize: 12 }}>
              Scan this QR code with your phone
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
