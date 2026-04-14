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
      console.log(`[BAILEYS] History sync: ${event.chats.length} chats, ${event.messages.length} messages`);

      // Emit messages from history
      const normalized = event.messages
        .map((msg) => this.normalizeMessage(msg))
        .filter((m): m is ChatMessage => m !== null);

      if (normalized.length > 0) {
        this.emit('messages', normalized);
      }

      // Emit chat metadata (name, group status)
      for (const chat of event.chats) {
        if (chat.id && chat.name) {
          // Emit a synthetic message to register the chat in the DB
          this.emit('messages', [{
            id: `chat-meta-${chat.id}`,
            chatId: chat.id,
            senderJid: 'system',
            senderName: chat.name,
            body: '', // Empty body — just registers the chat
            timestamp: chat.conversationTimestamp
              ? typeof chat.conversationTimestamp === 'number'
                ? chat.conversationTimestamp
                : Number(chat.conversationTimestamp)
              : Math.floor(Date.now() / 1000),
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
    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      null;

    if (!body) return null;

    const chatId = msg.key.remoteJid;
    if (!chatId) return null;

    return {
      id: msg.key.id ?? `${Date.now()}-${Math.random()}`,
      chatId,
      senderJid: msg.key.fromMe ? 'me' : (msg.key.participant ?? chatId),
      senderName: msg.pushName ?? 'Unknown',
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
