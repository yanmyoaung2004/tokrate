# TokRate v2 — Execution Plan

## Overview

Transform TokRate from a manual benchmarking tool into a continuous performance
intelligence platform for local LLMs. The wedge: **proxy mode** that passively
collects metrics from real usage. Then lay on smart comparison, regression
detection, and a hardware-aware leaderboard.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Proxy server | Rust (Tauri sidecar via `tokio`) | Zero extra runtime deps, fast startup, shares the Tauri process lifecycle. Could alternatively be a Node.js child process — evaluate during Phase 1. |
| Metrics store | Same Tauri `store` plugin (JSON) | Already works. Proxy sessions map directly to the history store. High-volume users may need SQLite later — cross that bridge when proxy data exceeds ~10K runs. |
| Model registry | New Pinia store `models.ts` | Track model metadata (name, engine, quantization, parameter count) separately from run metrics. Cross-referenced by `engine + model` composite key. |
| Quantization detection | Ollama API (`/api/tags`) + engine-specific | Ollama exposes quantization in model tags (e.g. `qwen3:8b-q4_K_M`). For other engines, use model name parsing heuristics. |
| Proxy port | Configurable, default `:8080` | Avoid conflicts. Saved in config store. |
| System tray | Tauri `tray` feature | Show proxy status (running/stopped), quick-toggle. MVP: just a status indicator in the sidebar. |

## Task List

### Phase 1: Proxy Mode (the moat)

---

#### Task 1.1: Proxy core — Rust sidecar

**Description:** Build a lightweight HTTP forwarder in Rust (or Node.js) that
spawns alongside the Tauri app. Listens on localhost, accepts
`/v1/chat/completions` (streaming) and `/v1/models`, forwards requests to the
user's configured backend, intercepts the SSE stream to extract metrics, stores
them, and forwards the unmodified stream to the caller.

**Acceptance criteria:**
- [ ] Server starts/stops via a Tauri command (`proxy_start`, `proxy_stop`)
- [ ] `/v1/chat/completions` with `stream: true` forwards to the configured backend
- [ ] SSE chunks are parsed for timing metrics (TTFT, TPOT, TPS, tokens)
- [ ] Completed sessions saved to history store
- [ ] `/v1/models` returns the backend's model list
- [ ] Non-streaming requests forwarded (metrics extracted from final response)
- [ ] Port configurable via settings
- [ ] Proxy status reported back to frontend

**Verification:**
- [ ] `cargo check` / `npm run build` passes
- [ ] Point any OpenAI client at `http://localhost:PROXY_PORT/v1/...`, see metrics appear in TokRate history
- [ ] 10 concurrent requests don't drop chunks

**Dependencies:** None (new subsystem)

**Files likely touched:**
- `src-tauri/Cargo.toml` (add `tokio`, `hyper` or `axum`)
- `src-tauri/src/proxy.rs` (new — proxy server)
- `src-tauri/src/commands.rs` (add proxy start/stop commands)
- `src-tauri/src/lib.rs` (register commands, spawn proxy)
- `src/stores/history.ts` (add proxy-session tag)
- `src/api/client.ts` (maybe extract shared SSE parser)

**Estimated scope:** Large (6-8 files)

---

#### Task 1.2: Proxy UI — status & controls

**Description:** Add a Proxy section to the Settings page. Start/stop toggle,
port input, status indicator (running/stopped/error). Show a live counter of
requests proxied this session. Add a proxy status indicator to the sidebar.

**Acceptance criteria:**
- [ ] Proxy start/stop button in Settings, persists state
- [ ] Port input with validation (1024–65535)
- [ ] Sidebar shows green dot when proxy is running, gray when stopped
- [ ] Request counter (visible in Settings panel)
- [ ] Stopping proxy mid-request gracefully drains in-flight requests
- [ ] Auto-start on launch (optional, persisted setting)

**Verification:**
- [ ] Start proxy in Settings, `curl http://localhost:8080/v1/models` returns model list
- [ ] Sidebar indicator changes color
- [ ] Counter increments with each proxied request

**Dependencies:** Task 1.1

**Files likely touched:**
- `src/views/SettingsView.vue` (Proxy section)
- `src/components/Sidebar.vue` (proxy indicator)
- `src/stores/config.ts` (proxy port, auto-start)
- `src/stores/proxy.ts` (new — proxy status, request counter)

**Estimated scope:** Medium (4 files)

---

#### Task 1.3: History tagging for proxy sessions

**Description:** Distinguish proxy-collected runs from playground runs in the
History view. Add a "Proxy" badge, filter by source, and show the originating
client's headers or request details (model, prompt length, response length).

**Acceptance criteria:**
- [ ] Proxy runs have a `source: "proxy"` field in the run object
- [ ] History view shows a "Proxy" badge on proxy-collected runs
- [ ] Filter toggle: All / Playground / Proxy
- [ ] Proxy run detail shows request metadata (if available)

**Verification:**
- [ ] Run a prompt via proxy, see it in History with a badge
- [ ] Filter to "Proxy" only, see only proxy runs

**Dependencies:** Task 1.2

**Files likely touched:**
- `src/types/index.ts` (add `source` field to `BenchmarkRun`)
- `src/views/HistoryView.vue` (badge, filter)
- `src/stores/history.ts` (filter logic)

**Estimated scope:** Small (3 files)

---

### Checkpoint: Proxy Mode
- [ ] Proxy starts, stops, forwards requests
- [ ] Metrics appear in History with "Proxy" badge
- [ ] Sidebar shows proxy status
- [ ] Build passes, zero console errors
- [ ] `npm run tauri:build` succeeds

---

### Phase 2: Smart Comparison

---

#### Task 2.1: Quantization scanner

**Description:** Connect to the configured engine (Ollama first), discover all
available quantizations of a selected model base (e.g. all Qwen3-8B variants),
run a user-defined or default prompt on each, collect metrics, and display a
speed-vs-quantization comparison chart.

**Acceptance criteria:**
- [ ] "Discover quantizations" button fetches all variants of a base model from Ollama
- [ ] Auto-runs the same prompt on each variant (sequential)
- [ ] Results displayed as a grouped bar chart: x-axis = quantization level, y-axis = TPS
- [ ] Table shows TTFT, TPS, TPOT, tokens for each variant
- [ ] "Best balance" highlight (highest TPS within X% of max quality)
- [ ] Works with Ollama's `/api/tags` to detect quantized models

**Verification:**
- [ ] Point at an Ollama instance with 3+ quantizations of one model
- [ ] Run scanner, see bars for each quantization
- [ ] Recommendation highlights the best balance

**Dependencies:** None (uses existing `fetchModels` / `streamChat`)

**Files likely touched:**
- `src/api/discovery.ts` (add quantization detection)
- `src/views/CompareView.vue` (quantization tab/section)
- `src/components/QuantizationScanner.vue` (new)
- `src/components/ComparisonChart.vue` (reuse/extend for quantization view)
- `src/stores/compare.ts` (quantization run results)

**Estimated scope:** Medium (5 files)

---

#### Task 2.2: Engine hunter

**Description:** Run the same prompt across multiple engines (Ollama, vLLM,
llama.cpp) from one UI. Side-by-side streaming responses with synchronized
scroll. Comparison chart shows TPS, TTFT bars for each engine.

**Acceptance criteria:**
- [ ] Add 2+ engine configs (each with URL, model, params)
- [ ] "Run All" sends prompt to each engine in parallel
- [ ] Results display side-by-side with synchronized scroll
- [ ] Grouped bar chart: one bar per engine for TPS, one for TTFT
- [ ] Individual results expandable to full detail

**Verification:**
- [ ] Add 2-3 engine configs, run, see 2-3 responses
- [ ] Comparison chart renders correctly

**Dependencies:** None (uses existing engine config UI from CompareView)

**Files likely touched:**
- `src/views/CompareView.vue` (extend existing multi-config runner)
- `src/components/EngineConfigCard.vue` (new or refactored)
- `src/components/SyncScrollContainer.vue` (new)

**Estimated scope:** Medium (3 files)

---

### Checkpoint: Smart Comparison
- [ ] Quantization scanner discovers variants and shows chart
- [ ] Engine hunter runs 2+ configs side-by-side
- [ ] Both features save results to History

---

### Phase 3: Regression Detection

---

#### Task 3.1: Performance timeline

**Description:** Track benchmark runs over time. Each run record includes engine
version (if detectable). A timeline chart in History shows TPS and TTFT over
time, with annotations for engine version changes.

**Acceptance criteria:**
- [ ] History timeline view: scatter plot of TPS over time, colored by engine
- [ ] Hover shows run detail (model, engine, date, metrics)
- [ ] Engine version recorded when available (from `/api/version` or headers)
- [ ] Automatic grouping: "before Ollama 0.9.0" / "after"

**Verification:**
- [ ] Create 5+ runs with the same model/engine over multiple days (simulated)
- [ ] Timeline shows them correctly, groups by engine version
- [ ] Hover shows detail

**Dependencies:** Task 1.3 (proxy tagging makes this richer)

**Files likely touched:**
- `src/views/HistoryView.vue` (timeline tab)
- `src/components/PerformanceTimeline.vue` (new — ECharts scatter chart)
- `src/stores/history.ts` (timeline query)

**Estimated scope:** Medium (3 files)

---

#### Task 3.2: Delta detection

**Description:** When a new run is added, compare its metrics to recent runs
with the same engine+model+quantization. If TPS or TTFT changed significantly
(>10%), surface a notification and delta card.

**Acceptance criteria:**
- [ ] After each run, compare against last 5 runs with the same (engine, model, quantization)
- [ ] If TPS delta > 10%, show a notification: "TPS dropped 23% from 32.1 → 24.7 tok/s"
- [ ] Delta card in History shows the change visually (green up / red down arrow)
- [ ] User can dismiss or investigate a delta
- [ ] Detect engine version changes that correlate with delta

**Verification:**
- [ ] Add a run with significantly different TPS, see delta notification
- [ ] Delta card appears in History

**Dependencies:** Task 3.1

**Files likely touched:**
- `src/stores/history.ts` (delta calculation)
- `src/components/DeltaCard.vue` (new)
- `src/views/HistoryView.vue` (show deltas)
- `src/components/ToastContainer.vue` (delta notification)

**Estimated scope:** Medium (4 files)

---

### Checkpoint: Regression Detection
- [ ] Timeline chart renders runs over time
- [ ] Deltas detected and surfaced
- [ ] Engine version changes annotated

---

### Phase 4: Hardware-Aware Leaderboard

---

#### Task 4.1: Hardware profile submission

**Description:** When publishing to the leaderboard, include full hardware
profile (GPU model, VRAM, CPU, RAM, OS, engine version). The leaderboard
Worker stores and indexes these fields.

**Acceptance criteria:**
- [ ] Hardware info collected automatically (already works via `get_hardware_info`)
- [ ] GPU model detected (from `sysinfo` or GPU-specific detection)
- [ ] VRAM and RAM included in publish payload
- [ ] Leaderboard API stores and indexes hardware fields
- [ ] PublishDialog shows full hardware preview before submitting

**Verification:**
- [ ] Publish a run, check leaderboard API has hardware fields
- [ ] Preview in PublishDialog shows correct hardware info

**Dependencies:** Leaderboard Worker (existing), PublishDialog (existing)

**Files likely touched:**
- `src/api/leaderboard.ts` (extend `PublishPayload`)
- `src/components/PublishDialog.vue` (hardware preview)
- `leaderboard-worker/src/index.ts` (store hardware fields)
- `src-tauri/src/commands.rs` (GPU detection)

**Estimated scope:** Small (4 files)

---

#### Task 4.2: Filter-by-hardware

**Description:** Leaderboard browser lets users filter results by hardware
profile. "Show results from users with similar hardware" auto-filters to the
same GPU family + RAM range. Sort by TPS, TTFT, date, model within filtered
set.

**Acceptance criteria:**
- [ ] Hardware filter dropdown: GPU family, RAM range, OS
- [ ] "Similar hardware" one-click filter
- [ ] Results show hardware summary per entry
- [ ] Sort by TPS / TTFT / date within filtered view

**Verification:**
- [ ] Apply GPU filter, see only matching results
- [ ] "Similar hardware" narrows to same GPU class

**Dependencies:** Task 4.1

**Files likely touched:**
- `src/views/LeaderboardView.vue` (hardware filters)
- `src/components/LeaderboardFilters.vue` (extend)
- `src/api/leaderboard.ts` (add filter params)
- `leaderboard-worker/src/index.ts` (add filter query params)

**Estimated scope:** Medium (4 files)

---

### Checkpoint: Hardware-Aware Leaderboard
- [ ] Hardware fields in publish payload
- [ ] Filtering by hardware works
- [ ] "Similar hardware" narrows results

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Proxy adds latency | Medium | Single-hop forward with no buffering; measure overhead stays under 5ms |
| Rust proxy server complex | High | Consider Node.js child process as simpler alternative; migrate to Rust later if needed |
| Quantization detection only works on Ollama | Medium | Implement per-engine fallbacks; vLLM exposes model metadata differently |
| Leaderboard worker rate limits | Low | Cache leaderboard data locally; refresh every 60s |
| Proxy session data swamps history | Medium | Add auto-prune (keep last 30 days, or configurable retention) |
| GPU detection is unreliable on some systems | Low | Allow manual GPU entry in settings |

## Open Questions

- Rust sidecar vs Node.js child process for the proxy? Rust is faster and shares the Tauri process, but Node.js is simpler to implement. Decision: start with Rust (`tokio` + `hyper`), it's the right long-term choice and keeps the deploy single-binary.
- Should proxy sessions auto-prune old data? Yes, default 30-day retention with configurable limit in Settings.
- Quantization scanner — should it only work with Ollama, or also support other engines? Start with Ollama (most popular), add engine-specific adapters as user demand grows.
