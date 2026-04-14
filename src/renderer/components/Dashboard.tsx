import React, { useState, useEffect } from 'react';
import type { Chat, SummaryResult } from '../../shared/types';
import type { ConnectionState } from '../../shared/types';
import { useApi } from '../hooks/use-api';

interface Props {
  chats: Chat[];
  connectionState: ConnectionState;
  onNavigateToChat: (chatId: string) => void;
}

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
] as const;

export function Dashboard({ chats, connectionState, onNavigateToChat }: Props) {
  const api = useApi();
  const [latestSummary, setLatestSummary] = useState<SummaryResult | null>(null);
  const [summarizingChat, setSummarizingChat] = useState<string | null>(null);

  const totalMessages = chats.reduce((sum, c) => sum + c.messageCount, 0);
  const recentChats = chats.filter(
    (c) => c.lastMessageTimestamp > Date.now() / 1000 - 86400
  );
  const isConnected = connectionState.status === 'connected';

  // Load summaries from the last 2 hours across all chats
  const [recentSummaries, setRecentSummaries] = useState<SummaryResult[]>([]);
  const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600;

  useEffect(() => {
    (async () => {
      const found: SummaryResult[] = [];
      for (const chat of chats.slice(0, 20)) {
        const summaries = await api.summarize.list(chat.id, 3);
        for (const s of summaries) {
          if (s.createdAt > twoHoursAgo) {
            found.push(s);
          }
        }
      }
      found.sort((a, b) => b.createdAt - a.createdAt);
      setRecentSummaries(found);
      if (found.length > 0 && (!latestSummary || found[0].createdAt > latestSummary.createdAt)) {
        setLatestSummary(found[0]);
      }
    })();
  }, [api, chats.length]);

  // Aggregate action items from all recent summaries
  const allActionItems = recentSummaries.flatMap((s) => s.actionItems);
  const allUnresolved = recentSummaries.flatMap((s) => s.unresolvedQuestions);

  const quickSummarize = async (chatId: string, hours: number) => {
    setSummarizingChat(chatId);
    const afterTimestamp = Math.floor(Date.now() / 1000) - hours * 3600;
    try {
      await api.summarize.run(chatId, afterTimestamp);
      // Reload summary
      const summaries = await api.summarize.list(chatId, 1);
      if (summaries.length > 0) {
        setLatestSummary(summaries[0]);
      }
    } finally {
      setSummarizingChat(null);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 8,
            color: 'var(--text-primary)',
          }}
        >
          {getGreeting()}
        </h1>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isConnected ? '#25d366' : '#666',
            }}
          />
          <span>
            {isConnected ? 'Connected' : 'Disconnected'}
            {' \u00b7 '}
            {chats.length} chats
            {' \u00b7 '}
            {totalMessages.toLocaleString()} messages synced
          </span>
        </div>
      </div>

      {/* Status line */}
      {recentChats.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(37, 211, 102, 0.08)',
            border: '1px solid rgba(37, 211, 102, 0.2)',
            borderRadius: 10,
            marginBottom: 24,
            fontSize: 13,
            color: 'var(--accent)',
          }}
        >
          {recentChats.length} chat{recentChats.length !== 1 ? 's' : ''} active in the last 24h
          {recentSummaries.length > 0 && (
            <span>
              {' \u00b7 '}
              {recentSummaries.length} summar{recentSummaries.length !== 1 ? 'ies' : 'y'} in the last 2h
            </span>
          )}
          {allActionItems.length > 0 && (
            <span>
              {' \u00b7 '}
              {allActionItems.length} action{allActionItems.length !== 1 ? 's' : ''} surfaced
            </span>
          )}
        </div>
      )}

      {/* Cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 20,
          marginBottom: 32,
        }}
      >
        {/* What Matters card */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            minHeight: 180,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'rgba(37, 211, 102, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
              }}
            >
              {'\u2728'}
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>What Matters</h3>
          </div>

          {recentSummaries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentSummaries.slice(0, 3).map((s, i) => (
                <div key={i}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--accent)',
                      marginBottom: 4,
                      cursor: 'pointer',
                    }}
                    onClick={() => onNavigateToChat(s.chatId)}
                  >
                    {chats.find((c) => c.id === s.chatId)?.name || 'Chat'}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: 'var(--text-primary)',
                      userSelect: 'text',
                    }}
                  >
                    {s.summary.length > 200 ? s.summary.slice(0, 200) + '...' : s.summary}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {new Date(s.createdAt * 1000).toLocaleTimeString()}
                    {' \u00b7 '}{s.messageCount} msgs \u00b7 {s.provider}/{s.model}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              No summaries in the last 2 hours. Summarize a chat to see highlights here.
            </div>
          )}
        </div>

        {/* Action Items card */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            minHeight: 180,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'rgba(243, 156, 18, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
              }}
            >
              {'\u26a1'}
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Action Items</h3>
          </div>

          {allActionItems.length > 0 ? (
            <div>
              {allActionItems.slice(0, 6).map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 10,
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: '1.5px solid var(--border)',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  />
                  <div style={{ userSelect: 'text' }}>
                    {item.assignee && (
                      <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                        {item.assignee}:{' '}
                      </span>
                    )}
                    <span style={{ color: 'var(--text-primary)' }}>{item.description}</span>
                    {item.deadline && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {' '}
                        (by {item.deadline})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              No action items in the last 2 hours. Summarize a chat to extract tasks.
            </div>
          )}
        </div>
      </div>

      {/* Quick Summarize section */}
      <div style={{ marginBottom: 32 }}>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 16,
            color: 'var(--text-primary)',
          }}
        >
          Quick Summarize
        </h3>

        {chats.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Connect to WhatsApp and sync some chats first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chats.slice(0, 6).map((chat) => (
              <div
                key={chat.id}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{ cursor: 'pointer', flex: 1 }}
                  onClick={() => onNavigateToChat(chat.id)}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{chat.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {chat.messageCount} messages
                    {chat.isGroup ? ' \u00b7 Group' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {TIME_RANGES.map((range) => (
                    <button
                      key={range.label}
                      onClick={() => quickSummarize(chat.id, range.hours)}
                      disabled={summarizingChat === chat.id}
                      style={{
                        background:
                          summarizingChat === chat.id
                            ? 'var(--bg-tertiary)'
                            : 'rgba(37, 211, 102, 0.1)',
                        color:
                          summarizingChat === chat.id
                            ? 'var(--text-secondary)'
                            : 'var(--accent)',
                        border: '1px solid rgba(37, 211, 102, 0.2)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: summarizingChat === chat.id ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
