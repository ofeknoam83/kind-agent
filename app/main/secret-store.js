
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
class SecretStore {
  constructor() { this.file = null; }
  init(baseDir) {
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    this.file = path.join(baseDir, 'secrets.json');
    if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, '{}', 'utf8');
  }
  readRaw() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { return {}; }
  }
  writeRaw(obj) { fs.writeFileSync(this.file, JSON.stringify(obj, null, 2), 'utf8'); }
  setSecret(key, value) {
    const raw = this.readRaw();
    if (!value) {
      delete raw[key];
      this.writeRaw(raw);
      return true;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this machine');
    }
    const encrypted = safeStorage.encryptString(value).toString('latin1');
    raw[key] = encrypted;
    this.writeRaw(raw);
    return true;
  }
  getSecret(key) {
    const raw = this.readRaw();
    if (!raw[key]) return '';
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(raw[key], 'latin1'));
  }
  hasSecret(key) {
    const raw = this.readRaw();
    return !!raw[key];
  }
}
module.exports = new SecretStore();
