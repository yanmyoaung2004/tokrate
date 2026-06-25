# TokRate — agent instructions

## Project state

All 5 phases complete. Tauri v2 + Vue 3 + Vite project with:
- Playground (streaming chat + ECharts TPS chart)
- Compare (multi-config runner + quantization tuner)
- Benchmarks (prompt suites)
- History (saved runs with search/detail/publish)
- Leaderboard (sortable community results)
- Settings (server URL, API key, models, theme)

Not yet: tests, lint configs, CI, formatter — scaffold from scratch.

## Architecture

- **Dual persistence:** `@tauri-apps/plugin-store` with silent localStorage fallback (works in browser-only dev via `npm run dev`)
- **Theme:** defaults dark synchronously before config load; async load may override
- **Build chain:** `vue-tsc --noEmit` (typecheck) then `vite build`
- **Imports:** `@/` alias — `./src/`
- **Rust backend:** 4 commands — `get_hardware_info`, `save_run`, `list_runs`, `delete_run`
- **Leaderboard:** separate Cloudflare Worker in `leaderboard-worker/` (Wrangler v4, KV store)

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev at `http://localhost:1420` |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `vue-tsc --noEmit` only |
| `npm run preview` | Vite preview of built output |
| `npm run tauri:dev` | Tauri dev (native window) |
| `npm run tauri:build` | Production build + installers |
| `cargo check` | Rust typecheck (faster than cargo build) |

## Windows Rust note

MSVC linker required per session:
```powershell
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:Path"
```
Or run `vcvars64.bat` from a VS BuildTools install.

## v2 roadmap

See `docs/plan-v2.md` for the full execution plan. Four phases:

1. **Proxy mode** — background HTTP proxy that captures real-usage metrics
2. **Smart comparison** — quantization scanner + engine hunter
3. **Regression detection** — performance timeline + delta alerts
4. **Hardware-aware leaderboard** — filter by GPU, RAM, CPU, OS

## Leaderboard worker

```bash
cd leaderboard-worker
npm install
npx wrangler kv:namespace create LEADERBOARD
# Paste KV id into wrangler.toml
npx wrangler deploy
# Update URL in src/api/leaderboard.ts:3
```
