import React from 'react';
import type { ChatMessage } from '../../shared/types';
import { SummaryPanel } from './SummaryPanel';

interface Props {
  chatId: string | null;
  messages: ChatMessage[];
  loading: boolean;
}

export function ChatView({ chatId, messages, loading }: Props) {
  if (!chatId) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        Select a chat to view messages and generate summaries.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Summary panel at the top */}
      <SummaryPanel chatId={chatId} />

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', paddingTop: 40 }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', paddingTop: 40 }}>
            No messages stored for this chat yet.
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                {msg.senderName}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {new Date(msg.timestamp * 1000).toLocaleTimeString()}
              </span>
              <div style={{ fontSize: 13, marginTop: 2, userSelect: 'text' }}>{msg.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
