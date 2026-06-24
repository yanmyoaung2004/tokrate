# TokRate — agent instructions

## Project state

All 5 phases complete. Tauri v2 + Vue 3 + Vite project with:

- **Playground** — streaming chat with live ECharts TPS chart, metrics bar, save to history
- **Compare** — multi-config runner and quantization tuner with side-by-side results
- **History** — saved runs with search, detail view, publish to leaderboard
- **Leaderboard** — sortable/filterable community results browser
- **Settings** — server URL, API key, model selection, theme toggle, connection test
- **Design system** — dark-first theme, CSS custom properties, system fonts, toast notifications

Not yet implemented: Rust backend compilation (requires MSVC), tests, CI/CD.

## What this project is

A Tauri + Vue.js desktop app for benchmarking local LLMs via OpenAI-compatible APIs (Ollama, vLLM, llama.cpp, LM Studio, SGLang).

Intended stack:
- **Frontend:** Vue 3 (Composition API) + Vite
- **Desktop:** Tauri (Rust)
- **Charts:** ECharts
- **API:** OpenAI-compatible `/chat/completions` (streaming)

## Key files

| File | Purpose |
|------|---------|
| `TokRate.md` | Original vision, features, and architecture |
| `docs/plan.md` | Detailed implementation plan with phases, tasks, and acceptance criteria |
| `PRODUCT.md` | Product register, users, brand personality, design principles |
| `DESIGN.md` | Color palette, typography, spacing, motion tokens |

## Build & dev commands

```bash
npm run dev            # Vite dev server (browser-only, http://localhost:1420)
npm run tauri:dev      # Tauri dev (native window)
npm run build          # vue-tsc typecheck + vite build
npm run tauri:build    # Production Tauri build
cargo check            # Rust typecheck only (faster than build)
```

**Windows Rust build note:** Requires MSVC `link.exe`. Run this once per PowerShell session:
```powershell
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:Path"
```

Or run `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat` first.

## For future sessions

Before starting any implementation work, first read `TokRate.md` then `docs/plan.md`.

There are no existing tests, lint configs, CI workflows, or dev scripts yet. Everything must be scaffolded from scratch.
