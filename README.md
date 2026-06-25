# TokRate

A desktop application for benchmarking local LLMs via OpenAI-compatible APIs. Stream responses with live performance metrics, compare engines and quantizations side by side, and track results over time.

## Features

- **Playground** — Chat with any OpenAI-compatible model and watch real-time TPS, TTFT, and token metrics on a live chart
- **Compare** — Run the same prompt against multiple models, engines, or quantizations side by side
- **Benchmarks** — Create reusable suites of test prompts and get aggregate performance metrics
- **Compare engines** — Test Ollama, vLLM, llama.cpp, LM Studio, SGLang from one UI
- **History** — Save, search, and re-run past sessions
- **Leaderboard** — Publish anonymized results and browse community benchmarks
- **Thinking models** — Separate speed tracking for reasoning vs answering phases (DeepSeek-R1, QwQ)
- **Dark/light theme** — Persistent theme toggle

## Quick start

```bash
# Install
npm install

# Run in browser (no desktop build needed)
npm run dev

# Open http://localhost:1420
```

1. Go to **Settings** → click **+ Add Provider**
2. Enter your server URL (e.g. `http://localhost:11434` for Ollama) and a name
3. Click **Save** → click **⟳** to test the connection
4. Go to **Playground** → select your provider and model → type a message → press **Enter**

See `docs/guide.md` for a full user manual.

## Build for desktop (Windows, macOS, Linux)

```powershell
# Windows — MSVC linker required (one-time per session):
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:Path"

# Build the native app:
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/` — MSI and NSIS installers on Windows, DMG on macOS, AppImage/deb on Linux.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 (Composition API) + Vite |
| Desktop | Tauri v2 (Rust) |
| Charts | ECharts |
| State | Pinia |
| Routing | Vue Router |
| Storage | Tauri plugin-store (native) / localStorage (browser fallback) |
| API | OpenAI-compatible `/v1/chat/completions` (SSE streaming) |

## Project structure

```
src/
  api/          API client, SSE parser, leaderboard API
  components/   Reusable UI (MetricsBar, SpeedChart, Toasts, etc.)
  data/         Prompt templates
  router/       Vue Router config
  stores/       Pinia stores (config, history, suites, toast)
  styles/       CSS variables, markdown rendering
  types/        TypeScript interfaces
  utils/        Markdown renderer
  views/        Page components
src-tauri/      Rust backend (hardware detection, persistence)
leaderboard-worker/  Cloudflare Worker for community leaderboard
```

## Leaderboard backend

The leaderboard uses a Cloudflare Worker. To deploy:

```bash
cd leaderboard-worker
npm install
npx wrangler kv:namespace create LEADERBOARD
# Copy the KV namespace ID into wrangler.toml
npx wrangler deploy
```

Then update `src/api/leaderboard.ts` line 3 with your worker URL.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (browser mode) |
| `npm run build` | TypeScript check + production frontend build |
| `npm run tauri:dev` | Start Tauri dev (native window) |
| `npm run tauri:build` | Production build (installers) |
| `npm run typecheck` | TypeScript check only |
| `cargo check` | Rust check only |

## License

MIT
