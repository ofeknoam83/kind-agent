import { useState, useEffect, useCallback } from 'react';
import type { SummaryResult } from '../../shared/types';
import { useApi } from './use-api';

/**
 * Summarization hook.
 * Manages running summaries, loading history, and progress tracking.
 */
export function useSummarize(chatId: string | null) {
  const api = useApi();
  const [summaries, setSummaries] = useState<SummaryResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load summary history when chat changes
  useEffect(() => {
    if (!chatId) {
      setSummaries([]);
      return;
    }
    api.summarize.list(chatId).then(setSummaries);
  }, [api, chatId]);

  // Track summarization progress
  useEffect(() => {
    const unsub = api.summarize.onProgress((progress) => {
      if (progress.chatId === chatId) {
        if (progress.status === 'complete') {
          setRunning(false);
          // Reload summaries
          if (chatId) {
            api.summarize.list(chatId).then(setSummaries);
          }
        }
      }
    });
    return unsub;
  }, [api, chatId]);

  const runSummary = useCallback(
    async (afterTimestamp?: number | null, provider?: string) => {
      if (!chatId) return;
      setRunning(true);
      setError(null);

      const result = await api.summarize.run(chatId, afterTimestamp, provider);
      if ('error' in result) {
        setError(result.error);
        setRunning(false);
      }
      // On success, the progress event will update state
    },
    [api, chatId]
  );

  return { summaries, running, error, runSummary };
}
