import React from 'react';
import { useSummarize } from '../hooks/use-summarize';

interface Props {
  chatId: string;
}

export function SummaryPanel({ chatId }: Props) {
  const { summaries, running, error, runSummary } = useSummarize(chatId);
  const latest = summaries[0] ?? null;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        padding: 16,
        background: 'var(--bg-secondary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Summary</h3>
        <button
          onClick={() => runSummary(latest?.timeRange[1] ?? null)}
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
          {running ? 'Summarizing...' : latest ? 'Update Summary' : 'Generate Summary'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}

      {latest && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5, userSelect: 'text' }}>
            {latest.summary}
          </div>

          {latest.actionItems.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Action Items</h4>
              <ul style={{ paddingLeft: 16, fontSize: 12, lineHeight: 1.6 }}>
                {latest.actionItems.map((item, i) => (
                  <li key={i} style={{ userSelect: 'text' }}>
                    {item.assignee && <strong>{item.assignee}: </strong>}
                    {item.description}
                    {item.deadline && (
                      <span style={{ color: 'var(--text-secondary)' }}> (by {item.deadline})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {latest.unresolvedQuestions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Unresolved Questions
              </h4>
              <ul style={{ paddingLeft: 16, fontSize: 12, lineHeight: 1.6 }}>
                {latest.unresolvedQuestions.map((q, i) => (
                  <li key={i} style={{ color: 'var(--text-secondary)', userSelect: 'text' }}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 8 }}>
            {latest.messageCount} messages · {latest.provider}/{latest.model} ·{' '}
            {new Date(latest.createdAt * 1000).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
