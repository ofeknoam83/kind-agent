import { describe, it, expect } from 'vitest';
import { parseProviderResponse, formatTranscript } from '../../src/providers/base';
import type { ChatMessage } from '../../src/shared/types';

describe('parseProviderResponse', () => {
  it('parses valid JSON response', () => {
    const raw = JSON.stringify({
      summary: 'The team discussed the Q4 roadmap.',
      actionItems: [
        { assignee: 'Alice', description: 'Send proposal', deadline: 'Friday' },
      ],
      unresolvedQuestions: ['When is the budget review?'],
    });

    const result = parseProviderResponse(raw);
    expect(result.summary).toBe('The team discussed the Q4 roadmap.');
    expect(result.actionItems).toHaveLength(1);
    expect(result.actionItems[0].assignee).toBe('Alice');
    expect(result.unresolvedQuestions).toHaveLength(1);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"summary":"test","actionItems":[],"unresolvedQuestions":[]}\n```';
    const result = parseProviderResponse(raw);
    expect(result.summary).toBe('test');
  });

  it('handles empty arrays', () => {
    const raw = '{"summary":"Nothing happened","actionItems":[],"unresolvedQuestions":[]}';
    const result = parseProviderResponse(raw);
    expect(result.actionItems).toEqual([]);
    expect(result.unresolvedQuestions).toEqual([]);
  });

  it('handles missing fields gracefully', () => {
    const raw = '{"summary":"just a summary"}';
    const result = parseProviderResponse(raw);
    expect(result.summary).toBe('just a summary');
    expect(result.actionItems).toEqual([]);
    expect(result.unresolvedQuestions).toEqual([]);
  });

  it('handles null assignee in action items', () => {
    const raw = JSON.stringify({
      summary: 'test',
      actionItems: [{ assignee: null, description: 'Do something', deadline: null }],
      unresolvedQuestions: [],
    });
    const result = parseProviderResponse(raw);
    expect(result.actionItems[0].assignee).toBeNull();
    expect(result.actionItems[0].deadline).toBeNull();
  });

  it('throws on completely invalid JSON', () => {
    expect(() => parseProviderResponse('not json at all')).toThrow();
  });
});

describe('formatTranscript', () => {
  it('formats messages with timestamps and sender names', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        chatId: 'chat-1',
        senderJid: 'a',
        senderName: 'Alice',
        body: 'Hello',
        timestamp: 1700000000,
        fromMe: false,
      },
      {
        id: '2',
        chatId: 'chat-1',
        senderJid: 'b',
        senderName: 'Bob',
        body: 'Hi there',
        timestamp: 1700000060,
        fromMe: false,
      },
    ];

    const result = formatTranscript(messages, 'Test Chat');

    expect(result).toContain('Chat: Test Chat');
    expect(result).toContain('Messages: 2');
    expect(result).toContain('Alice: Hello');
    expect(result).toContain('Bob: Hi there');
  });
});
