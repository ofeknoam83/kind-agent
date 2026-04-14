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
          {/* TL;DR card */}
          <SummaryCard icon="*" title="TL;DR">
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--text-primary)',
                userSelect: 'text',
              }}
            >
              {latest.tldr || latest.summary}
            </div>
          </SummaryCard>

          {/* Key Topics */}
          {latest.keyTopics?.length > 0 && (
            <SummaryCard icon="#" title="Key Topics">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {latest.keyTopics.map((topic, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 12,
                      padding: '3px 10px',
                      borderRadius: 12,
                      background: 'rgba(37, 211, 102, 0.1)',
                      color: 'var(--accent)',
                      userSelect: 'text',
                    }}
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </SummaryCard>
          )}

          {/* Decisions Made */}
          {latest.decisionsMade?.length > 0 && (
            <SummaryCard icon=">" title="Decisions Made">
              {latest.decisionsMade.map((d, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    marginBottom: 6,
                    paddingLeft: 8,
                    borderLeft: '2px solid var(--accent)',
                    userSelect: 'text',
                  }}
                >
                  {d}
                </div>
              ))}
            </SummaryCard>
          )}

          {/* Open Questions */}
          {latest.unresolvedQuestions.length > 0 && (
            <SummaryCard icon="?" title="Open Questions">
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
            </SummaryCard>
          )}

          {/* Action Items */}
          {latest.actionItems.length > 0 && (
            <SummaryCard icon="!" title="Action Items">
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
                  <div style={{ userSelect: 'text', flex: 1 }}>
                    {item.assignee && item.assignee !== 'null' && (
                      <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                        [{item.assignee}]{' '}
                      </span>
                    )}
                    {item.priority && (
                      <PriorityBadge priority={item.priority} />
                    )}
                    <span>{item.description}</span>
                    {item.deadline && item.deadline !== 'null' && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {' '}
                        &rarr; by {item.deadline}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </SummaryCard>
          )}

          {/* Expected From Me */}
          {latest.expectedFromMe?.length > 0 && (
            <SummaryCard icon="@" title="Expected From Me">
              {latest.expectedFromMe.map((e, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    marginBottom: 6,
                    paddingLeft: 8,
                    borderLeft: '2px solid #f39c12',
                    userSelect: 'text',
                  }}
                >
                  {e}
                </div>
              ))}
            </SummaryCard>
          )}

          {/* Risks / Issues */}
          {latest.risks?.length > 0 && (
            <SummaryCard icon="!" title="Risks / Issues">
              {latest.risks.map((r, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: 'var(--danger, #e74c3c)',
                    marginBottom: 6,
                    paddingLeft: 8,
                    borderLeft: '2px solid var(--danger, #e74c3c)',
                    userSelect: 'text',
                  }}
                >
                  {r}
                </div>
              ))}
            </SummaryCard>
          )}

          {/* Useful Context */}
          {latest.usefulContext?.length > 0 && (
            <SummaryCard icon="i" title="Useful Context">
              {latest.usefulContext.map((c, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                    userSelect: 'text',
                  }}
                >
                  {c}
                </div>
              ))}
            </SummaryCard>
          )}

          {/* Tone / Sentiment */}
          {latest.tone && (
            <SummaryCard icon="~" title="Tone / Sentiment">
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic',
                  userSelect: 'text',
                }}
              >
                {latest.tone}
              </div>
            </SummaryCard>
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

// ── Helper components ──────────────────────────────────────

function SummaryCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
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
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            width: 20,
            height: 20,
            borderRadius: 4,
            background: 'rgba(37, 211, 102, 0.12)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
          }}
        >
          {icon}
        </span>
        <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: 'rgba(231, 76, 60, 0.15)', text: '#e74c3c' },
  medium: { bg: 'rgba(243, 156, 18, 0.15)', text: '#f39c12' },
  low: { bg: 'rgba(52, 152, 219, 0.15)', text: '#3498db' },
};

function PriorityBadge({ priority }: { priority: string }) {
  const colors = PRIORITY_COLORS[priority] ?? { bg: 'rgba(127,127,127,0.15)', text: '#888' };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 4,
        background: colors.bg,
        color: colors.text,
        marginRight: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {priority}
    </span>
  );
}
