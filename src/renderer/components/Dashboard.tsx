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

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  high: { bg: 'rgba(231, 76, 60, 0.15)', fg: '#e74c3c' },
  medium: { bg: 'rgba(243, 156, 18, 0.15)', fg: '#f39c12' },
  low: { bg: 'rgba(52, 152, 219, 0.15)', fg: '#3498db' },
};

// ── Types ─────────────────────────────────────────────────
type ActionWithContext = { item: ActionItem; chatId: string; tldr: string };

// ── Deduplication ─────────────────────────────────────────
function dedup(items: ActionWithContext[]): ActionWithContext[] {
  const seen = new Set<string>();
  return items.filter((a) => {
    const normalized = a.item.description
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80);
    const key = `${a.chatId}::${normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Expandable Action Item Card ───────────────────────────
function ActionItemCard({
  item,
  chatId,
  chatNameStr,
  tldr,
  onNavigateToChat,
}: {
  item: ActionItem;
  chatId: string;
  chatNameStr: string;
  tldr: string;
  onNavigateToChat: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const c = item.priority ? PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.low : null;

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          fontSize: 12,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
          onClick={() => onNavigateToChat(chatId)}
        >
          [{chatNameStr}]
        </span>
        {item.assignee && item.assignee !== 'null' && item.assignee !== 'None' && (
          <span style={{ color: '#9b59b6', fontWeight: 500 }}>@{item.assignee}</span>
        )}
        {c && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              background: c.bg,
              color: c.fg,
            }}
          >
            {item.priority}
          </span>
        )}
        {item.deadline && item.deadline !== 'null' && item.deadline !== 'None' && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            by {item.deadline}
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 14,
            userSelect: 'none',
            lineHeight: 1,
          }}
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '\u25B4' : '\u25BE'}
        </span>
      </div>

      {/* Description — always visible */}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text-primary)',
          userSelect: 'text',
        }}
      >
        {item.description}
      </div>

      {/* Context block — expanded by default */}
      {expanded && tldr && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.03)',
            padding: '8px 12px',
            borderRadius: 6,
            borderLeft: '2px solid var(--border)',
            userSelect: 'text',
          }}
        >
          {tldr}
        </div>
      )}
    </div>
  );
}

// ── Section Header with Clear All ─────────────────────────
function SectionHeader({
  title,
  color,
  count,
  onClear,
}: {
  title: string;
  color: string;
  count: number;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 700,
          color,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {title}
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            textTransform: 'none',
            letterSpacing: 0,
          }}
        >
          ({count})
        </span>
      </h3>
      <button
        onClick={onClear}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '3px 10px',
          fontSize: 11,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        Clear All
      </button>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────
export function Dashboard({ chats, connectionState, onNavigateToChat, revision = 0 }: Props) {
  const api = useApi();
  const [recentSummaries, setRecentSummaries] = useState<SummaryResult[]>([]);
  const [summarizingChat, setSummarizingChat] = useState<string | null>(null);
  const [clearedAt, setClearedAt] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalMessages = chats.reduce((sum, c) => sum + c.messageCount, 0);
  const isConnected = connectionState.status === 'connected';

  const chatNameById = (id: string): string => chats.find((c) => c.id === id)?.name || 'Chat';
  const chatById = (id: string): Chat | undefined => chats.find((c) => c.id === id);

  // ── Data loading ────────────────────────────────────────
  const loadRecentSummaries = async () => {
    try {
      const since24h = Math.floor(Date.now() / 1000) - 86400;
      const summaries = await api.summarize.recent(since24h, 50);
      setRecentSummaries(summaries);
    } catch {
      // Silently handle
    }
  };

  useEffect(() => {
    loadRecentSummaries();
  }, [revision, chats.length]);

  useEffect(() => {
    const unsub = api.summarize.onAutoSummarizeComplete(() => loadRecentSummaries());
    return unsub;
  }, [api]);

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => loadRecentSummaries(), 30_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // ── Derived data (filtered + deduplicated) ──────────────
  const activeSummaries = recentSummaries.filter((s) => s.createdAt > clearedAt);

  // Only high & medium confidence items
  const allItems: ActionWithContext[] = activeSummaries.flatMap((s) =>
    s.actionItems
      .filter((item) => item.priority === 'high' || item.priority === 'medium')
      .map((item) => ({ item, chatId: s.chatId, tldr: s.tldr || s.summary }))
  );

  const criticalAlerts = dedup(allItems.filter((a) => a.item.priority === 'high'));
  const actionItems = dedup(allItems.filter((a) => a.item.priority === 'medium'));

  const schoolKindergartenSummaries = activeSummaries.filter((s) => {
    const chat = chatById(s.chatId);
    return chat?.category === 'School' || chat?.category === 'Kindergarten';
  });

  // ── Helpers ──────────────────────────────────────────────
  const relativeTime = (ts: number): string => {
    if (!ts) return '';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(ts * 1000).toLocaleDateString();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

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

  const handleClearAll = () => setClearedAt(Math.floor(Date.now() / 1000));

  // ── Render ──────────────────────────────────────────────
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

      {/* ── Critical Alerts (high priority only) ─────────── */}
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
          <SectionHeader
            title="Critical Alerts"
            color="#e74c3c"
            count={criticalAlerts.length}
            onClear={handleClearAll}
          />
          {criticalAlerts.map((a, i) => (
            <ActionItemCard
              key={`critical-${i}`}
              item={a.item}
              chatId={a.chatId}
              chatNameStr={chatNameById(a.chatId)}
              tldr={a.tldr}
              onNavigateToChat={onNavigateToChat}
            />
          ))}
        </div>
      )}

      {/* ── Action Items (medium priority) ────────────────── */}
      {actionItems.length > 0 && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <SectionHeader
            title="Action Items"
            color="var(--text-primary)"
            count={actionItems.length}
            onClear={handleClearAll}
          />
          {actionItems.map((a, i) => (
            <ActionItemCard
              key={`action-${i}`}
              item={a.item}
              chatId={a.chatId}
              chatNameStr={chatNameById(a.chatId)}
              tldr={a.tldr}
              onNavigateToChat={onNavigateToChat}
            />
          ))}
        </div>
      )}

      {/* ── School & Kindergarten ─────────────────────────── */}
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
                      {chatNameById(s.chatId)}
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
                  {s.actionItems.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {s.actionItems
                        .filter((item) => item.priority === 'high' || item.priority === 'medium')
                        .map((item, j) => (
                          <ActionItemCard
                            key={j}
                            item={item}
                            chatId={s.chatId}
                            chatNameStr={chatNameById(s.chatId)}
                            tldr=""
                            onNavigateToChat={onNavigateToChat}
                          />
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quick Summarize ───────────────────────────────── */}
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
              .filter((c) => c.messageCount > 0)
              .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp)
              .slice(0, 10)
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
                      {chat.lastMessageTimestamp > 0 && (
                        <> &middot; {relativeTime(chat.lastMessageTimestamp)}</>
                      )}
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
