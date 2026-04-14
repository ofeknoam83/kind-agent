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

// ── Category config ───────────────────────────────────────
interface CategoryConfig {
  label: string;
  color: string;
  icon: string;
  keys: string[]; // which ChatCategory values map here
}

const CATEGORIES: CategoryConfig[] = [
  { label: 'Work', color: '#25d366', icon: '\u{1F4BC}', keys: ['Work'] },
  { label: 'School & Kids', color: '#3498db', icon: '\u{1F3EB}', keys: ['School', 'Kindergarten'] },
  { label: 'Family', color: '#9b59b6', icon: '\u{1F3E0}', keys: ['Family'] },
  { label: 'Friends', color: '#f39c12', icon: '\u{1F91D}', keys: ['Friends'] },
  { label: 'Other', color: '#666', icon: '\u{1F4AC}', keys: ['Other'] },
];

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  high: { bg: 'rgba(231, 76, 60, 0.15)', fg: '#e74c3c' },
  medium: { bg: 'rgba(243, 156, 18, 0.15)', fg: '#f39c12' },
  low: { bg: 'rgba(52, 152, 219, 0.15)', fg: '#3498db' },
};

const QUICK_SUMMARIZE_CATEGORY_COLORS: Record<string, string> = {
  School: '#3498db',
  Kindergarten: '#e91e63',
  Work: '#25d366',
  Family: '#9b59b6',
  Friends: '#f39c12',
  Other: '#666',
};

// ── Helpers ───────────────────────────────────────────────
type ActionWithContext = { item: ActionItem; chatId: string; chatName: string };

function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

// ── Category Card ─────────────────────────────────────────
function CategoryCard({
  config,
  summaries,
  chatNameById,
  onNavigateToChat,
}: {
  config: CategoryConfig;
  summaries: SummaryResult[];
  chatNameById: (id: string) => string;
  onNavigateToChat: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  // Build narrative from TL;DRs
  const narrativeParts = summaries
    .filter((s) => s.tldr)
    .map((s) => ({ chatName: chatNameById(s.chatId), tldr: s.tldr, chatId: s.chatId }));

  // Collect top action items (high first, then medium, max 3)
  const allActions: ActionWithContext[] = summaries.flatMap((s) =>
    (Array.isArray(s.actionItems) ? s.actionItems : [])
      .filter((item) => item.priority === 'high' || item.priority === 'medium')
      .map((item) => ({ item, chatId: s.chatId, chatName: chatNameById(s.chatId) }))
  );
  allActions.sort((a, b) => {
    const prio = { high: 0, medium: 1 };
    return (prio[a.item.priority as 'high' | 'medium'] ?? 2) - (prio[b.item.priority as 'high' | 'medium'] ?? 2);
  });
  const topActions = allActions.slice(0, 3);

  // Source chats
  const sourceChats = [...new Set(summaries.map((s) => s.chatId))];

  if (narrativeParts.length === 0 && topActions.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: `1px solid ${config.color}33`,
        borderLeft: `4px solid ${config.color}`,
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: expanded ? 12 : 0,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: config.color,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>{config.icon}</span>
          {config.label}
          {topActions.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
            >
              {topActions.length} action{topActions.length !== 1 ? 's' : ''}
            </span>
          )}
        </h3>
        <span
          style={{
            color: 'var(--text-secondary)',
            fontSize: 14,
            userSelect: 'none',
          }}
        >
          {expanded ? '\u25B4' : '\u25BE'}
        </span>
      </div>

      {expanded && (
        <>
          {/* Narrative: what's happening */}
          {narrativeParts.length > 0 && (
            <div style={{ marginBottom: topActions.length > 0 ? 12 : 0 }}>
              {narrativeParts.map((part, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                    marginBottom: i < narrativeParts.length - 1 ? 8 : 0,
                    userSelect: 'text',
                  }}
                >
                  <span
                    style={{
                      color: config.color,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                    onClick={() => onNavigateToChat(part.chatId)}
                  >
                    {part.chatName}:
                  </span>{' '}
                  {part.tldr}
                </div>
              ))}
            </div>
          )}

          {/* Top action items */}
          {topActions.length > 0 && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 10,
                marginTop: 4,
              }}
            >
              {topActions.map((a, i) => {
                const c = a.item.priority
                  ? PRIORITY_COLORS[a.item.priority] || PRIORITY_COLORS.low
                  : null;
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      marginBottom: 8,
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: config.color, flexShrink: 0, marginTop: 2 }}>
                      {'\u25B8'}
                    </span>
                    <div style={{ userSelect: 'text', flex: 1 }}>
                      {c && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 4,
                            marginRight: 6,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            background: c.bg,
                            color: c.fg,
                          }}
                        >
                          {a.item.priority}
                        </span>
                      )}
                      {a.item.assignee &&
                        a.item.assignee !== 'null' &&
                        a.item.assignee !== 'None' && (
                          <span style={{ color: '#9b59b6', fontWeight: 500 }}>
                            @{a.item.assignee}{' '}
                          </span>
                        )}
                      <span style={{ color: 'var(--text-primary)' }}>
                        {a.item.description}
                      </span>
                      {a.item.deadline &&
                        a.item.deadline !== 'null' &&
                        a.item.deadline !== 'None' && (
                          <span
                            style={{
                              color: 'var(--text-secondary)',
                              fontSize: 11,
                            }}
                          >
                            {' '}
                            &rarr; by {a.item.deadline}
                          </span>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Source chats */}
          {sourceChats.length > 1 && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                marginTop: 8,
              }}
            >
              from:{' '}
              {sourceChats.map((id, i) => (
                <span key={id}>
                  {i > 0 && ', '}
                  <span
                    style={{ cursor: 'pointer', color: config.color }}
                    onClick={() => onNavigateToChat(id)}
                  >
                    {chatNameById(id)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────
export function Dashboard({
  chats,
  connectionState,
  onNavigateToChat,
  revision = 0,
}: Props) {
  const api = useApi();
  const [recentSummaries, setRecentSummaries] = useState<SummaryResult[]>([]);
  const [summarizingChat, setSummarizingChat] = useState<string | null>(null);
  const [clearedAt, setClearedAt] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalMessages = chats.reduce((sum, c) => sum + c.messageCount, 0);
  const isConnected = connectionState.status === 'connected';

  const chatNameById = (id: string): string =>
    chats.find((c) => c.id === id)?.name || 'Chat';
  const chatById = (id: string): Chat | undefined =>
    chats.find((c) => c.id === id);

  // ── Data loading ────────────────────────────────────────
  const loadRecentSummaries = async () => {
    try {
      const since24h = Math.floor(Date.now() / 1000) - 86400;
      const summaries = await api.summarize.recent(since24h, 50);
      setRecentSummaries(Array.isArray(summaries) ? summaries : []);
    } catch {
      // Silently handle
    }
  };

  useEffect(() => {
    loadRecentSummaries();
  }, [revision, chats.length]);

  useEffect(() => {
    const unsub = api.summarize.onAutoSummarizeComplete(() =>
      loadRecentSummaries()
    );
    return unsub;
  }, [api]);

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => loadRecentSummaries(), 30_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // ── Derived data ────────────────────────────────────────

  // Filter by cleared timestamp
  const activeSummaries = recentSummaries.filter(
    (s) => s.createdAt > clearedAt
  );

  // Latest summary per chat (eliminates duplicates from multiple runs)
  const latestPerChat = new Map<string, SummaryResult>();
  for (const s of activeSummaries) {
    const existing = latestPerChat.get(s.chatId);
    if (!existing || s.createdAt > existing.createdAt) {
      latestPerChat.set(s.chatId, s);
    }
  }
  const dedupedSummaries = [...latestPerChat.values()];

  // Group summaries by category
  const summariesByCategory = new Map<string, SummaryResult[]>();
  for (const s of dedupedSummaries) {
    const chat = chatById(s.chatId);
    const cat = chat?.category || 'Uncategorized';
    const existing = summariesByCategory.get(cat) ?? [];
    existing.push(s);
    summariesByCategory.set(cat, existing);
  }

  // Build category card data — merge category keys
  const categoryCards = CATEGORIES.map((config) => {
    const summaries: SummaryResult[] = [];
    for (const key of config.keys) {
      summaries.push(...(summariesByCategory.get(key) ?? []));
    }
    return { config, summaries };
  }).filter((c) => c.summaries.length > 0);

  // Uncategorized goes at the end
  const uncategorizedSummaries = summariesByCategory.get('Uncategorized') ?? [];
  if (uncategorizedSummaries.length > 0) {
    categoryCards.push({
      config: {
        label: 'Uncategorized',
        color: '#888',
        icon: '\u{1F4AC}',
        keys: ['Uncategorized'],
      },
      summaries: uncategorizedSummaries,
    });
  }

  const hasSummaries = categoryCards.length > 0;

  // ── Actions ──────────────────────────────────────────────
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

  // ── Render ──────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
      {/* Greeting + Clear All */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            {getGreeting()}
          </h1>
          {hasSummaries && (
            <button
              onClick={() => setClearedAt(Math.floor(Date.now() / 1000))}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 12,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Clear All
            </button>
          )}
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
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

      {/* ── Category Cards ────────────────────────────────── */}
      {categoryCards.map(({ config, summaries }) => (
        <CategoryCard
          key={config.label}
          config={config}
          summaries={summaries}
          chatNameById={chatNameById}
          onNavigateToChat={onNavigateToChat}
        />
      ))}

      {/* ── Quick Summarize ───────────────────────────────── */}
      <div style={{ marginBottom: 32, marginTop: hasSummaries ? 8 : 0 }}>
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
                            background: `${QUICK_SUMMARIZE_CATEGORY_COLORS[chat.category] || '#666'}22`,
                            color:
                              QUICK_SUMMARIZE_CATEGORY_COLORS[chat.category] ||
                              '#666',
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
                            summarizingChat === chat.id
                              ? 'not-allowed'
                              : 'pointer',
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
