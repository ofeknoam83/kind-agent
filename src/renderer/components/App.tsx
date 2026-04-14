import React, { useState } from 'react';
import { ConnectionPanel } from './ConnectionPanel';
import { ChatList } from './ChatList';
import { ChatView } from './ChatView';
import { SettingsPanel } from './SettingsPanel';
import { Dashboard } from './Dashboard';
import { useConnection } from '../hooks/use-connection';
import { useChats } from '../hooks/use-chats';

type View = 'overview' | 'chats' | 'settings';

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '\u25c9' },
  { id: 'chats', label: 'Chats', icon: '\u2756' },
  { id: 'settings', label: 'Settings', icon: '\u2699' },
];

export function App() {
  const connection = useConnection();
  const chatState = useChats();
  const [view, setView] = useState<View>('overview');

  const navigateToChat = (chatId: string) => {
    chatState.selectChat(chatId);
    setView('chats');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* macOS drag region */}
      <div className="titlebar-drag" />

      <div style={{ display: 'flex', flex: 1, marginTop: 32, overflow: 'hidden' }}>
        {/* Sidebar navigation */}
        <nav
          style={{
            width: 64,
            background: '#111111',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 12,
            gap: 4,
            flexShrink: 0,
          }}
        >
          {/* App icon / brand */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 700,
              color: '#fff',
              marginBottom: 20,
            }}
          >
            W
          </div>

          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              title={item.label}
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                border: 'none',
                background: view === item.id ? 'rgba(37, 211, 102, 0.12)' : 'transparent',
                color: view === item.id ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                transition: 'all 0.15s ease',
                fontSize: 16,
              }}
            >
              <span>{item.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 500 }}>{item.label}</span>
            </button>
          ))}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Connection status dot at the bottom */}
          <div
            style={{
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background:
                  connection.state.status === 'connected'
                    ? '#25d366'
                    : connection.state.status === 'connecting' ||
                        connection.state.status === 'qr'
                      ? '#f39c12'
                      : '#666',
              }}
            />
            <span style={{ fontSize: 8, color: 'var(--text-secondary)' }}>
              {connection.state.status === 'connected' ? 'Live' : 'Off'}
            </span>
          </div>
        </nav>

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Compact header */}
          <header
            style={{
              minHeight: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              flexShrink: 0,
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              {NAV_ITEMS.find((n) => n.id === view)?.label}
            </h2>
            <ConnectionPanel
              state={connection.state}
              onConnect={connection.connect}
              onDisconnect={connection.disconnect}
              loading={connection.loading}
            />
          </header>

          {/* Page content */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {view === 'overview' && (
              <Dashboard
                chats={chatState.chats}
                connectionState={connection.state}
                onNavigateToChat={navigateToChat}
              />
            )}
            {view === 'chats' && (
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
            {view === 'settings' && <SettingsPanel />}
          </div>
        </div>
      </div>

      {/* QR Code overlay - pulled out of ConnectionPanel for cleaner separation */}
      {connection.state.status === 'qr' && (
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
              src={connection.state.qrData}
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
