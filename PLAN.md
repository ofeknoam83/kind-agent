# WhatsApp Summarizer — Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Baileys      │  │  SQLite DB   │  │  Summarization Engine  │ │
│  │  Client       │  │  (WAL mode)  │  │  ┌──────────────────┐ │ │
│  │  ┌──────────┐ │  │  ┌─────────┐ │  │  │  Routing Engine  │ │ │
│  │  │ WA Socket│ │  │  │ Repos   │ │  │  │  ┌────────────┐ │ │ │
│  │  └──────────┘ │  │  └─────────┘ │  │  │  │ Features   │ │ │ │
│  └──────────────┘  └──────────────┘  │  │  │ Scoring    │ │ │ │
│                                       │  │  │ Policy     │ │ │ │
│                                       │  │  └────────────┘ │ │ │
│                                       │  └──────────────────┘ │ │
│                                       │  ┌──────────────────┐ │ │
│                                       │  │  Providers       │ │ │
│                                       │  │  ├─ OpenAI       │ │ │
│                                       │  │  ├─ LM Studio    │ │ │
│                                       │  │  └─ Ollama       │ │ │
│                                       │  └──────────────────┘ │ │
│                                       └────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  IPC Handlers (Zod-validated)                            │    │
│  └──────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  Preload (contextBridge — minimal typed API)                    │
├─────────────────────────────────────────────────────────────────┤
│  Renderer (React, sandboxed, no Node.js)                        │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ Chat   │ │ Chat     │ │ Summary  │ │ Settings / Provider  │ │
│  │ List   │ │ View     │ │ Panel    │ │ Management           │ │
│  └────────┘ └──────────┘ └──────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Repo Scaffolding

**Status: COMPLETE**

### Tasks
- [x] Initialize TypeScript Electron project with Electron Forge + Vite
- [x] Configure `tsconfig.json` with path aliases (`@shared`, `@main`, `@db`, etc.)
- [x] Set up Vite configs for main, preload, and renderer
- [x] Configure `.gitignore` (node_modules, auth state, .db files, .env)
- [x] Define `package.json` with all dependencies

### Key Decisions
- **Electron Forge** over electron-builder: better Vite integration, first-party support
- **Vite** over Webpack: faster HMR, simpler config, native ESM
- **better-sqlite3** over sql.js: native performance, WAL mode, prepared statements
- **Zod** for runtime validation: type-safe IPC, no codegen step

### Directory Structure
```
src/
├── main/              # Electron main process
│   ├── index.ts       # App entry, window creation, CSP
│   ├── ipc-handlers.ts # All IPC handler registrations
│   └── keychain.ts    # OS keychain via safeStorage
├── preload/
│   ├── index.ts       # contextBridge API
│   └── types.d.ts     # Window augmentation for renderer
├── renderer/
│   ├── index.html
│   ├── main.tsx
│   ├── components/    # React components
│   ├── hooks/         # useApi, useConnection, useChats, useSummarize
│   └── styles/        # Global CSS
├── shared/
│   ├── types/         # ChatMessage, Summary, Provider, Connection
│   ├── ipc/           # Channel registry, Zod validators
│   └── constants/     # Defaults, limits
├── db/
│   ├── schema.sql     # DDL
│   ├── connection.ts  # Singleton, WAL, migrations
│   └── repositories/  # ChatRepo, SummaryRepo, ProviderRepo
├── providers/
│   ├── base.ts        # Interface, system prompt, transcript formatter
│   ├── openai-provider.ts
│   ├── lmstudio-provider.ts
│   ├── ollama-provider.ts
│   └── provider-factory.ts
├── connector/
│   └── whatsapp/
│       └── baileys-client.ts  # Baileys wrapper with event normalization
└── routing/                   # Intelligent backend routing engine
    ├── types.ts
    ├── features.ts
    ├── scoring.ts
    ├── policy.ts
    ├── backend-registry.ts
    ├── feedback.ts
    ├── logger.ts
    └── router.ts
```

---

## Phase 1: WhatsApp Integration (Baileys)

### Tasks
- [x] Wrap `@whiskeysockets/baileys` in `BaileysClient` class
- [ ] Handle QR code pairing flow (generate QR -> display in renderer)
- [ ] Persist auth state to `userData/auth_info_baileys/`
- [ ] Normalize WAMessage -> ChatMessage (text-only, skip media)
- [ ] Auto-reconnect on transient disconnects (3s backoff)
- [ ] Handle `loggedOut` disconnect (clear auth, show re-pair)
- [ ] Batch incoming messages and emit to main process

### Data Flow
```
WhatsApp Cloud → Baileys Socket → BaileysClient.normalizeMessage()
  → emit('messages', ChatMessage[])
  → IPC handler persists to SQLite
  → webContents.send('event:new-messages') to renderer
```

### Risks
- Baileys is unofficial — WhatsApp can break it at any time
- Multi-device beta auth can expire after ~14 days of inactivity
- History sync is noisy — we filter to `type: 'notify'` only

---

## Phase 2: Storage Layer (SQLite)

### Tasks
- [x] Define schema (chats, messages, summaries, provider_configs)
- [x] Implement connection singleton with WAL mode
- [x] Build ChatRepository (upsert + batch insert in transaction)
- [x] Build SummaryRepository (insert, list, get latest)
- [x] Build ProviderRepository (list, update, activate)
- [ ] Add migration versioning system (schema_version table)
- [ ] Add VACUUM on app startup if DB > 100MB

### Schema Design Decisions
- **Timestamps as INTEGER (unix epoch)**: No timezone bugs, fast indexing
- **JSON columns for action_items/unresolved_questions**: Avoids join tables for structured but rarely queried data
- **INSERT OR IGNORE for messages**: Idempotent — safe to replay
- **WAL journal mode**: Concurrent reads during writes, critical for not blocking UI

### Indexes
- `idx_messages_chat_ts`: Primary query path (messages by chat, newest first)
- `idx_summaries_chat`: Summary history per chat

---

## Phase 3: IPC + Preload API Design

### Tasks
- [x] Define exhaustive channel registry in `shared/ipc/channels.ts`
- [x] Create Zod validators for every channel that accepts input
- [x] Build `withValidation()` helper for main-process handlers
- [x] Build typed preload bridge with `contextBridge.exposeInMainWorld`
- [x] Create push event system (main -> renderer) for connection state and new messages
- [ ] Add rate limiting on summarization requests (max 1 concurrent per chat)

### Security Contract
1. **Channel allowlist**: Only channels in `IpcChannels` can be invoked
2. **Input validation**: Every payload parsed through Zod before processing
3. **No raw ipcRenderer**: Renderer only sees `window.electronApi`
4. **No secrets in renderer**: API keys never cross the preload boundary
5. **Structured errors**: Renderer gets `{ error: string }`, never stack traces

### IPC Channel Map
| Channel | Direction | Validated | Description |
|---------|-----------|-----------|-------------|
| `whatsapp:connect` | invoke | No input | Start Baileys connection |
| `whatsapp:disconnect` | invoke | No input | Tear down connection |
| `whatsapp:get-state` | invoke | No input | Poll connection state |
| `chats:list` | invoke | No input | List all chats with message counts |
| `chats:get-messages` | invoke | Zod | Paginated messages for a chat |
| `summarize:run` | invoke | Zod | Trigger summarization |
| `summarize:list` | invoke | Zod | Summary history for a chat |
| `summarize:get` | invoke | Zod | Get single summary by ID |
| `providers:list` | invoke | No input | List provider configs |
| `providers:update` | invoke | Zod | Update provider settings |
| `providers:health` | invoke | Optional | Health check providers |
| `providers:set-api-key` | invoke | Zod | Store key in OS keychain |

---

## Phase 4: Summarization Engine + Provider Abstraction

### Tasks
- [x] Define `SummarizationProvider` interface
- [x] Implement OpenAI provider (chat completions, JSON mode)
- [x] Implement LM Studio provider (OpenAI-compatible API)
- [x] Implement Ollama provider (native /api/chat endpoint)
- [x] Build provider factory with API key injection from keychain
- [ ] Build routing engine (see Routing Engine section below)
- [ ] Add retry with exponential backoff (2 retries, 2s/4s)
- [ ] Add response validation (ensure JSON structure matches schema)
- [ ] Implement incremental summarization (feed previous summary as context)
- [ ] Add token estimation to avoid exceeding model context windows

### Provider Comparison
| Feature | OpenAI | LM Studio | Ollama |
|---------|--------|-----------|--------|
| JSON mode | `response_format` | Varies | `format: "json"` |
| Auth | API key | None | None |
| Timeout | 120s | 300s | 300s |
| Models endpoint | `/v1/models` | `/v1/models` | `/api/tags` |
| Chat endpoint | `/v1/chat/completions` | `/v1/chat/completions` | `/api/chat` |

---

## Phase 5: UI (React)

### Tasks
- [x] Create App shell with sidebar + main content layout
- [x] Build ConnectionPanel (status indicator, connect/disconnect, QR display)
- [x] Build ChatList (sorted by last message, message count badges)
- [x] Build ChatView (message list + summary panel)
- [x] Build SummaryPanel (generate, view, action items, unresolved questions)
- [x] Build SettingsPanel (provider config, health checks, API key input)
- [ ] Add QR code rendering (use `qrcode` library to render data URI)
- [ ] Add loading states and skeleton screens
- [ ] Add keyboard navigation (up/down to switch chats, Cmd+Enter to summarize)
- [ ] Add summary history drawer (view past summaries for a chat)

### Component Tree
```
App
├── ConnectionPanel (WhatsApp status + controls)
├── ChatList (sidebar)
├── ChatView
│   ├── SummaryPanel (summary + action items + unresolved questions)
│   └── MessageList (scrollable, newest at bottom)
└── SettingsPanel (provider management)
```

---

## Phase 6: Security Hardening

### Electron Security Checklist
- [x] `contextIsolation: true` — renderer runs in isolated JS world
- [x] `nodeIntegration: false` — no `require()` in renderer
- [x] `sandbox: true` — OS-level process sandboxing
- [x] `webSecurity: true` — enforce same-origin policy
- [x] `webviewTag: false` — disable <webview> (XSS vector)
- [x] `navigateOnDragDrop: false` — prevent file:// navigation
- [x] Block `will-navigate` — prevent renderer navigation
- [x] Block `window.open` — deny new window creation
- [x] CSP via `onHeadersReceived` — no inline scripts, no eval
- [x] API keys in OS keychain via `safeStorage` — never on disk in plaintext
- [x] Single instance lock — prevent multiple Baileys connections

### Content Security Policy
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self';
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'none';
frame-ancestors 'none';
```

### Additional Hardening (TODO)
- [ ] Pin Electron version and audit with `electron-audit`
- [ ] Add ASAR integrity verification
- [ ] Implement IPC rate limiting (prevent renderer from flooding main)
- [ ] Add request origin validation on IPC (verify sender is our window)
- [ ] Strip sensitive data from crash reports

---

## Phase 7: Packaging (Mac Distribution)

### Tasks
- [ ] Configure Electron Forge makers (DMG + ZIP)
- [ ] Set up code signing with Apple Developer cert
- [ ] Configure notarization via `@electron/notarize`
- [ ] Add auto-updater via `electron-updater` (optional, self-hosted)
- [ ] Configure app icon (1024x1024 ICNS)
- [ ] Set `LSMinimumSystemVersion` to macOS 12+
- [ ] Test universal binary (arm64 + x64) with `better-sqlite3` native rebuild
- [ ] Add `postinstall` script for `electron-rebuild` of native modules

### Packaging Config
- **ASAR**: Enabled (bundled app archive)
- **DMG format**: ULFO (compressed, fast)
- **App bundle ID**: `com.local.whatsapp-summarizer`
- **Title bar**: `hiddenInset` (native macOS look)

---

## Testing Strategy

### Unit Tests (Vitest)
- [ ] Zod validators: test valid/invalid payloads for every channel
- [ ] `parseProviderResponse()`: test valid JSON, markdown-wrapped JSON, malformed input
- [ ] `formatTranscript()`: test message formatting, edge cases (empty, unicode)
- [ ] Repository classes: test against in-memory SQLite
- [ ] Routing engine: test feature extraction, scoring, policy decisions

### Integration Tests
- [ ] Mock Baileys socket → verify messages are normalized and persisted
- [ ] Mock provider HTTP responses → verify summarization pipeline end-to-end
- [ ] Mock IPC → verify handler validates input and returns correct shapes
- [ ] Routing engine: simulate backend failures → verify fallback behavior

### E2E Tests (Playwright)
- [ ] App launches without errors
- [ ] Settings panel renders provider list
- [ ] Provider health check displays results
- [ ] Chat list populates after connection (mocked)
- [ ] Summary generation completes and displays results

### Test File Structure
```
test/
├── unit/
│   ├── validators.test.ts
│   ├── provider-response.test.ts
│   ├── transcript.test.ts
│   ├── chat-repository.test.ts
│   ├── summary-repository.test.ts
│   ├── routing-features.test.ts
│   ├── routing-scoring.test.ts
│   └── routing-policy.test.ts
├── integration/
│   ├── baileys-mock.test.ts
│   ├── summarize-pipeline.test.ts
│   ├── ipc-handlers.test.ts
│   └── routing-simulation.test.ts
└── e2e/
    ├── app-launch.spec.ts
    ├── settings.spec.ts
    └── summarize-flow.spec.ts
```

---

## Performance Considerations

### Message Batching
- Baileys can emit hundreds of messages during history sync
- `ChatRepository.upsertChatWithMessages()` wraps batch in a transaction
- SQLite transaction = single fsync, regardless of message count

### Incremental Summarization
- Don't re-summarize the entire chat history each time
- Store `time_range_end` on each summary
- Next summarization starts from `afterTimestamp = lastSummary.timeRange[1]`
- Pass previous summary text as context to the LLM

### Avoiding UI Blocking
- All IPC handlers are async — heavy work (LLM calls, DB writes) doesn't block the renderer
- Summarization progress pushed via events (renderer shows spinner)
- Message list uses virtual scrolling for chats with 1000+ messages (TODO)
- SQLite WAL mode allows concurrent reads during writes

### Token Management
- Estimate tokens before sending to provider (~4 chars/token for English)
- If transcript exceeds model context, truncate oldest messages
- `MAX_MESSAGES_PER_SUMMARY = 2000` as a hard cap

### Routing Engine Performance
- Feature extraction is pure computation — cached per request
- Backend health checks run in parallel with `Promise.allSettled`
- Feedback loop writes are batched, not per-request
- Router decision runs in <1ms (no async, no I/O)

---

## Execution Order (Engineering Tasks)

### Sprint 1: Foundation
1. ~~Repo scaffolding (Phase 0)~~
2. ~~SQLite schema + repositories (Phase 2)~~
3. ~~IPC channel registry + validators (Phase 3)~~
4. ~~Preload bridge (Phase 3)~~
5. ~~Provider interface + implementations (Phase 4)~~

### Sprint 2: Connectivity
6. Baileys QR code rendering in renderer
7. Connection state machine (connect → QR → paired → active)
8. Message persistence pipeline (Baileys → normalize → SQLite)
9. Chat list population from stored data

### Sprint 3: Summarization
10. End-to-end summarization flow (select chat → run → display)
11. Incremental summarization with previous context
12. Routing engine integration
13. Token estimation and context window management

### Sprint 4: Polish
14. Error handling and retry logic across all providers
15. Loading states, skeleton screens, keyboard navigation
16. Summary history viewer
17. Provider health monitoring in settings

### Sprint 5: Ship
18. Code signing + notarization
19. DMG packaging + universal binary
20. E2E test suite
21. Performance profiling (large chat histories)
