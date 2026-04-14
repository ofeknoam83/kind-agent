/** Core WhatsApp message representation, stripped of Baileys internals. */
export interface ChatMessage {
  /** Unique message ID from WhatsApp */
  id: string;
  /** JID of the chat (group or 1:1) */
  chatId: string;
  /** JID of the sender */
  senderJid: string;
  /** Display name of the sender at time of message */
  senderName: string;
  /** Message body text (we only summarize text messages) */
  body: string;
  /** Unix epoch seconds */
  timestamp: number;
  /** Whether this user sent the message */
  fromMe: boolean;
}

/** Available chat categories for user tagging. */
export type ChatCategory = 'School' | 'Kindergarten' | 'Work' | 'Family' | 'Friends' | 'Other';

export const CHAT_CATEGORIES: ChatCategory[] = ['School', 'Kindergarten', 'Work', 'Family', 'Friends', 'Other'];

export interface Chat {
  /** JID — unique WhatsApp chat identifier */
  id: string;
  /** Display name (group name or contact name) */
  name: string;
  /** Whether this is a group chat */
  isGroup: boolean;
  /** Unix epoch seconds of last message we stored */
  lastMessageTimestamp: number;
  /** Total messages stored locally */
  messageCount: number;
  /** User-assigned category tag */
  category: ChatCategory | null;
}
