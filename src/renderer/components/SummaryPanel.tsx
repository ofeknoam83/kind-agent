import React, { useState } from 'react';
import { useSummarize } from '../hooks/use-summarize';

interface Props {
  chatId: string;
}

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
] as const;

export function SummaryPanel({ chatId }: Props) {
  const { summaries, running, error, runSummary } = useSummarize(chatId);
  const latest = summaries[0] ?? null;
  const [selectedRange, setSelectedRange] = useState<string | null>(null);

  const handleTimeRange = (hours: number, label: string) => {
    const afterTimestamp = Math.floor(Date.now() / 1000) - hours * 3600;
    setSelectedRange(label);
    runSummary(afterTimestamp);
  };

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        padding: 20,
        background: 'var(--bg-secondary)',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Summary</h3>
        <button
          onClick={() => {
            setSelectedRange(null);
            runSummary(latest?.timeRange[1] ?? null);
          }}
          disabled={running}
          style={{
            background: running ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: '6px 16px',
            fontSize: 12,
            cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          {running ? 'Summarizing...' : latest ? 'Update' : 'Generate'}
        </button>
      </div>

      {/* Time frame buttons */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 14,
        }}
      >
        {TIME_RANGES.map((range) => (
          <button
            key={range.label}
            onClick={() => handleTimeRange(range.hours, range.label)}
            disabled={running}
            style={{
              background:
                selectedRange === range.label
                  ? 'var(--accent)'
                  : 'rgba(37, 211, 102, 0.08)',
              color:
                selectedRange === range.label ? '#fff' : 'var(--accent)',
              border: '1px solid rgba(37, 211, 102, 0.2)',
              borderRadius: 6,
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 500,
              cursor: running ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {range.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}

      {latest && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          {/* What Matters card */}
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 13 }}>{'\u2728'}</span>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                What Matters
              </h4>
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--text-primary)',
                userSelect: 'text',
              }}
            >
              {latest.summary}
            </div>
          </div>

          {/* Action Items card */}
          {latest.actionItems.length > 0 && (
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 13 }}>{'\u26a1'}</span>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Action Items
                </h4>
              </div>
              {latest.actionItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 8,
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      border: '1.5px solid var(--border)',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  <div style={{ userSelect: 'text' }}>
                    {item.assignee && (
                      <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                        {item.assignee}:{' '}
                      </span>
                    )}
                    <span>{item.description}</span>
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
          )}

          {/* Unresolved Questions card */}
          {latest.unresolvedQuestions.length > 0 && (
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 13 }}>?</span>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Unresolved Questions
                </h4>
              </div>
              {latest.unresolvedQuestions.map((q, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    marginBottom: 6,
                    paddingLeft: 8,
                    borderLeft: '2px solid var(--border)',
                    userSelect: 'text',
                  }}
                >
                  {q}
                </div>
              ))}
            </div>
          )}

          {/* Meta line */}
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {latest.messageCount} messages · {latest.provider}/{latest.model} ·{' '}
            {new Date(latest.createdAt * 1000).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
