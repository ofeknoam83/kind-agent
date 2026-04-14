import { describe, it, expect } from 'vitest';
import { parseProviderResponse, formatTranscript } from '../../src/providers/base';
import type { ChatMessage } from '../../src/shared/types';

describe('parseProviderResponse', () => {
  it('parses valid new-format JSON response', () => {
    const raw = JSON.stringify({
      tldr: 'The team discussed the Q4 roadmap.',
      keyTopics: ['Q4 roadmap', 'Budget'],
      decisionsMade: ['Approved the Q4 timeline'],
      actionItems: [
        { assignee: 'Alice', description: 'Send proposal', deadline: 'Friday', priority: 'high' },
      ],
      unresolvedQuestions: ['When is the budget review?'],
      expectedFromMe: ['Review the proposal'],
      risks: ['Timeline is tight'],
      usefulContext: ['Q3 report was shared'],
      tone: 'Collaborative',
    });

    const result = parseProviderResponse(raw);
    expect(result.tldr).toBe('The team discussed the Q4 roadmap.');
    expect(result.keyTopics).toEqual(['Q4 roadmap', 'Budget']);
    expect(result.decisionsMade).toEqual(['Approved the Q4 timeline']);
    expect(result.actionItems).toHaveLength(1);
    expect(result.actionItems[0].assignee).toBe('Alice');
    expect(result.actionItems[0].priority).toBe('high');
    expect(result.unresolvedQuestions).toHaveLength(1);
    expect(result.expectedFromMe).toEqual(['Review the proposal']);
    expect(result.risks).toEqual(['Timeline is tight']);
    expect(result.usefulContext).toEqual(['Q3 report was shared']);
    expect(result.tone).toBe('Collaborative');
    // summary is a composed field for backwards compat
    expect(result.summary).toContain('The team discussed the Q4 roadmap.');
  });

  it('parses legacy format with summary field', () => {
    const raw = JSON.stringify({
      summary: 'The team discussed the Q4 roadmap.',
      actionItems: [
        { assignee: 'Alice', description: 'Send proposal', deadline: 'Friday' },
      ],
      unresolvedQuestions: ['When is the budget review?'],
    });

    const result = parseProviderResponse(raw);
    // Falls back to summary for tldr
    expect(result.tldr).toBe('The team discussed the Q4 roadmap.');
    expect(result.actionItems).toHaveLength(1);
    expect(result.actionItems[0].assignee).toBe('Alice');
    expect(result.actionItems[0].priority).toBeNull();
    expect(result.unresolvedQuestions).toHaveLength(1);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"tldr":"test","actionItems":[],"unresolvedQuestions":[]}\n```';
    const result = parseProviderResponse(raw);
    expect(result.tldr).toBe('test');
  });

  it('handles empty arrays', () => {
    const raw = '{"tldr":"Nothing happened","actionItems":[],"unresolvedQuestions":[]}';
    const result = parseProviderResponse(raw);
    expect(result.actionItems).toEqual([]);
    expect(result.unresolvedQuestions).toEqual([]);
    expect(result.keyTopics).toEqual([]);
    expect(result.expectedFromMe).toEqual([]);
  });

  it('handles missing fields gracefully', () => {
    const raw = '{"summary":"just a summary"}';
    const result = parseProviderResponse(raw);
    expect(result.tldr).toBe('just a summary');
    expect(result.actionItems).toEqual([]);
    expect(result.unresolvedQuestions).toEqual([]);
    expect(result.keyTopics).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.tone).toBe('');
  });

  it('handles null assignee and priority in action items', () => {
    const raw = JSON.stringify({
      tldr: 'test',
      actionItems: [{ assignee: null, description: 'Do something', deadline: null, priority: null }],
      unresolvedQuestions: [],
    });
    const result = parseProviderResponse(raw);
    expect(result.actionItems[0].assignee).toBeNull();
    expect(result.actionItems[0].deadline).toBeNull();
    expect(result.actionItems[0].priority).toBeNull();
  });

  it('normalizes priority values', () => {
    const raw = JSON.stringify({
      tldr: 'test',
      actionItems: [
        { assignee: null, description: 'Task 1', deadline: null, priority: 'High' },
        { assignee: null, description: 'Task 2', deadline: null, priority: 'invalid' },
        { assignee: null, description: 'Task 3', deadline: null, priority: 'LOW' },
      ],
      unresolvedQuestions: [],
    });
    const result = parseProviderResponse(raw);
    expect(result.actionItems[0].priority).toBe('high');
    expect(result.actionItems[1].priority).toBeNull();
    expect(result.actionItems[2].priority).toBe('low');
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
