import React from 'react';
import type { Chat } from '../../shared/types';

interface Props {
  chats: Chat[];
  selectedId: string | null;
  onSelect: (chatId: string) => void;
}

export function ChatList({ chats, selectedId, onSelect }: Props) {
  return (
    <aside
      style={{
        width: 280,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Chats ({chats.length})</h3>
      </div>

      {chats.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
          <div style={{
            width: 24, height: 24, border: '2px solid var(--border)',
            borderTopColor: 'var(--accent)', borderRadius: '50%',
            margin: '20px auto 12px', animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          Syncing chats from WhatsApp...
          <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text-secondary)' }}>
            This may take a moment on first connect
          </div>
        </div>
      ) : (
        [...chats]
          .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp)
          .map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelect(chat.id)}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 16px',
              textAlign: 'left',
              background: chat.id === selectedId ? 'var(--bg-tertiary)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{chat.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {chat.messageCount} messages
              {chat.isGroup ? ' · Group' : ''}
            </div>
          </button>
        ))
      )}
    </aside>
  );
}
