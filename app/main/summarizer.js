
let OpenAI;
try { ({ OpenAI } = require('openai')); } catch (e) {}
async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
async function postJson(url, body, headers = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
function heuristic(messages) {
  const lines = messages.filter(m => m.text).slice(0, 12).map(m => m.text);
  return { summary: lines.length ? `Recent activity: ${lines.slice(0, 3).join(' · ')}` : 'No text messages captured yet.', bullets: lines.slice(0, 5), actions: lines.filter(t => /need|please|confirm|send|pickup|call|tomorrow|meet/i.test(t)).slice(0, 5) };
}
function buildPrompt(messages) {
  const recent = messages
    .filter(m => m.text)
    .slice(0, 120)
    .reverse()
    .map(m => `${m.sender}: ${m.text}`)
    .join('\n');

  return `You summarize WhatsApp chats extremely well. Return strict JSON with keys summary, bullets, actions. bullets and actions must be arrays of short strings. Focus on what matters, compress repetition, identify decisions, commitments, plans, time-sensitive items, and unresolved points.

CHAT:
${recent}`;
}
async function summarizeOpenAI(messages, settings, secrets) {
  if (!OpenAI || !secrets.openaiApiKey) return heuristic(messages);
  const client = new OpenAI({ apiKey: secrets.openaiApiKey });
  const response = await client.responses.create({ model: settings.openaiModel || 'gpt-4.1-mini', input: buildPrompt(messages) });
  const parsed = JSON.parse(response.output_text || '{}');
  return { summary: parsed.summary || 'No summary available.', bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [], actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
}
async function summarizeLMStudio(messages, settings) {
  const data = await postJson(`${settings.lmStudioBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    model: settings.lmStudioModel || 'local-model', temperature: 0.2,
    messages: [{ role: 'system', content: 'You are an elite chat summarizer. Return strict JSON only.' }, { role: 'user', content: buildPrompt(messages) }]
  }, { Authorization: 'Bearer lm-studio' });
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
  return { summary: parsed.summary || 'No summary available.', bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [], actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
}
async function summarizeOllama(messages, settings) {
  const data = await postJson(`${settings.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`, {
    model: settings.ollamaModel || 'qwen3:latest', stream: false,
    format: { type: 'object', properties: { summary: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } }, actions: { type: 'array', items: { type: 'string' } } }, required: ['summary','bullets','actions'] },
    messages: [{ role: 'system', content: 'You are an elite WhatsApp chat summarizer. Return strict JSON only.' }, { role: 'user', content: buildPrompt(messages) }]
  });
  const parsed = JSON.parse(data?.message?.content || '{}');
  return { summary: parsed.summary || 'No summary available.', bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [], actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
}
async function summarize(messages, settings, secrets) {
  try {
    if (!messages?.length) return heuristic(messages || []);
    if (settings.backend === 'lmstudio') return await summarizeLMStudio(messages, settings);
    if (settings.backend === 'ollama') return await summarizeOllama(messages, settings);
    return await summarizeOpenAI(messages, settings, secrets);
  } catch (e) {
    return heuristic(messages || []);
  }
}
async function testBackend(settings, secrets) {
  try {
    if (settings.backend === 'openai') {
      if (!secrets.openaiApiKey) return { ok: false, message: 'No OpenAI key saved locally' };
      return { ok: true, message: `OpenAI key is stored securely. Model: ${settings.openaiModel || 'gpt-4.1-mini'}` };
    }
    if (settings.backend === 'lmstudio') {
      const base = settings.lmStudioBaseUrl.replace(/\/$/, '');
      const data = await getJson(base.replace(/\/v1$/, '') + '/api/v0/models');
      const models = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return { ok: true, message: `LM Studio reachable. Found ${models.length} models.`, models: models.map(m => m.id || m.modelKey || m.name).filter(Boolean) };
    }
    if (settings.backend === 'ollama') {
      const data = await getJson(settings.ollamaBaseUrl.replace(/\/$/, '') + '/api/tags');
      const models = Array.isArray(data?.models) ? data.models.map(m => m.name).filter(Boolean) : [];
      return { ok: true, message: `Ollama reachable. Found ${models.length} models.`, models };
    }
    return { ok: false, message: 'Unknown backend' };
  } catch (e) {
    return { ok: false, message: e.message || 'Connection failed' };
  }
}
async function discoverModels(settings) {
  try {
    if (settings.backend === 'lmstudio') {
      const base = settings.lmStudioBaseUrl.replace(/\/$/, '');
      const data = await getJson(base.replace(/\/v1$/, '') + '/api/v0/models');
      const models = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return { backend: 'lmstudio', models: models.map(m => m.id || m.modelKey || m.name).filter(Boolean) };
    }
    if (settings.backend === 'ollama') {
      const data = await getJson(settings.ollamaBaseUrl.replace(/\/$/, '') + '/api/tags');
      return { backend: 'ollama', models: Array.isArray(data?.models) ? data.models.map(m => m.name).filter(Boolean) : [] };
    }
    return { backend: 'openai', models: ['gpt-4.1-mini', 'gpt-4.1'] };
  } catch (e) {
    return { backend: settings.backend, models: [], error: e.message || 'Failed to load models' };
  }
}
module.exports = { summarize, testBackend, discoverModels };
