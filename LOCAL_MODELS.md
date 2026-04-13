# Local models for Kind's agent on macOS

If you want amazingly good summaries without OpenAI, the best path on Apple Silicon is to run a local model through **MLX** or a local app/runtime that exposes an OpenAI-compatible API. MLX is specifically optimized for Apple Silicon, and local-LLM tooling on Mac increasingly uses MLX because it runs on Apple's Metal-backed stack efficiently. [web:183][web:186]

## Best practical choices

### 1) Qwen 3 instruct family
Best balance of quality and speed for summarization.
- Recommended for strong summaries, extraction, and instruction following.
- Good choice when you want a serious summarizer rather than a tiny toy model.
- Strong long-context behavior is especially useful for messy chats.

A 2026 summarization comparison highlights **Qwen3-30B-A3B-Instruct-2507** as a top open model for summarization because of its text comprehension and long-context handling. [web:188]

### 2) Gemma 3 instruct
Good smaller option for MacBooks with less memory.
- Faster and lighter.
- Good fallback if Qwen feels too heavy.
- Usually weaker than top-tier larger models, but can still be good with strong prompts.

### 3) Llama family / GPT-OSS class
Use only if the machine is powerful enough.
- Potentially excellent, but heavier.
- Better for high-end Apple Silicon desktops or large-memory laptops.

## Recommendation by Mac class
- **16GB RAM Mac**: Gemma-class or small Qwen instruct model.
- **24GB–36GB RAM Mac**: Qwen 14B or similar mid-sized instruct model.
- **48GB+ RAM Mac**: Qwen 30B-A3B-class model is the best local target for quality-first summarization. [web:188][web:183]

## Best runtime choices

### Option A: LM Studio
Best GUI option for local models on Mac.
- Friendly UI.
- Can expose a localhost API.
- Recent LM Studio releases use MLX on Apple Silicon for speed improvements. [web:186]

### Option B: MLX directly
Best performance-oriented path if you are comfortable integrating a local inference server.
- More engineering work.
- Best Apple Silicon alignment. [web:183]

### Option C: Ollama
Simplest developer path for local HTTP integration.
- Popular and easy to wire into apps.
- Good fallback if you want broad model availability.
A 2026 local-LLM tools roundup describes Ollama as a go-to local runtime with broad model support and an OpenAI-compatible API style ecosystem around it. [web:182]

## How to make summaries amazingly good
Model choice matters, but quality depends even more on pipeline design:
1. Summarize only the relevant date range or message window.
2. Separate summary generation from action-item extraction.
3. Use rolling memory: previous summary + new messages.
4. Request structured JSON output every time.
5. Add chat-specific prompts, for example family logistics vs. work coordination.

## Suggested default for Kind's agent
For macOS friend-use:
- Default local runtime: **LM Studio** or **Ollama**.
- Default quality-first model: **Qwen instruct family**.
- Default fallback model: **Gemma instruct family**.

## Proposed integration path
The app should support 3 summary backends in settings:
- OpenAI
- Ollama local endpoint
- LM Studio local endpoint

That gives you strong offline/local options while keeping OpenAI as a premium quality fallback.
