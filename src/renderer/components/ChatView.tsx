import React, { useState, useRef, useEffect } from 'react';
import type { Chat, ChatMessage, ChatCategory } from '../../shared/types';
import { CHAT_CATEGORIES } from '../../shared/types';
import { SummaryPanel } from './SummaryPanel';
import { useApi } from '../hooks/use-api';

interface Props {
  chatId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  chats: Chat[];
  onCategoryChanged?: () => void;
}

const CATEGORY_COLORS: Record<ChatCategory, string> = {
  School: '#3498db',
  Kindergarten: '#e91e63',
  Work: '#25d366',
  Family: '#9b59b6',
  Friends: '#f39c12',
  Other: '#666',
};

function CategoryPicker({
  chatId,
  currentCategory,
  onCategoryChanged,
}: {
  chatId: string;
  currentCategory: ChatCategory | null;
  onCategoryChanged?: () => void;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const setCategory = async (cat: ChatCategory | null) => {
    setSaving(true);
    setOpen(false);
    try {
      const result = await api.chats.setCategory(chatId, cat);
      if (result && 'error' in result) {
        console.error('[CategoryPicker] Failed to set category:', result.error);
      }
      onCategoryChanged?.();
    } catch (err) {
      console.error('[CategoryPicker] Error:', err);
    } finally {
      setSaving(false);
    }
  };

  const badgeColor = currentCategory ? CATEGORY_COLORS[currentCategory] : '#555';

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Badge / trigger button */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 4, left: rect.left });
          }
          setOpen(!open);
        }}
        disabled={saving}
        style={{
          background: currentCategory ? `${badgeColor}22` : 'rgba(255,255,255,0.06)',
          color: currentCategory ? badgeColor : 'var(--text-secondary)',
          border: `1px solid ${currentCategory ? `${badgeColor}44` : 'var(--border)'}`,
          borderRadius: 12,
          padding: '3px 10px',
          fontSize: 11,
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {currentCategory && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: badgeColor,
              flexShrink: 0,
            }}
          />
        )}
        {saving ? 'Saving...' : currentCategory || 'Set category'}
        <span style={{ fontSize: 8, marginLeft: 2 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Dropdown — uses fixed positioning to avoid overflow:hidden clipping */}
      {open && dropdownPos && (
        <div
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            background: '#1a1a1a',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 4,
            zIndex: 10000,
            minWidth: 140,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {CHAT_CATEGORIES.map((cat) => {
            const color = CATEGORY_COLORS[cat];
            const isSelected = cat === currentCategory;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: isSelected ? `${color}22` : 'transparent',
                  color: isSelected ? color : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 400,
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = `${color}15`;
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = isSelected
                    ? `${color}22`
                    : 'transparent';
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                {cat}
              </button>
            );
          })}
          {/* Clear option */}
          {currentCategory && (
            <>
              <div
                style={{
                  height: 1,
                  background: 'var(--border)',
                  margin: '4px 0',
                }}
              />
              <button
                onClick={() => setCategory(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                }}
              >
                Clear category
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatView({ chatId, messages, loading, chats, onCategoryChanged }: Props) {
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

  const currentChat = chats.find((c) => c.id === chatId);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Chat header with category picker */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {currentChat?.name || 'Chat'}
          </span>
          {currentChat?.isGroup && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-secondary)',
                background: 'rgba(255,255,255,0.06)',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              Group
            </span>
          )}
        </div>
        <CategoryPicker
          chatId={chatId}
          currentCategory={currentChat?.category || null}
          onCategoryChanged={onCategoryChanged}
        />
      </div>

      {/* Summary panel */}
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
