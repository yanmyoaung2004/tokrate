# Implementation Plan: TokRate

## Overview

A Tauri + Vue 3 desktop app for benchmarking and interacting with local LLMs via OpenAI-compatible APIs. Users connect to any local inference engine (Ollama, vLLM, llama.cpp, LM Studio, SGLang), send prompts, and see real-time performance metrics (TTFT, TPOT, TPS) overlaid on live streaming responses. Compare engines, quantizations, and models side-by-side. Optionally publish anonymized results to a public leaderboard.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Desktop framework** | Tauri v2 (Rust) | Cross-platform native app, <10MB bundle, system webview, low memory overhead |
| **Frontend** | Vue 3 Composition API + Vite | Reactive UI, mature ecosystem, lightweight |
| **Charts** | ECharts | Better streaming/real-time charting support than Chart.js; handles high-frequency updates |
| **State management** | Pinia | Official Vue 3 state management, simple, TypeScript-first |
| **Streaming transport** | Server-Sent Events via `fetch` ReadableStream | Standard browser API, works with OpenAI SSE format, no extra deps |
| **Config storage** | Tauri `store` plugin (JSON on disk) | Simple key-value persistence, no DB needed |
| **Hardware detection** | `sysinfo` crate (Rust) | Cross-platform system info: RAM, GPU (basic), CPU |
| **API client layer** | TypeScript module, not a library | Full control over SSE parsing, metrics extraction, error handling |
| **Routing** | Vue Router | Simple page-based navigation: Playground, Compare, History, Settings, (future) Leaderboard |

---

## Phases & Tasks

### Phase 1: Foundation — Scaffold & Skeleton

---

#### Task 1.1: Scaffold Tauri + Vue 3 + Vite project

**Description:** Initialize the Tauri v2 project with Vue 3 frontend. Set up TypeScript, Pinia, Vue Router, ECharts. Verify the dev server and Tauri window both work.

**Acceptance criteria:**
- `npm run dev` starts Vite dev server
- `npm run tauri dev` opens a native window with the Vue app
- TypeScript compiles without errors
- Pinia store, Vue Router, ECharts are imported and functional in a smoke test

**Verification:**
- `npm run tauri dev` launches a window showing the app
- `npm run build` completes without errors

**Dependencies:** None

**Files likely touched:**
- `package.json`, `vite.config.ts`, `tsconfig.json`
- `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`
- `src/main.ts`, `src/App.vue`

**Estimated scope:** Medium (3-5 files)

---

#### Task 1.2: Define TypeScript types and API client

**Description:** Create the shared type definitions for the entire app: ChatMessage, StreamChunk, Metrics (TTFT, TPOT, TPS, token counts), EngineConfig, BenchmarkRun, ModelProfile. Build the core API client that connects to OpenAI-compatible `/chat/completions` with SSE streaming and parses chunks into typed metrics.

**Acceptance criteria:**
- All types are defined in `src/types/`
- API client connects to a configurable base URL
- Client sends a chat completion request and receives SSE stream
- Stream chunks are parsed into typed `StreamChunk` objects with incremental metrics
- TTFT is calculated from the first chunk's arrival time
- TPOT and TPS are calculated incrementally during streaming
- Errors (connection refused, auth failure, timeout) are surfaced as typed errors
- Works with Ollama, vLLM, llama.cpp, LM Studio, SGLang SSE formats
- Proprietary extensions (Ollama `eval_duration`, `prompt_eval_count`) are extracted when present

**Verification:**
- Unit tests for SSE parsing with mock stream data
- Manual test against a running Ollama instance
- Manual test against vLLM / llama.cpp (or documented how)

**Dependencies:** Task 1.1

**Files likely touched:**
- `src/types/chat.ts`
- `src/types/metrics.ts`
- `src/types/config.ts`
- `src/api/client.ts`
- `src/api/parser.ts`

**Estimated scope:** Medium (4-5 files)

---

#### Task 1.3: Build Tauri Rust backend — config, hardware detection, persistence

**Description:** Set up the Rust side of the app. Implement config management (server URL, API key, default model, theme) via Tauri store plugin. Expose hardware info (OS, CPU name, RAM, GPU name if detectable) via a Tauri command. Set up file-based persistence for saved benchmark runs (JSON storage).

**Acceptance criteria:**
- Config is persisted to disk and loaded on app start
- Tauri command `get_hardware_info` returns OS, CPU, RAM, GPU
- Tauri command `save_run` / `list_runs` / `delete_run` for benchmark results
- Commands are callable from the frontend via `invoke()`

**Verification:**
- Frontend calls `invoke('get_hardware_info')` and sees system info
- Config changes survive app restart
- Saved runs appear in listing after restart

**Dependencies:** Task 1.1

**Files likely touched:**
- `src-tauri/Cargo.toml` (add `store`, `sysinfo`, `serde`, `serde_json`)
- `src-tauri/src/main.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/config.rs`
- `src-tauri/src/storage.rs`

**Estimated scope:** Medium (5 files)

---

#### Task 1.4: Base UI layout — shell, routing, theme

**Description:** Build the app shell: sidebar navigation, header, main content area. Set up Vue Router with routes for Playground, Compare, History, Settings, Leaderboard (placeholder). Implement a dark/light theme toggle persisted in config. Add a connection status indicator.

**Acceptance criteria:**
- Sidebar with navigation links to all routes
- Each route renders a placeholder page
- Theme toggle switches between dark and light mode
- Theme persists across restarts
- Connection status shows green/red indicator based on last API health check

**Verification:**
- Click all nav links, each renders correct placeholder
- Toggle theme, restart app, theme persists
- Kill Ollama server, status indicator turns red

**Dependencies:** Task 1.1, Task 1.3 (config for theme persistence)

**Files likely touched:**
- `src/App.vue`
- `src/router/index.ts`
- `src/layouts/MainLayout.vue`
- `src/components/Sidebar.vue`
- `src/components/ConnectionStatus.vue`
- `src/stores/config.ts`
- `src/views/PlaygroundView.vue`
- `src/views/CompareView.vue`
- `src/views/HistoryView.vue`
- `src/views/SettingsView.vue`
- `src/views/LeaderboardView.vue`

**Estimated scope:** Large (8-10 files) — consider splitting if needed

---

#### Checkpoint: Foundation Complete

- `npm run tauri dev` opens a window with navigation working
- API client can stream from a running Ollama instance
- Config persists, hardware info returns data
- All routes render with placeholder content

---

### Phase 2: Core — Chat Playground + Live Metrics

---

#### Task 2.1: Build the Chat Playground

**Description:** The primary UI. A chat-like interface where the user selects a model (or types a prompt), sends it, and sees the response stream in token-by-token. Below or beside the response, live ECharts gauge/charts show TTFT, current TPS, and total tokens. Controls: stop generation, clear chat, export raw response.

**Acceptance criteria:**
- Textarea for prompt input with send button
- Streaming response rendered in a chat bubble (markdown rendered)
- Stop button aborts the in-flight request
- Clear button resets the conversation
- Metrics panel updates on every chunk:
  - TTFT displayed once first token arrives
  - TPS line chart updates live during generation
  - Token counters (prompt, completion, total) shown
- Perf stats persist below the completed response as a summary card

**Verification:**
- Send a prompt to Ollama, watch tokens stream in live
- TTFT fires on first token, TPS chart animates
- Stop mid-generation, verify partial response preserved
- Clear resets everything

**Dependencies:** Task 1.2, Task 1.4

**Files likely touched:**
- `src/views/PlaygroundView.vue`
- `src/components/ChatMessage.vue`
- `src/components/PromptInput.vue`
- `src/components/MetricsPanel.vue`
- `src/components/LiveSpeedChart.vue`
- `src/stores/chat.ts`

**Estimated scope:** Large (5-6 files)

---

#### Task 2.2: Build the Settings page

**Description:** Configuration UI for server connection. Fields: server URL (with port), API key (masked), default model, request timeout, custom headers. Test connection button. Theme toggle. All fields persisted via the Tauri config backend.

**Acceptance criteria:**
- Server URL input with placeholder showing common defaults
- API key input with show/hide toggle
- Default model dropdown (populated from server models list or manual entry)
- "Test Connection" button hits `/models` endpoint and shows success/failure
- All settings persist across restarts
- Model list refresh button fetches available models from the server

**Verification:**
- Change server URL, test connection, see success
- Set API key, restart app, key is still there
- Models list populates from server

**Dependencies:** Task 1.3, Task 1.4

**Files likely touched:**
- `src/views/SettingsView.vue`
- `src/components/SettingsForm.vue`
- `src/stores/config.ts`

**Estimated scope:** Medium (2-3 files)

---

#### Task 2.3: History & Saved Runs

**Description:** Browse and manage previous benchmarking sessions. Each saved run shows: model, engine, date, metrics summary (avg TPS, TTFT, total tokens). Click to expand full details with charts. Delete individual runs or clear all. Re-run button sends the same prompt again.

**Acceptance criteria:**
- Saved runs are listed with model, date, summary metrics
- Click to expand shows full metrics and the prompt/response
- Charts from the session are replayable (static, not live)
- Delete removes a run, clear all removes all
- "Re-run" opens the playground pre-filled with the same prompt/model config
- Runs persist across restarts (backed by Tauri storage)

**Verification:**
- Complete a playground session, save it, navigate to History, see it listed
- Expand, verify metrics match what was shown live
- Delete a run, refresh, it's gone
- Re-run navigates to playground with prompt filled

**Dependencies:** Task 1.3, Task 2.1

**Files likely touched:**
- `src/views/HistoryView.vue`
- `src/components/RunCard.vue`
- `src/components/RunDetail.vue`
- `src/stores/history.ts`

**Estimated scope:** Medium (4 files)

---

#### Checkpoint: Core Playground

- Send a prompt, see streaming response + live metrics
- Save a run, find it in History, re-run it
- Settings persist and connection test works
- Full dark/light theme across all pages

---

### Phase 3: Comparison Features

---

#### Task 3.1: Multi-Config Runner

**Description:** UI to define multiple engine/model/parameter configurations and run the same prompt against all of them. Each config specifies: engine URL, model name, system prompt, temperature, max tokens. Results are displayed side-by-side with synchronized scroll. Comparison chart shows TPS bars and TTFT bars across configs.

**Acceptance criteria:**
- "Add config" card with fields for URL, model, params
- Configs can be reordered, duplicated, removed
- "Run All" sends the prompt to each config sequentially (or concurrently with progress tracking)
- Running indicator shows progress (2/5 complete)
- Results display side-by-side with config label, response text, metrics summary
- Comparison chart: grouped bar chart of TPS across configs
- Individual config result is expandable to full detail (like history)

**Verification:**
- Add 3 configs (e.g., different Ollama models), run, see 3 responses
- Comparison chart shows bars for each config
- Scroll through one response, all scroll together
- Export comparison as JSON

**Dependencies:** Task 1.2, Task 2.1

**Files likely touched:**
- `src/views/CompareView.vue`
- `src/components/ConfigCard.vue`
- `src/components/CompareResults.vue`
- `src/components/ComparisonChart.vue`
- `src/stores/compare.ts`

**Estimated scope:** Large (5-6 files)

---

#### Task 3.2: Quantization Tuner

**Description:** Specialized comparison mode. User picks a base model (e.g. `llama-3.1-8b`), TokRate auto-finds available quantizations via the connected engine, runs the same prompt at each quantization level, and produces a speed-vs-quality chart. Quality is measured by logit similarity or a simple heuristic (perplexity if available). The output: a recommendation card showing the best quantization for this hardware.

**Acceptance criteria:**
- User selects a model family
- Click "Discover Quantizations" scans the engine for available variants
- Runs the prompt across all detected quantizations
- Speed chart (TPS) vs quantization level (x-axis: parameter count / file size)
- Quality metric shown alongside speed (placeholder: model size ratio as quality proxy, or perplexity if engine exposes it)
- Recommendation: "Best balance: Q5_K_M (15.2 tok/s, 92% quality retention)"

**Verification:**
- Point at an Ollama instance with multiple quantizations of the same model
- Run the tuner, see a bar per quantization
- Recommendation is reasonable

**Dependencies:** Task 3.1 (reuses multi-config runner under the hood)

**Files likely touched:**
- `src/views/CompareView.vue` (extended)
- `src/components/QuantizationTuner.vue`
- `src/api/quantization.ts`

**Estimated scope:** Medium (3 files)

---

#### Checkpoint: Comparison Features

- Multi-config runner works with 2+ configs
- Comparison chart renders correctly
- Quantization tuner discovers variants and produces recommendation
- All results savable to History

---

### Phase 4: Public Leaderboard (Direction 5)

---

#### Task 4.1: Leaderboard submission flow

**Description:** After a completed run, the user can opt-in to publish anonymized results. Submission includes: hardware info (GPU, CPU, RAM), engine type + version, model name, quantization, metrics (avg TPS, TTFT, TPOT, token counts). No prompts or responses. User can review what will be sent before publishing.

**Acceptance criteria:**
- "Publish to Leaderboard" button on run detail / history
- Preview dialog shows exactly what data will be sent (no prompts, no responses)
- User confirms and results are POSTed to the leaderboard API
- Success/failure toast notification
- Published runs are marked with a badge in History

**Verification:**
- Complete a run, publish, see success
- Badge appears on the run in History
- Verify no prompt text was sent (inspect network tab)

**Dependencies:** Task 2.3

**Files likely touched:**
- `src/components/PublishDialog.vue`
- `src/api/leaderboard.ts`
- `src/stores/history.ts` (add publish state)

**Estimated scope:** Small (2-3 files)

---

#### Task 4.2: Browse leaderboard

**Description:** In-app leaderboard browser. Fetches published results from the public API. Sortable/filterable by: engine, model, GPU, date. Each entry shows: TPS, TTFT, hardware, model, engine. User can click to see similar results from users with comparable hardware.

**Acceptance criteria:**
- Leaderboard route fetches and displays results
- Sort by TPS, TTFT, date, model
- Filter by engine, model family
- Card shows: model name, engine, GPU, TPS, TTFT, user count badge
- Click "Show similar hardware" filters to matching GPU class

**Verification:**
- Leaderboard page loads results
- Sort and filter work
- Similar hardware filter narrows results

**Dependencies:** Task 4.1, Task 1.4 (Leaderboard route exists)

**Files likely touched:**
- `src/views/LeaderboardView.vue`
- `src/components/LeaderboardTable.vue`
- `src/components/LeaderboardFilters.vue`

**Estimated scope:** Medium (3 files)

---

#### Checkpoint: Leaderboard

- Publish a run, see it appear on leaderboard
- Sort, filter, and similar-hardware views work
- Published badge shows in History

---

### Phase 5: Polish & Ship

---

#### Task 5.1: Error handling & edge cases

**Description:** Comprehensive error handling across the app. Network timeouts, connection refused, auth failures, malformed SSE, empty responses, model not found, out-of-memory errors from engines. User-facing error messages with recovery suggestions. Graceful degradation when leaderboard API is unreachable.

**Acceptance criteria:**
- Every API call has a typed error path
- Errors display in a toast or inline banner with actionable text
- Connection loss during streaming shows "Connection lost — partial results preserved"
- Leaderboard offline shows cached data with "Offline" indicator
- Invalid config fields show inline validation errors

**Verification:**
- Start playground with a dead server, see "Connection refused" toast
- Send prompt with invalid model, see "Model not found" error
- Kill server mid-stream, see graceful handling
- Submit settings with invalid URL, see validation error

**Dependencies:** Task 2.1, Task 2.2, Task 3.1

**Files likely touched:**
- `src/api/client.ts` (error handling)
- `src/components/ErrorToast.vue`
- `src/components/ErrorBoundary.vue`
- All view files (add error states)

**Estimated scope:** Medium (scattered, but per-file changes are small)

---

#### Task 5.2: Tauri packaging & distribution

**Description:** Configure Tauri bundling for Windows (MSI/NSIS), macOS (DMG), Linux (AppImage/deb). Set app icon, app name, versioning. Configure auto-updater if desired. Test install on each platform.

**Acceptance criteria:**
- `npm run tauri build` produces platform installer
- App launches correctly after installation
- App name and icon display correctly in OS
- Basic smoke test on target platform

**Verification:**
- Build succeeds on each platform
- Install and launch from the installer
- Tray icon, window title, about dialog show correct branding

**Dependencies:** Task 1.1

**Files likely touched:**
- `src-tauri/tauri.conf.json`
- `src-tauri/icons/`
- `src-tauri/Cargo.toml`

**Estimated scope:** Small (1-2 files + icons)

---

#### Checkpoint: Ship Ready

- App builds and installs on target platform
- All error states are handled with clear user messaging
- Full dark/light theme
- Benchmark runs can be published to leaderboard

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **SSE format differences across engines** | Medium | Build parser that handles all known formats; add engine-specific profiles in config |
| **Streaming performance in ECharts with frequent updates** | Medium | Throttle chart updates to 100ms intervals; use `notMerge` option |
| **GPU detection across platforms** | Low | Use `sysinfo` for basics; accept that some GPUs won't be detected and allow manual entry |
| **Tauri v2 API changes** | Low | Pin Tauri version; check changelog before upgrading |
| **Leaderboard server costs** | Low | Start with simple serverless (Vercel/Cloudflare Workers); add auth if needed |
| **Cold start / no models installed** | Medium | Detect and show helpful setup guide linking to Ollama docs; test connection before play |

---

## Future Enhancements

### Session Recorder (Direction 3)

Passive proxy mode. TokRate runs in the background recording real API calls from other tools (anything that hits the OpenAI endpoint). No manual prompt sending needed — performance data is collected from actual usage.

**Not yet implemented because** it requires a fundamentally different architecture (local proxy server, process management, Tauri system tray) that conflicts with the foreground playground UX. The proxy intercepts requests, the playground sends its own — doing both cleanly in one app is complex.

**When to revisit:** After the core app has users and the playground + comparison flows are solid. The proxy would be a Tauri sidecar running a lightweight HTTP forwarder with passthrough logging.

**How it would work:**
- Tauri spawns a sidecar HTTP server on `localhost:8080`
- User points their app/tool to `http://localhost:8080/v1/...`
- Sidecar forwards to the real engine and logs all metrics
- Logged sessions appear in History alongside playground sessions
- System tray icon shows proxy status

---

## Open Questions

- What's the leaderboard backend? Serverless (Vercel, Cloudflare Workers) or a small VPS? — Defers to when Task 4.1 starts
- ECharts vs Chart.js final decision? Start with ECharts, benchmark charting perf early in Phase 2
- Should the History tab show "playground sessions" and "proxy sessions" as separate lists, or merged by date? — Defers to Future Enhancement
