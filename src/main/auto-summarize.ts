import type { BrowserWindow } from 'electron';
import { IpcEvents } from '../shared/ipc';
import { ChatRepository } from '../db/repositories/chat-repository';
import { SummaryRepository } from '../db/repositories/summary-repository';
import { ProviderRepository } from '../db/repositories/provider-repository';
import { createProvider } from '../providers/provider-factory';
import { getAllApiKeys } from './keychain';

const AUTO_SUMMARIZE_INTERVAL_MS = 120_000; // 2 minutes
const MAX_CHATS_PER_RUN = 5;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastRunTimestamp: number = 0;
let running = false;

/**
 * Starts the auto-summarization daemon.
 * Runs every 2 minutes, finds the top 5 chats with new messages
 * since the last summarization, and summarizes them.
 */
export function startAutoSummarize(
  mainWindow: BrowserWindow,
  getRepos: () => {
    chatRepo: ChatRepository;
    summaryRepo: SummaryRepository;
    providerRepo: ProviderRepository;
  }
): void {
  if (intervalId) return; // Already running

  // Start from now — don't summarize old messages on first boot
  lastRunTimestamp = Math.floor(Date.now() / 1000);

  intervalId = setInterval(() => {
    runAutoSummarize(mainWindow, getRepos).catch((err) => {
      console.error('[auto-summarize] Error:', err);
    });
  }, AUTO_SUMMARIZE_INTERVAL_MS);

  console.log('[auto-summarize] Daemon started (every 2 minutes)');
}

/**
 * Stops the auto-summarization daemon.
 */
export function stopAutoSummarize(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[auto-summarize] Daemon stopped');
  }
}

async function runAutoSummarize(
  mainWindow: BrowserWindow,
  getRepos: () => {
    chatRepo: ChatRepository;
    summaryRepo: SummaryRepository;
    providerRepo: ProviderRepository;
  }
): Promise<void> {
  if (running) {
    console.log('[auto-summarize] Previous run still in progress, skipping');
    return;
  }

  running = true;
  try {
    const { chatRepo, summaryRepo, providerRepo } = getRepos();

    // Find the active provider
    const providerConfig = providerRepo.getActive();
    if (!providerConfig) {
      console.log('[auto-summarize] No active provider configured, skipping');
      return;
    }

    // Find chats with new messages since last run
    const chatsWithNew = chatRepo.getChatsWithNewMessagesSince(lastRunTimestamp);
    if (chatsWithNew.length === 0) {
      console.log('[auto-summarize] No new messages since last run');
      return;
    }

    // Take top 5 by new message count
    const topChats = chatsWithNew.slice(0, MAX_CHATS_PER_RUN);
    console.log(
      `[auto-summarize] Processing ${topChats.length} chats:`,
      topChats.map((c) => `${c.chatId} (${c.newMessageCount} new)`)
    );

    const apiKeys = getAllApiKeys();
    const provider = createProvider(providerConfig, apiKeys);
    const allChats = chatRepo.listChats();
    let summarizedCount = 0;

    for (const { chatId } of topChats) {
      try {
        // Get messages since last run
        const messages = chatRepo.getMessagesAfter(chatId, lastRunTimestamp);
        if (messages.length === 0) continue;

        const chatName = allChats.find((c) => c.id === chatId)?.name ?? 'Unknown';
        const latestSummary = summaryRepo.getLatestForChat(chatId);

        // Notify renderer we're working on this chat
        mainWindow.webContents.send(IpcEvents.SUMMARIZE_PROGRESS, {
          chatId,
          status: 'running',
          messageCount: messages.length,
          auto: true,
        });

        const chatData = allChats.find((c) => c.id === chatId);
        const result = await provider.summarize({
          messages,
          chatName,
          isGroup: chatData?.isGroup ?? chatId.endsWith('@g.us'),
          previousSummary: latestSummary?.summary,
        });

        const timestamps = messages.map((m) => m.timestamp);
        summaryRepo.insert({
          chatId,
          ...result,
          provider: providerConfig.type,
          model: providerConfig.model,
          messageCount: messages.length,
          timeRange: [Math.min(...timestamps), Math.max(...timestamps)],
        });

        // Auto-categorize: if chat has no category, use LLM suggestion
        const VALID_CATEGORIES = new Set(['School', 'Kindergarten', 'Work', 'Family', 'Friends', 'Other']);
        if (result.suggestedCategory && VALID_CATEGORIES.has(result.suggestedCategory)) {
          const chat = allChats.find((c) => c.id === chatId);
          if (chat && !chat.category) {
            chatRepo.setCategory(chatId, result.suggestedCategory);
          }
        }

        mainWindow.webContents.send(IpcEvents.SUMMARIZE_PROGRESS, {
          chatId,
          status: 'complete',
          auto: true,
        });

        summarizedCount++;
      } catch (err) {
        console.error(`[auto-summarize] Failed for chat ${chatId}:`, err);
        mainWindow.webContents.send(IpcEvents.SUMMARIZE_PROGRESS, {
          chatId,
          status: 'error',
          error: String(err),
          auto: true,
        });
      }
    }

    // Update the last run timestamp
    lastRunTimestamp = Math.floor(Date.now() / 1000);

    if (summarizedCount > 0) {
      // Notify renderer that auto-summarize completed
      mainWindow.webContents.send(IpcEvents.AUTO_SUMMARIZE_COMPLETE);
      console.log(`[auto-summarize] Completed: ${summarizedCount} chats summarized`);
    }
  } finally {
    running = false;
  }
}
