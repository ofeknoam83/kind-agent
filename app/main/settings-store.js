
const fs = require('fs');
const path = require('path');
class SettingsStore {
  constructor() {
    this.file = null;
    this.state = {
      firstRunCompleted: false,
      backend: 'openai',
      openaiModel: 'gpt-4.1-mini',
      lmStudioBaseUrl: 'http://127.0.0.1:1234/v1',
      lmStudioModel: '',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen3:latest'
    };
  }
  init(baseDir) {
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    this.file = path.join(baseDir, 'settings.json');
    if (fs.existsSync(this.file)) {
      try { this.state = { ...this.state, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch (e) {}
    } else {
      this.save(this.state);
    }
  }
  get() { return this.state; }
  save(next) {
    this.state = { ...this.state, ...next };
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), 'utf8');
    return this.state;
  }
}
module.exports = new SettingsStore();
