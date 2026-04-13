import { describe, it, expect } from 'vitest';
import {
  GetMessagesRequest,
  SummarizeRunRequest,
  ProviderUpdateRequest,
  SetApiKeyRequest,
  SummaryListRequest,
  SummaryGetRequest,
} from '../../src/shared/ipc/validators';

describe('GetMessagesRequest', () => {
  it('validates valid request', () => {
    const result = GetMessagesRequest.parse({ chatId: 'chat@g.us', limit: 100 });
    expect(result.chatId).toBe('chat@g.us');
    expect(result.limit).toBe(100);
  });

  it('applies default limit', () => {
    const result = GetMessagesRequest.parse({ chatId: 'chat@g.us' });
    expect(result.limit).toBe(500);
  });

  it('rejects empty chatId', () => {
    expect(() => GetMessagesRequest.parse({ chatId: '' })).toThrow();
  });

  it('rejects limit above max', () => {
    expect(() => GetMessagesRequest.parse({ chatId: 'x', limit: 10000 })).toThrow();
  });
});

describe('SummarizeRunRequest', () => {
  it('validates with optional fields', () => {
    const result = SummarizeRunRequest.parse({ chatId: 'chat@g.us', afterTimestamp: null });
    expect(result.chatId).toBe('chat@g.us');
    expect(result.afterTimestamp).toBeNull();
  });

  it('validates with provider override', () => {
    const result = SummarizeRunRequest.parse({
      chatId: 'x',
      afterTimestamp: 1700000000,
      provider: 'openai',
    });
    expect(result.provider).toBe('openai');
  });

  it('rejects invalid provider', () => {
    expect(() =>
      SummarizeRunRequest.parse({ chatId: 'x', afterTimestamp: null, provider: 'invalid' })
    ).toThrow();
  });
});

describe('ProviderUpdateRequest', () => {
  it('validates valid update', () => {
    const result = ProviderUpdateRequest.parse({
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:8b',
      active: true,
    });
    expect(result.type).toBe('ollama');
    expect(result.active).toBe(true);
  });

  it('rejects invalid URL', () => {
    expect(() =>
      ProviderUpdateRequest.parse({
        type: 'ollama',
        baseUrl: 'not-a-url',
        model: 'test',
        active: false,
      })
    ).toThrow();
  });
});

describe('SetApiKeyRequest', () => {
  it('validates valid key', () => {
    const result = SetApiKeyRequest.parse({ provider: 'openai', apiKey: 'sk-abc123' });
    expect(result.provider).toBe('openai');
  });

  it('rejects empty key', () => {
    expect(() => SetApiKeyRequest.parse({ provider: 'openai', apiKey: '' })).toThrow();
  });
});

describe('SummaryListRequest', () => {
  it('applies default limit', () => {
    const result = SummaryListRequest.parse({ chatId: 'x' });
    expect(result.limit).toBe(20);
  });
});

describe('SummaryGetRequest', () => {
  it('rejects non-positive IDs', () => {
    expect(() => SummaryGetRequest.parse({ id: 0 })).toThrow();
    expect(() => SummaryGetRequest.parse({ id: -1 })).toThrow();
  });
});
