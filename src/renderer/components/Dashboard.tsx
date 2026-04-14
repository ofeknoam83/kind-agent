import React, { useState, useEffect, useRef } from 'react';
import type { Chat, SummaryResult, ActionItem } from '../../shared/types';
import type { ConnectionState } from '../../shared/types';
import { useApi } from '../hooks/use-api';

interface Props {
  chats: Chat[];
  connectionState: ConnectionState;
  onNavigateToChat: (chatId: string) => void;
  revision?: number;
}

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  School: '#3498db',
  Kindergarten: '#e91e63',
  Work: '#25d366',
  Family: '#9b59b6',
  Friends: '#f39c12',
  Other: '#666',
};

export function Dashboard({ chats, connectionState, onNavigateToChat, revision = 0 }: Props) {
  const api = useApi();
  const [recentSummaries, setRecentSummaries] = useState<SummaryResult[]>([]);
  const [summarizingChat, setSummarizingChat] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalMessages = chats.reduce((sum, c) => sum + c.messageCount, 0);
  const isConnected = connectionState.status === 'connected';

  // Helper: find chat by id
  const chatById = (id: string): Chat | undefined => chats.find((c) => c.id === id);
  const chatName = (id: string): string => chatById(id)?.name || 'Chat';

  // Load recent summaries from last 24h
  const loadRecentSummaries = async () => {
    try {
      const since24h = Math.floor(Date.now() / 1000) - 86400;
      const summaries = await api.summarize.recent(since24h, 50);
      setRecentSummaries(summaries);
    } catch {
      // Silently handle - may not have summaries yet
    }
  };

  // Initial load + refresh on revision changes
  useEffect(() => {
    loadRecentSummaries();
  }, [revision, chats.length]);

  // Listen for auto-summarize complete events
  useEffect(() => {
    const unsub = api.summarize.onAutoSummarizeComplete(() => {
      loadRecentSummaries();
    });
    return unsub;
  }, [api]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      loadRecentSummaries();
    }, 30_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // ── Derived data ──────────────────────────────────────────

  // All action items with their associated chat info
  const allActionItemsWithChat: { item: ActionItem; chatId: string }[] = recentSummaries.flatMap(
    (s) => s.actionItems.map((item) => ({ item, chatId: s.chatId }))
  );

  // Critical alerts: high-priority action items
  const criticalAlerts = allActionItemsWithChat.filter((a) => a.item.priority === 'high');

  // What people need from me: all expectedFromMe items
  const expectedFromMe: { text: string; chatId: string; chatNameStr: string }[] =
    recentSummaries.flatMap((s) =>
      s.expectedFromMe.map((text) => ({
        text,
        chatId: s.chatId,
        chatNameStr: chatName(s.chatId),
      }))
    );

  // School & Kindergarten summaries
  const schoolKindergartenSummaries = recentSummaries.filter((s) => {
    const chat = chatById(s.chatId);
    return chat?.category === 'School' || chat?.category === 'Kindergarten';
  });

  // This week: all action items sorted by priority
  const sortedActionItems = [...allActionItemsWithChat].sort((a, b) => {
    const prio = { high: 0, medium: 1, low: 2 };
    const ap = a.item.priority ? prio[a.item.priority] : 3;
    const bp = b.item.priority ? prio[b.item.priority] : 3;
    return ap - bp;
  });

  const quickSummarize = async (chatId: string, hours: number) => {
    setSummarizingChat(chatId);
    const afterTimestamp = Math.floor(Date.now() / 1000) - hours * 3600;
    try {
      await api.summarize.run(chatId, afterTimestamp);
      await loadRecentSummaries();
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

  // ── Section renderers ─────────────────────────────────────

  const renderPriorityBadge = (priority: string | null) => {
    if (!priority) return null;
    const colors: Record<string, { bg: string; fg: string }> = {
      high: { bg: 'rgba(231, 76, 60, 0.15)', fg: '#e74c3c' },
      medium: { bg: 'rgba(243, 156, 18, 0.15)', fg: '#f39c12' },
      low: { bg: 'rgba(52, 152, 219, 0.15)', fg: '#3498db' },
    };
    const c = colors[priority] || colors.low;
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: '1px 6px',
          borderRadius: 4,
          marginRight: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          background: c.bg,
          color: c.fg,
        }}
      >
        {priority}
      </span>
    );
  };

  const renderActionItem = (
    item: ActionItem,
    chatId: string,
    idx: number,
    showChat = true
  ) => (
    <div
      key={idx}
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
      <div style={{ userSelect: 'text', lineHeight: 1.5 }}>
        {showChat && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--accent)',
              fontWeight: 500,
              cursor: 'pointer',
              marginRight: 6,
            }}
            onClick={() => onNavigateToChat(chatId)}
          >
            [{chatName(chatId)}]
          </span>
        )}
        {item.assignee && item.assignee !== 'null' && (
          <span style={{ color: '#9b59b6', fontWeight: 500 }}>
            @{item.assignee}{' '}
          </span>
        )}
        {renderPriorityBadge(item.priority)}
        <span style={{ color: 'var(--text-primary)' }}>{item.description}</span>
        {item.deadline && item.deadline !== 'null' && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            {' '}
            &rarr; by {item.deadline}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
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

      {/* ── a) Critical Alerts ────────────────────────────────── */}
      {criticalAlerts.length > 0 && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(231, 76, 60, 0.4)',
            borderLeft: '4px solid #e74c3c',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#e74c3c',
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Critical Alerts
          </h3>
          {criticalAlerts.map((a, i) =>
            renderActionItem(a.item, a.chatId, i, true)
          )}
        </div>
      )}

      {/* ── b) What People Need From Me ───────────────────────── */}
      {expectedFromMe.length > 0 && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(243, 156, 18, 0.3)',
            borderLeft: '4px solid #f39c12',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#f39c12',
              marginBottom: 12,
            }}
          >
            What People Need From Me
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {expectedFromMe.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: '#f39c12', flexShrink: 0 }}>{'\u25B8'}</span>
                <div style={{ userSelect: 'text' }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--accent)',
                      fontWeight: 500,
                      cursor: 'pointer',
                      marginRight: 6,
                    }}
                    onClick={() => onNavigateToChat(item.chatId)}
                  >
                    [{item.chatNameStr}]
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{item.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── c) School & Kindergarten ──────────────────────────── */}
      {schoolKindergartenSummaries.length > 0 && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(37, 211, 102, 0.3)',
            borderLeft: '4px solid #25d366',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#25d366',
              marginBottom: 12,
            }}
          >
            School & Kindergarten
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {schoolKindergartenSummaries.map((s, i) => {
              const chat = chatById(s.chatId);
              const catColor = chat?.category
                ? CATEGORY_COLORS[chat.category] || '#666'
                : '#666';
              return (
                <div key={i}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--accent)',
                        cursor: 'pointer',
                      }}
                      onClick={() => onNavigateToChat(s.chatId)}
                    >
                      {chatName(s.chatId)}
                    </span>
                    {chat?.category && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 8px',
                          borderRadius: 8,
                          background: `${catColor}22`,
                          color: catColor,
                          fontWeight: 600,
                        }}
                      >
                        {chat.category}
                      </span>
                    )}
                  </div>
                  {/* TL;DR */}
                  {s.tldr && (
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: 'var(--text-primary)',
                        marginBottom: 8,
                        userSelect: 'text',
                      }}
                    >
                      {s.tldr}
                    </div>
                  )}
                  {/* Action items for this summary */}
                  {s.actionItems.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {s.actionItems.map((item, j) =>
                        renderActionItem(item, s.chatId, j, false)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── d) This Week ──────────────────────────────────────── */}
      {sortedActionItems.length > 0 && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 12,
            }}
          >
            This Week
          </h3>
          {sortedActionItems.slice(0, 15).map((a, i) =>
            renderActionItem(a.item, a.chatId, i, true)
          )}
          {sortedActionItems.length > 15 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              +{sortedActionItems.length - 15} more action items
            </div>
          )}
        </div>
      )}

      {/* ── e) Quick Summarize ────────────────────────────────── */}
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
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              textAlign: 'center',
              padding: 20,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                border: '2px solid var(--border)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                margin: '0 auto 12px',
                animation: 'spin 1s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            Syncing chats from WhatsApp...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...chats]
              .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp)
              .slice(0, 6)
              .map((chat) => (
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
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {chat.name}
                      {chat.category && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 8px',
                            borderRadius: 8,
                            background: `${CATEGORY_COLORS[chat.category] || '#666'}22`,
                            color: CATEGORY_COLORS[chat.category] || '#666',
                            fontWeight: 600,
                          }}
                        >
                          {chat.category}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        marginTop: 2,
                      }}
                    >
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
                          cursor:
                            summarizingChat === chat.id ? 'not-allowed' : 'pointer',
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
