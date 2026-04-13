const fs = require('fs');
const path = require('path');
let lib = null;
let QRCode = null;
try { lib = require('baileys'); QRCode = require('qrcode'); } catch (e) {}
class BaileysService {
  constructor() {
    this.sock = null;
    this.handlers = [];
    this.status = { state: 'not-installed', provider: 'baileys', qrDataUrl: null, note: 'Installer build must install dependencies first' };
    this.authDir = path.join(process.cwd(), '.kinds-agent-auth');
  }
  onMessage(handler) { this.handlers.push(handler); }
  extractText(message) {
    const m = message?.message || {};
    return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
  }
  async connect() {
    if (!lib) return this.status;
    if (this.sock) return this.status;
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = lib;
    if (!fs.existsSync(this.authDir)) fs.mkdirSync(this.authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    this.sock = makeWASocket({ auth: state, printQRInTerminal: false, syncFullHistory: false });
    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        const payload = {
          id: msg.key?.id || `${Date.now()}-${Math.random()}`,
          chat_id: msg.key?.remoteJid || 'unknown',
          sender: msg.key?.participant || msg.key?.remoteJid || 'unknown',
          timestamp: new Date((msg.messageTimestamp || 0) * 1000).toISOString(),
          text: this.extractText(msg),
          message_type: Object.keys(msg.message || {})[0] || 'unknown',
          from_me: msg.key?.fromMe ? 1 : 0
        };
        this.handlers.forEach(fn => fn(payload));
      }
    });
    this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr && QRCode) {
        this.status.qrDataUrl = await QRCode.toDataURL(qr);
        this.status.state = 'qr-ready';
        this.status.note = 'Scan this QR from WhatsApp > Linked Devices';
      }
      if (connection === 'open') {
        this.status.state = 'connected';
        this.status.note = 'Connected';
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.restartRequired) {
          this.sock = null;
          this.status.state = 'restarting';
          await this.connect();
        } else {
          this.status.state = 'closed';
          this.status.note = 'Connection closed';
        }
      }
    });
    this.status.state = 'connecting';
    this.status.note = 'Initializing';
    return this.status;
  }
  getStatus() { return this.status; }
  getQrCode() { return { image: this.status.qrDataUrl, state: this.status.state, note: this.status.note }; }
}
module.exports = new BaileysService();
