# TokRate — Quick Start Guide

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 18 | `node --version` |
| npm | ≥ 9 | `npm --version` |
| Rust (for Tauri) | ≥ 1.77 | `rustc --version` |
| MSVC build tools (Windows) | 2022 | See Windows setup below |

## Install

```bash
npm install
```

## Run in browser mode (fastest, no Tauri needed)

```bash
npm run dev
```

Open `http://localhost:1420` in any browser. Most features work here: Playground, Compare, History, Settings. Only hardware detection and native window features require Tauri.

**To test against a real LLM:** Start Ollama (or vLLM, llama.cpp, LM Studio) on your machine, then in TokRate's Settings page, set the server URL (default `http://localhost:11434` for Ollama) and click "Test Connection".

## Run as native desktop app (Tauri)

### Windows — first-time MSVC setup

Rust on Windows needs the MSVC linker. Run this once per PowerShell session:

```powershell
C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat
```

Or add the linker path manually:

```powershell
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:Path"
```

### macOS / Linux

No extra setup needed. Xcode Command Line Tools (macOS) or GCC (Linux) should be installed.

### Launch Tauri

```bash
npm run tauri:dev
```

This starts the Vite dev server and opens a native window. Hot-reload works for both frontend and Rust changes.

## Build for distribution

```bash
npm run tauri:build
```

Output goes to `src-tauri/target/release/bundle/`.

## Project structure

```
src/                    # Vue 3 frontend
  api/                  # API client (OpenAI-compatible SSE)
  components/           # Reusable UI components
  router/               # Vue Router config
  stores/               # Pinia stores (config, history, toast)
  types/                # TypeScript interfaces
  views/                # Page-level components
    PlaygroundView      # Chat + live metrics
    CompareView         # Multi-config + quant tuner
    HistoryView         # Saved runs
    LeaderboardView     # Community results
    SettingsView        # Server config + theme
src-tauri/              # Rust backend (hardware, persistence)
```

## How to test each feature

### Playground
1. Start Ollama: `ollama serve`
2. Open TokRate → Settings → set Server URL to `http://localhost:11434`
3. Click "Test Connection" → should show "Connected"
4. Go to Playground, type a prompt, click Send
5. Watch tokens stream in — TPS chart animates, metrics bar updates live
6. Click Stop to abort mid-generation
7. Click Save Run to persist to History

### Compare
1. Go to Compare page
2. Add 2+ configs with different models (e.g. `llama3.2` and `mistral`)
3. Enter a prompt, click "Run All"
4. Results display side-by-side with TPS comparison chart
5. Switch to "Quant Tuner" tab, enter a model base name (e.g. `llama3.2`)
6. Click "Run All" — tests all 7 quantization levels

### History
1. Complete a playground session, click "Save Run"
2. Navigate to History — the run appears in the list
3. Click a run to see metrics detail, prompt, and response
4. Click "Publish" to share anonymized results to leaderboard
5. Click "Delete" to remove, "Clear All" to wipe

### Settings
1. Change server URL, click "Test Connection" — status indicator updates
2. Set API key (if your endpoint requires one)
3. Click "Refresh" to load available models from the server
4. Toggle theme — switches between dark and light mode

## Available commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (browser only) |
| `npm run build` | TypeScript check + production frontend build |
| `npm run tauri:dev` | Start Tauri dev (native window) |
| `npm run tauri:build` | Production Tauri build (all platforms) |
| `npm run typecheck` | TypeScript type-check only |
| `cargo check` | Rust type-check only (faster than full build) |

## Troubleshooting

**"Port 1420 is already in use"** — Kill the existing Vite process or change the port in `vite.config.ts`.

**"Connection refused" in Settings** — Make sure your LLM server is running. Ollama default: `http://localhost:11434`. Check for firewalls.

**"link.exe not found"** on Windows — Run `vcvars64.bat` first (see Windows setup above). The `.cargo/config.toml` points to the MSVC linker path.

**Cargo check is slow** — First build compiles all dependencies (~3-5 min). Subsequent checks are much faster (~10-30s).

**ECharts warns about large chunk** — Expected for desktop app. ECharts is a ~1MB library loaded on demand. No action needed.
