import React, { useState } from 'react';
import { ConnectionPanel } from './ConnectionPanel';
import { ChatList } from './ChatList';
import { ChatView } from './ChatView';
import { SettingsPanel } from './SettingsPanel';
import { useConnection } from '../hooks/use-connection';
import { useChats } from '../hooks/use-chats';

type View = 'main' | 'settings';

export function App() {
  const connection = useConnection();
  const chatState = useChats();
  const [view, setView] = useState<View>('main');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* macOS drag region */}
      <div className="titlebar-drag" />

      {/* Top bar */}
      <header
        style={{
          height: 48,
          paddingTop: 32, // Below macOS titlebar
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '32px 16px 0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <ConnectionPanel
          state={connection.state}
          onConnect={connection.connect}
          onDisconnect={connection.disconnect}
          loading={connection.loading}
        />
        <button
          onClick={() => setView(view === 'main' ? 'settings' : 'main')}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius)',
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        >
          {view === 'main' ? 'Settings' : 'Back'}
        </button>
      </header>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {view === 'settings' ? (
          <SettingsPanel />
        ) : (
          <>
            <ChatList
              chats={chatState.chats}
              selectedId={chatState.selectedChatId}
              onSelect={chatState.selectChat}
            />
            <ChatView
              chatId={chatState.selectedChatId}
              messages={chatState.messages}
              loading={chatState.loadingMessages}
            />
          </>
        )}
      </div>
    </div>
  );
}
