import * as baileys from '@whiskeysockets/baileys';
import type { WASocket, BaileysEventMap, WAMessage } from '@whiskeysockets/baileys';

// Baileys is externalized — Vite's namespace interop puts the CJS module
// object at .default (not a function). Named exports like .makeWASocket
// are the actual functions.
const makeWASocket = baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason } = baileys;

// @hapi/boom is externalized too
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

/**
 * Wraps Baileys into a clean, Electron-friendly interface.
 *
 * Responsibilities:
 * - Manages socket lifecycle (connect, disconnect, reconnect)
 * - Emits normalized events (connection state, new messages)
 * - Converts Baileys message format -> our ChatMessage type
 * - Handles QR code generation for pairing
 *
 * Does NOT touch the database — that's the caller's job.
 */
export class BaileysClient extends EventEmitter<BaileysClientEvents> {
  private socket: WASocket | null = null;
  private state: ConnectionState = { status: 'disconnected' };

  getState(): ConnectionState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.socket) {
      return; // Already connected or connecting
    }

    const authDir = path.join(app.getPath('userData'), AUTH_DIR);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    this.setState({ status: 'connecting' });

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['WhatsApp Summarizer', 'Desktop', '1.0.0'],
      // Reduce noise: only sync recent messages
      syncFullHistory: false,
    });

    this.socket = socket;

    // ── Connection updates ─────────────────────────────────
    socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Convert raw QR string to a scannable data URL
        QRCode.toDataURL(qr, { width: 280, margin: 2 })
          .then((url: string) => this.setState({ status: 'qr', qrData: url }))
          .catch((err: unknown) => {
            console.error('QR generation failed:', err);
            this.setState({ status: 'qr', qrData: qr });
          });
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;

        this.socket = null;

        if (loggedOut) {
          this.setState({ status: 'disconnected' });
        } else {
          // Auto-reconnect on transient failures
          this.setState({ status: 'connecting' });
          setTimeout(() => this.connect(), 3000);
        }
      }

      if (connection === 'open') {
        const phoneNumber = socket.user?.id?.split(':')[0] ?? 'unknown';
        this.setState({ status: 'connected', phoneNumber });
      }
    });

    // ── Credential persistence ─────────────────────────────
    socket.ev.on('creds.update', saveCreds);

    // ── Incoming messages ──────────────────────────────────
    socket.ev.on('messages.upsert', (event: BaileysEventMap['messages.upsert']) => {
      if (event.type !== 'notify') return; // Ignore history sync noise

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
    this.setState({ status: 'disconnected' });
  }

  // ── Internal ──────────────────────────────────────────────

  private setState(newState: ConnectionState): void {
    this.state = newState;
    this.emit('connection-state', newState);
  }

  /**
   * Convert a Baileys WAMessage to our ChatMessage.
   * Returns null for messages we can't or don't want to summarize
   * (images, stickers, protocol messages, etc.)
   */
  private normalizeMessage(msg: WAMessage): ChatMessage | null {
    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      null;

    if (!body) return null; // Skip non-text messages

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
