import { useState, useEffect, useCallback } from 'react';
import type { Chat, ChatMessage } from '../../shared/types';
import { useApi } from './use-api';

/**
 * Chat list + message loading.
 * Refreshes when new messages arrive via push events.
 */
export function useChats() {
  const api = useApi();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [revision, setRevision] = useState(0);

  // Load chat list
  const refreshChats = useCallback(async () => {
    const result = await api.chats.list();
    setChats(Array.isArray(result) ? result : []);
    setRevision((r) => r + 1);
  }, [api]);

  useEffect(() => {
    refreshChats();
    // Refresh chat list when new messages arrive
    const unsub = api.chats.onNewMessages(() => {
      refreshChats();
    });
    return unsub;
  }, [api, refreshChats]);

  // Load messages for selected chat
  const selectChat = useCallback(
    async (chatId: string) => {
      setSelectedChatId(chatId);
      setLoadingMessages(true);
      try {
        const msgs = await api.chats.getMessages(chatId, 500);
        setMessages(Array.isArray(msgs) ? msgs : []);
      } finally {
        setLoadingMessages(false);
      }
    },
    [api]
  );

  return { chats, selectedChatId, selectChat, messages, loadingMessages, refreshChats, revision };
}
