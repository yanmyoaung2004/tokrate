# TokRate User Guide

## What is TokRate?

TokRate is a desktop application for benchmarking local LLMs (Large Language Models). It connects to any OpenAI-compatible API endpoint (Ollama, vLLM, llama.cpp, LM Studio, SGLang), streams responses in real time, and visualizes performance metrics.

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Run (browser mode — no Rust needed)

```bash
npm run dev
```

Open `http://localhost:1420` in your browser.

### 3. Run (native desktop — needs Rust + MSVC)

```bash
npm run tauri:dev
```

### 4. Connect to a server

1. Go to **Settings** → click **+ Add Provider**
2. Enter a name (e.g. "Ollama Local"), the server URL (e.g. `http://localhost:11434`), and optionally an API key
3. Click **Save**
4. Click **⟳** to test the connection — it should show the model count

### 5. Send your first prompt

1. Go to **Playground**
2. Select your provider from the dropdown
3. Select a model (the list is fetched from the server)
4. Type a message and press **Enter**
5. Watch the response stream in with live metrics

---

## Settings

### Providers

Providers are saved server connections. Each has:
- **Name** — a label to identify it (e.g. "Ollama Local", "vLLM Server")
- **Server URL** — the base URL of your LLM server
- **API Key** — optional, for servers that require authentication

To add: click **+ Add Provider**, fill in the fields, click **Save**.

To edit: click **✎** on a provider card.

To test: click **⟳** — shows model count on success.

To remove: click **✕**.

### Preferences

- **Theme** — toggle between dark and light mode
- **Request timeout** — how long to wait before giving up on a request (default 30s)

---

## Playground

The main chat interface. Send prompts to a model and watch performance metrics in real time.

### Anatomy

| Element | Description |
|---------|-------------|
| **Provider dropdown** | Switch between saved server connections |
| **Model dropdown** | Pick a model from the connected server |
| **↻** | Reload the model list |
| **🧠/⚡** | Toggle thinking mode (sends `reasoning_effort` parameter) |
| **Save** | Saves the conversation to History |
| **Show/Hide thinking** | Toggle visibility of reasoning content |
| **Clear** | Reset the chat |
| **Speed Over Time chart** | Real-time TPS chart — blue = thinking phase, purple = answering |
| **Metrics bar** | TTFT, current TPS, token count, duration — with LIVE badge |
| **Thinking TPS** | Separate speed for reasoning tokens (when applicable) |
| **Answering TPS** | Separate speed for visible answer tokens |
| **Chat area** | Streaming response with markdown rendering |
| **Reasoning block** | Collapsible section showing thinking content |
| **Input area** | Type your prompt, press Enter to send |
| **■** | Stop generation mid-stream |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| **Enter** | Send message |
| **Ctrl+Enter** | Insert newline |

### What the metrics mean

| Metric | Full name | What it tells you |
|--------|-----------|-------------------|
| **TTFT** | Time to First Token | How long before the model starts responding. Lower = faster. |
| **TPS** | Tokens Per Second | Generation speed. Higher = faster output. |
| **TPOT** | Time Per Output Token | Average time per token. Inversely related to TPS. |
| **Tokens** | Completion tokens | How many tokens were generated in this response. |

---

## Compare

Run the same prompt against multiple configurations side-by-side.

### Manual mode

1. Add config cards — each is a separate provider + model + parameters
2. Enter a prompt at the bottom
3. Click **Run (N)** — TokRate runs the prompt against each config sequentially
4. Results appear in two views:
   - **TPS bar chart** — quick visual comparison across configs
   - **Result cards** — full response text with per-config metrics
5. Reasoning content is shown in collapsible blocks when available

### Fill quantization variants

Click **"Fill quantization variants"** to auto-populate configs with different quantization levels of a model:

1. Enter a base model name (e.g. `llama3.2` or `qwen3`)
2. Click **Fill** — creates configs for `q2_k`, `q3_k_m`, `q4_0`, `q4_k_m`, `q5_k_m`, `q6_k`, `q8_0`
3. Run as usual

---

## Benchmarks

Run multiple prompts (a "suite") against your current server+model and get aggregate results.

### Create a suite

1. Go to **Benchmarks**
2. Type a name in the top bar and click **Create**
3. The suite appears in the left panel

### Add prompts

1. Select the suite
2. In the right panel, fill in a **prompt name** and **prompt content**
3. Click **Add**
4. Add as many prompts as you want — short Q&A, long context, code generation, reasoning tasks

### Run a suite

1. Make sure your provider and model are set in Playground (Benchmarks uses the active config)
2. Click **Run Suite (N prompts)**
3. Each prompt runs sequentially with progress shown
4. Results appear below each prompt (TPS, TTFT, tokens, duration)
5. **Aggregate** shows average TPS and TTFT across all prompts

### Use cases

- **Regression testing** — rerun the same suite after changing the model or server to see if performance changed
- **Model comparison** — switch models in Playground, rerun the same suite, compare aggregate TPS
- **Quantization testing** — test different quant levels with a representative set of prompts

---

## History

Browse saved runs from the Playground.

- Runs are listed with model, date, and summary metrics
- Click a run to see full detail: prompt, response, metrics, thinking content
- **Publish** — submit anonymized results to the community Leaderboard
- **Delete** — remove individual runs
- **Clear All** — wipe all saved runs
- **Search** — filter by model name, prompt text, or engine URL

---

## Leaderboard

Community-sourced performance data.

- View anonymized benchmark results published by other users
- **Sort** by TPS (highest first) or TTFT (lowest first)
- **Filter** by engine (Ollama, vLLM, etc.) or model family
- **Publish** your own results from the History page

The leaderboard shows: model name, engine, GPU (if detected), TPS, TTFT, and number of runs contributed.

---

## Notes

- **Data is stored locally** — providers, history, and suites are saved in the Tauri plugin-store (native mode) or localStorage (browser mode). Nothing is sent anywhere unless you click "Publish" on a run.
- **Published data** is anonymized — no prompts or responses are sent, only metrics and hardware info.
- **CORS errors** in browser mode — connecting to remote servers from the browser is blocked by CORS. Use `http://localhost` servers or run in Tauri desktop mode instead.
- **Thinking models** — models like DeepSeek-R1 and QwQ output reasoning content before the final answer. TokRate detects this and shows it in a separate collapsible block with its own speed metric.
