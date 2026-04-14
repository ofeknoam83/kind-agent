import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Chat, SummaryResult, TrackedActionItem } from '../../shared/types';
import type { ConnectionState } from '../../shared/types';
import { useApi } from '../hooks/use-api';

interface Props {
  chats: Chat[];
  connectionState: ConnectionState;
  onNavigateToChat: (chatId: string) => void;
  onRefresh?: () => void;
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

function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

// ── Interactive Action Item Row ───────────────────────────
function ActionItemRow({
  item,
  chatName,
  onNavigateToChat,
  onMarkDone,
  onDismiss,
}: {
  item: TrackedActionItem;
  chatName: string;
  onNavigateToChat: (id: string) => void;
  onMarkDone: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const isDone = item.status === 'done';
  const c = item.priority ? PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.low : null;
  const catColor = CATEGORY_COLORS['Work'] || '#888'; // fallback

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 0',
        fontSize: 13,
        lineHeight: 1.5,
        opacity: isDone ? 0.5 : 1,
      }}
    >
      {/* Interactive checkbox */}
      <button
        onClick={() => onMarkDone(item.id)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: isDone ? 'none' : '1.5px solid var(--border)',
          background: isDone ? 'var(--accent)' : 'transparent',
          color: '#fff',
          cursor: 'pointer',
          flexShrink: 0,
          marginTop: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          padding: 0,
          transition: 'all 0.15s ease',
        }}
      >
        {isDone ? '\u2713' : ''}
      </button>

      <div style={{ flex: 1, userSelect: 'text' }}>
        {/* Chat name */}
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
          [{chatName}]
        </span>
        {/* Priority badge */}
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
            {item.priority}
          </span>
        )}
        {/* Assignee */}
        {item.assignee && (
          <span style={{ color: '#9b59b6', fontWeight: 500 }}>@{item.assignee} </span>
        )}
        {/* Description */}
        <span
          style={{
            color: 'var(--text-primary)',
            textDecoration: isDone ? 'line-through' : 'none',
          }}
        >
          {item.description}
        </span>
        {/* Deadline */}
        {item.deadline && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            {' '}&rarr; by {item.deadline}
          </span>
        )}
      </div>

      {/* Dismiss button */}
      {!isDone && (
        <button
          onClick={() => onDismiss(item.id)}
          title="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '0 4px',
            opacity: 0.5,
            transition: 'opacity 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.5'; }}
        >
          &times;
        </button>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────
export function Dashboard({
  chats,
  connectionState,
  onNavigateToChat,
  onRefresh,
  revision = 0,
}: Props) {
  const api = useApi();
  const [actionItems, setActionItems] = useState<TrackedActionItem[]>([]);
  const [recentSummaries, setRecentSummaries] = useState<SummaryResult[]>([]);
  const [summarizingChat, setSummarizingChat] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalMessages = chats.reduce((sum, c) => sum + c.messageCount, 0);
  const isConnected = connectionState.status === 'connected';

  const chatNameById = (id: string): string =>
    chats.find((c) => c.id === id)?.name || 'Chat';

  // ── Data loading ────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const since24h = Math.floor(Date.now() / 1000) - 86400;
      const [items, summaries] = await Promise.all([
        api.actionItems.list(since24h),
        api.summarize.recent(since24h, 50),
      ]);
      setActionItems(Array.isArray(items) ? items : []);
      setRecentSummaries(Array.isArray(summaries) ? summaries : []);
      setLastRefreshed(Date.now());
    } catch {
      // Silently handle
    }
  }, [api]);

  const handleManualRefresh = () => {
    loadData();
    onRefresh?.();
  };

  useEffect(() => { loadData(); }, [revision, chats.length, loadData]);

  useEffect(() => {
    const unsub = api.summarize.onAutoSummarizeComplete(() => loadData());
    return unsub;
  }, [api, loadData]);

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      loadData();
      onRefresh?.();
    }, 30_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [loadData]);

  // ── Action item handlers ────────────────────────────────
  const handleMarkDone = async (id: number) => {
    // Optimistic update
    setActionItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'done' as const, resolvedAt: Math.floor(Date.now() / 1000) } : item
      )
    );
    await api.actionItems.markDone(id);
  };

  const handleDismiss = async (id: number) => {
    setActionItems((prev) => prev.filter((item) => item.id !== id));
    await api.actionItems.dismiss(id);
  };

  const handleDismissAll = async () => {
    setActionItems([]);
    await api.actionItems.dismissAll();
  };

  // ── Derived data ────────────────────────────────────────
  const highPriority = actionItems.filter(
    (i) => i.priority === 'high' && i.status === 'open' && (i.confidence ?? 3) >= 3
  );
  const mediumPriority = actionItems.filter(
    (i) => i.priority === 'medium' && i.status === 'open' && (i.confidence ?? 3) >= 3
  );
  const recentlyDone = actionItems.filter((i) => i.status === 'done');

  // Recent chat summaries (for Quick Summarize context)
  const latestPerChat = new Map<string, SummaryResult>();
  for (const s of recentSummaries) {
    const existing = latestPerChat.get(s.chatId);
    if (!existing || s.createdAt > existing.createdAt) {
      latestPerChat.set(s.chatId, s);
    }
  }

  const hasItems = highPriority.length > 0 || mediumPriority.length > 0 || recentlyDone.length > 0;

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
      await loadData();
    } finally {
      setSummarizingChat(null);
    }
  };

  const refreshLabel = relativeTime(Math.floor(lastRefreshed / 1000)) || 'just now';

  // ── Render ──────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
      {/* Greeting + controls */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
            {getGreeting()}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Updated {refreshLabel}
            </span>
            <button
              onClick={handleManualRefresh}
              title="Refresh now"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 14,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              &#x21bb;
            </button>
            {hasItems && (
              <button
                onClick={handleDismissAll}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Dismiss All
              </button>
            )}
          </div>
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
            {' \u00b7 '}{chats.length} chats
            {' \u00b7 '}{totalMessages.toLocaleString()} messages synced
          </span>
        </div>
      </div>

      {/* ── Needs Attention (high priority) ──────────────── */}
      {highPriority.length > 0 && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(231, 76, 60, 0.4)',
            borderLeft: '4px solid #e74c3c',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#e74c3c',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Needs Attention ({highPriority.length})
          </h3>
          {highPriority.map((item) => (
            <ActionItemRow
              key={item.id}
              item={item}
              chatName={chatNameById(item.chatId)}
              onNavigateToChat={onNavigateToChat}
              onMarkDone={handleMarkDone}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* ── This Week (medium + done) ────────────────────── */}
      {(mediumPriority.length > 0 || recentlyDone.length > 0) && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}
          >
            This Week ({mediumPriority.length + recentlyDone.length})
          </h3>
          {mediumPriority.map((item) => (
            <ActionItemRow
              key={item.id}
              item={item}
              chatName={chatNameById(item.chatId)}
              onNavigateToChat={onNavigateToChat}
              onMarkDone={handleMarkDone}
              onDismiss={handleDismiss}
            />
          ))}
          {recentlyDone.map((item) => (
            <ActionItemRow
              key={item.id}
              item={item}
              chatName={chatNameById(item.chatId)}
              onNavigateToChat={onNavigateToChat}
              onMarkDone={handleMarkDone}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* ── Quick Summarize ───────────────────────────────── */}
      <div style={{ marginBottom: 32, marginTop: hasItems ? 8 : 0 }}>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 16,
            color: 'var(--text-primary)',
          }}
        >
          Recent Chats
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
