import * as baileys from '@whiskeysockets/baileys';
import type { WASocket, BaileysEventMap, WAMessage } from '@whiskeysockets/baileys';

const makeWASocket = baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason } = baileys;

const Boom = (require('@hapi/boom') as any).Boom ?? require('@hapi/boom');
import QRCode from 'qrcode';
import path from 'node:path';
import { app } from 'electron';
import { EventEmitter } from 'node:events';
import type { ChatMessage, ConnectionState } from '../../shared/types';
import { AUTH_DIR } from '../../shared/constants';

type BaileysClientEvents = {
  'connection-state': [ConnectionState];
  messages: [ChatMessage[]];
};

export class BaileysClient extends EventEmitter<BaileysClientEvents> {
  private socket: WASocket | null = null;
  private state: ConnectionState = { status: 'disconnected' };
  private phoneNumber: string | null = null;
  private pairingCodeRequested = false;
  private contactNames = new Map<string, string>();

  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Connect to WhatsApp.
   * @param phoneNumber — If provided, uses pairing code auth (enter code in WhatsApp).
   *                       Format: country code + number, no + prefix. E.g. "14155551234"
   *                       If omitted, falls back to QR code auth.
   */
  async connect(phoneNumber?: string): Promise<void> {
    if (this.socket) {
      return;
    }

    this.phoneNumber = phoneNumber ?? null;
    this.pairingCodeRequested = false;

    const authDir = path.join(app.getPath('userData'), AUTH_DIR);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    this.setState({ status: 'connecting' });

    const socket = makeWASocket({
      auth: state,
      browser: baileys.Browsers?.ubuntu('Desktop') ?? ['Ubuntu', 'Desktop', '22.04.4'],
      // Override hardcoded protocol version — Baileys ships with an outdated
      // version (1027934701) that WhatsApp rejects with 405. See:
      // https://github.com/WhiskeySockets/Baileys/issues/2376
      version: [2, 3000, 1034074495],
      syncFullHistory: true,
    });

    this.socket = socket;

    // ── Connection updates ─────────────────────────────────
    socket.ev.on('connection.update', (update) => {
      console.log('[BAILEYS] connection.update:', JSON.stringify(update));
      const { connection, lastDisconnect, qr } = update;

      // If we have a phone number and registration is needed, request pairing code
      if (qr && this.phoneNumber && !this.pairingCodeRequested) {
        this.pairingCodeRequested = true;
        console.log('[BAILEYS] Requesting pairing code for:', this.phoneNumber);
        socket.requestPairingCode(this.phoneNumber)
          .then((code: string) => {
            console.log('[BAILEYS] Pairing code received:', code);
            this.setState({ status: 'pairing-code', code });
          })
          .catch((err: unknown) => {
            console.error('[BAILEYS] Pairing code request failed:', err);
            this.setState({ status: 'error', message: `Pairing code failed: ${err}` });
          });
      } else if (qr && !this.phoneNumber) {
        // QR code fallback
        console.log('[BAILEYS] QR received, length:', qr.length);
        QRCode.toString(qr, { type: 'svg', margin: 2 })
          .then((svg: string) => {
            const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
            this.setState({ status: 'qr', qrData: dataUrl });
          })
          .catch((err: unknown) => {
            console.error('QR generation failed:', err);
            this.setState({ status: 'qr', qrData: '' });
          });
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;

        this.socket = null;
        this.pairingCodeRequested = false;

        if (loggedOut) {
          this.setState({ status: 'disconnected' });
        } else {
          this.setState({ status: 'connecting' });
          setTimeout(() => this.connect(this.phoneNumber ?? undefined), 3000);
        }
      }

      if (connection === 'open') {
        const phone = socket.user?.id?.split(':')[0] ?? 'unknown';
        this.setState({ status: 'connected', phoneNumber: phone });
      }
    });

    // ── Credential persistence ─────────────────────────────
    socket.ev.on('creds.update', saveCreds);

    // ── History sync (bulk chat + message data on first connect) ──
    socket.ev.on('messaging-history.set', (event) => {
      console.log(`[BAILEYS] History sync: ${event.chats.length} chats, ${event.contacts.length} contacts, ${event.messages.length} messages`);

      // Debug contact structure
      if (event.contacts.length > 0) {
        console.log(`[BAILEYS] Contact keys: ${Object.keys(event.contacts[0]).join(', ')}`);
        console.log(`[BAILEYS] Contact sample: ${JSON.stringify(event.contacts[0]).slice(0, 300)}`);
      }

      // Build a contact name lookup from the contacts array
      for (const contact of event.contacts) {
        const c = contact as any;
        const cName = c.name || c.notify || c.pushName || c.verifiedName;
        if (contact.id && cName) {
          this.contactNames.set(contact.id, cName);
        }
      }

      // Emit messages from history
      const normalized = event.messages
        .map((msg) => this.normalizeMessage(msg))
        .filter((m): m is ChatMessage => m !== null);

      if (normalized.length > 0) {
        this.emit('messages', normalized);
      }

      // Emit chat metadata with actual names
      // Debug: log raw chat object keys to find where names are stored
      if (event.chats.length > 0) {
        const sample = event.chats[0];
        console.log(`[BAILEYS] Chat object keys: ${Object.keys(sample).join(', ')}`);
        console.log(`[BAILEYS] Chat sample (first): ${JSON.stringify(sample).slice(0, 500)}`);
        // Also check a group if available
        const groupSample = event.chats.find((c: any) => c.id?.endsWith('@g.us'));
        if (groupSample) {
          console.log(`[BAILEYS] Group sample: ${JSON.stringify(groupSample).slice(0, 500)}`);
        }
      }

      // Collect group IDs to fetch metadata for names
      const groupIds: string[] = [];

      for (const chat of event.chats) {
        if (chat.id) {
          const c = chat as any;
          const isGroup = chat.id.endsWith('@g.us');

          // Use contact name for 1:1 chats
          let name: string | undefined;
          if (!isGroup) {
            name = this.contactNames.get(chat.id);
          }
          if (!name) {
            name = isGroup ? 'Group' : chat.id.split('@')[0].replace(/^(\d{1,3})(\d+)/, '+$1 $2');
          }

          if (isGroup) {
            groupIds.push(chat.id);
          }

          // Use lastMessageRecvTimestamp (the actual field in Baileys v7)
          const lastTs = c.lastMessageRecvTimestamp
            ? typeof c.lastMessageRecvTimestamp === 'number'
              ? c.lastMessageRecvTimestamp
              : Number(c.lastMessageRecvTimestamp)
            : 0;

          this.emit('messages', [{
            id: `chat-meta-${chat.id}`,
            chatId: chat.id,
            senderJid: 'chat-meta',
            senderName: name,
            body: '',
            timestamp: lastTs || Math.floor(Date.now() / 1000),
            fromMe: false,
          }]);
        }
      }

      // Fetch group names via groupMetadata (not in history sync data)
      if (socket && groupIds.length > 0) {
        (async () => {
          console.log(`[BAILEYS] Fetching metadata for ${groupIds.length} groups...`);
          const batchSize = 5;
          for (let i = 0; i < groupIds.length; i += batchSize) {
            const batch = groupIds.slice(i, i + batchSize);
            for (const gid of batch) {
              try {
                const meta = await socket.groupMetadata(gid);
                if (meta.subject) {
                  this.emit('messages', [{
                    id: `group-meta-${gid}-${Date.now()}`,
                    chatId: gid,
                    senderJid: 'chat-meta',
                    senderName: meta.subject,
                    body: '',
                    timestamp: Math.floor(Date.now() / 1000),
                    fromMe: false,
                  }]);
                }
              } catch {
                // Can fail for old/left groups
              }
            }
            if (i + batchSize < groupIds.length) {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
          console.log(`[BAILEYS] Group metadata fetch complete`);
        })().catch((err) => console.error('[BAILEYS] Group metadata fetch error:', err));
      }
    });

    // ── Chat updates (group names often arrive here after initial sync) ──
    socket.ev.on('chats.update' as any, (updates: any[]) => {
      for (const update of updates) {
        if (update.id) {
          const name = update.name || update.subject || update.pushName || update.formattedTitle;
          if (name) {
            this.emit('messages', [{
              id: `chat-update-${update.id}-${Date.now()}`,
              chatId: update.id,
              senderJid: 'chat-meta',
              senderName: name,
              body: '',
              timestamp: Math.floor(Date.now() / 1000),
              fromMe: false,
            }]);
          }
        }
      }
    });

    // ── Group metadata updates ──
    socket.ev.on('groups.update' as any, (updates: any[]) => {
      for (const update of updates) {
        if (update.id && update.subject) {
          this.emit('messages', [{
            id: `group-update-${update.id}-${Date.now()}`,
            chatId: update.id,
            senderJid: 'chat-meta',
            senderName: update.subject,
            body: '',
            timestamp: Math.floor(Date.now() / 1000),
            fromMe: false,
          }]);
        }
      }
    });

    // ── New incoming messages ──────────────────────────────
    socket.ev.on('messages.upsert', (event: BaileysEventMap['messages.upsert']) => {
      const normalized = event.messages
        .map((msg) => this.normalizeMessage(msg))
        .filter((m): m is ChatMessage => m !== null);

      if (normalized.length > 0) {
        this.emit('messages', normalized);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }
    this.phoneNumber = null;
    this.pairingCodeRequested = false;
    this.setState({ status: 'disconnected' });
  }

  private setState(newState: ConnectionState): void {
    this.state = newState;
    this.emit('connection-state', newState);
  }

  private normalizeMessage(msg: WAMessage): ChatMessage | null {
    const m = msg.message;
    const body =
      m?.conversation ||
      m?.extendedTextMessage?.text ||
      m?.imageMessage?.caption ||
      m?.videoMessage?.caption ||
      m?.documentMessage?.caption ||
      m?.documentMessage?.fileName ||
      m?.listResponseMessage?.title ||
      m?.buttonsResponseMessage?.selectedDisplayText ||
      null;

    if (!body) return null;

    const chatId = msg.key.remoteJid;
    if (!chatId) return null;

    return {
      id: msg.key.id ?? `${Date.now()}-${Math.random()}`,
      chatId,
      senderJid: msg.key.fromMe ? 'me' : (msg.key.participant ?? chatId),
      senderName: msg.pushName
        || this.contactNames.get(msg.key.participant ?? chatId)
        || this.contactNames.get(chatId)
        || chatId.split('@')[0],
      body,
      timestamp: msg.messageTimestamp
        ? typeof msg.messageTimestamp === 'number'
          ? msg.messageTimestamp
          : Number(msg.messageTimestamp)
        : Math.floor(Date.now() / 1000),
      fromMe: msg.key.fromMe ?? false,
    };
  }
}
