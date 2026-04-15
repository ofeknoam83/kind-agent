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

function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

// ── Action Item Card ──────────────────────────────────────
// Each action item is its own card for better readability.
// Description is on its own line — not crammed with badges.
function ActionItemCard({
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
  const priorityColor =
    item.priority === 'high' ? '#e74c3c' :
    item.priority === 'medium' ? '#f39c12' :
    '#3498db';

  return (
    <div
      style={{
        background: isDone ? 'transparent' : 'rgba(255,255,255,0.02)',
        borderLeft: `3px solid ${isDone ? '#333' : priorityColor}`,
        borderRadius: '0 8px 8px 0',
        padding: '12px 16px',
        marginBottom: 8,
        opacity: isDone ? 0.45 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      {/* Top row: chat name + meta */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--accent)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => onNavigateToChat(item.chatId)}
          >
            {chatName}
          </span>
          {item.assignee && (
            <span style={{ fontSize: 12, color: '#9b59b6', fontWeight: 500 }}>
              @{item.assignee}
            </span>
          )}
          {item.deadline && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              by {item.deadline}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Dismiss */}
          {!isDone && (
            <button
              onClick={() => onDismiss(item.id)}
              title="Dismiss"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 16,
                padding: '0 4px',
                opacity: 0.3,
                transition: 'opacity 0.15s',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.8'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.3'; }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Description — its own line for readability */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <button
          onClick={() => onMarkDone(item.id)}
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            border: isDone ? 'none' : '2px solid #444',
            background: isDone ? 'var(--accent)' : 'transparent',
            color: '#fff',
            cursor: 'pointer',
            flexShrink: 0,
            marginTop: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            padding: 0,
            transition: 'all 0.15s ease',
          }}
        >
          {isDone ? '\u2713' : ''}
        </button>
        <span
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: isDone ? 'var(--text-secondary)' : 'var(--text-primary)',
            textDecoration: isDone ? 'line-through' : 'none',
            userSelect: 'text',
          }}
        >
          {item.description}
        </span>
      </div>
    </div>
  );
}

// ── Section Component ─────────────────────────────────────
function Section({
  title,
  count,
  accentColor,
  children,
  emptyMessage,
  rightAction,
}: {
  title: string;
  count: number;
  accentColor: string;
  children: React.ReactNode;
  emptyMessage?: string;
  rightAction?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 4,
              height: 20,
              borderRadius: 2,
              background: accentColor,
              flexShrink: 0,
            }}
          />
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: -0.3,
            }}
          >
            {title}
          </h3>
          <span
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              fontWeight: 500,
            }}
          >
            {count}
          </span>
        </div>
        {rightAction}
      </div>

      {count === 0 && emptyMessage ? (
        <div
          style={{
            padding: '20px 24px',
            fontSize: 14,
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 10,
            textAlign: 'center',
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        children
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
    setActionItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: 'done' as const, resolvedAt: Math.floor(Date.now() / 1000) }
          : item
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
  const hasOpenItems = highPriority.length > 0 || mediumPriority.length > 0;

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
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // ── Render ──────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: -0.5,
                marginBottom: 4,
              }}
            >
              {getGreeting()}
            </h1>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {today}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 12, color: '#666' }}>
              {refreshLabel}
            </span>
            <button
              onClick={handleManualRefresh}
              title="Refresh"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #333',
                borderRadius: 8,
                width: 32,
                height: 32,
                fontSize: 16,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
            >
              &#x21bb;
            </button>
          </div>
        </div>

        {/* Status bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginTop: 16,
            padding: '10px 16px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 10,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isConnected ? '#25d366' : '#666',
              }}
            />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          <span style={{ color: '#333' }}>|</span>
          <span>{chats.length} chats</span>
          <span style={{ color: '#333' }}>|</span>
          <span>{totalMessages.toLocaleString()} messages</span>
          {hasOpenItems && (
            <>
              <span style={{ color: '#333' }}>|</span>
              <span style={{ color: '#e74c3c' }}>
                {highPriority.length + mediumPriority.length} open items
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Needs Attention ─────────────────────────────── */}
      <Section
        title="Needs Attention"
        count={highPriority.length}
        accentColor="#e74c3c"
        emptyMessage="Nothing urgent right now"
        rightAction={
          hasOpenItems ? (
            <button
              onClick={handleDismissAll}
              style={{
                background: 'transparent',
                border: '1px solid #333',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 12,
                color: '#666',
                cursor: 'pointer',
              }}
            >
              Dismiss All
            </button>
          ) : undefined
        }
      >
        {highPriority.map((item) => (
          <ActionItemCard
            key={item.id}
            item={item}
            chatName={chatNameById(item.chatId)}
            onNavigateToChat={onNavigateToChat}
            onMarkDone={handleMarkDone}
            onDismiss={handleDismiss}
          />
        ))}
      </Section>

      {/* ── This Week ───────────────────────────────────── */}
      {(mediumPriority.length > 0 || recentlyDone.length > 0) && (
        <Section
          title="This Week"
          count={mediumPriority.length + recentlyDone.length}
          accentColor="#f39c12"
        >
          {mediumPriority.map((item) => (
            <ActionItemCard
              key={item.id}
              item={item}
              chatName={chatNameById(item.chatId)}
              onNavigateToChat={onNavigateToChat}
              onMarkDone={handleMarkDone}
              onDismiss={handleDismiss}
            />
          ))}
          {recentlyDone.map((item) => (
            <ActionItemCard
              key={item.id}
              item={item}
              chatName={chatNameById(item.chatId)}
              onNavigateToChat={onNavigateToChat}
              onMarkDone={handleMarkDone}
              onDismiss={handleDismiss}
            />
          ))}
        </Section>
      )}

      {/* ── Recent Chats ────────────────────────────────── */}
      <Section
        title="Recent Chats"
        count={chats.filter((c) => c.messageCount > 0).length}
        accentColor="var(--accent)"
        emptyMessage="Syncing chats from WhatsApp..."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...chats]
            .filter((c) => c.messageCount > 0)
            .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp)
            .slice(0, 12)
            .map((chat) => (
              <div
                key={chat.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 8,
                  transition: 'background 0.1s',
                  cursor: 'pointer',
                }}
                onClick={() => onNavigateToChat(chat.id)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {chat.name}
                    {chat.category && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 8,
                          background: `${CATEGORY_COLORS[chat.category] || '#666'}18`,
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
                      fontSize: 12,
                      color: '#666',
                      marginTop: 3,
                    }}
                  >
                    {chat.messageCount} messages
                    {chat.isGroup ? ' \u00b7 Group' : ''}
                    {chat.lastMessageTimestamp > 0 && (
                      <> &middot; {relativeTime(chat.lastMessageTimestamp)}</>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {TIME_RANGES.map((range) => (
                    <button
                      key={range.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        quickSummarize(chat.id, range.hours);
                      }}
                      disabled={summarizingChat === chat.id}
                      style={{
                        background:
                          summarizingChat === chat.id
                            ? '#252525'
                            : 'rgba(37, 211, 102, 0.08)',
                        color:
                          summarizingChat === chat.id
                            ? '#666'
                            : 'var(--accent)',
                        border: '1px solid rgba(37, 211, 102, 0.15)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
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
      </Section>
    </div>
  );
}
