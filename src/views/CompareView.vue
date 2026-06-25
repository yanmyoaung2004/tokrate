<script setup lang="ts">
import { ref, computed } from "vue";
import { useConfigStore } from "@/stores/config";
import { useToastStore } from "@/stores/toast";
import { streamChat, fetchModels } from "@/api/client";
import type { RunMetrics } from "@/types";

type Mode = "manual" | "quant";

interface CompareConfig {
  id: string; label: string; serverUrl: string; apiKey: string;
  model: string; temperature: number; maxTokens: number;
}

interface CompareResult {
  config: CompareConfig; response: string; reasoning: string;
  metrics: RunMetrics | null;
  status: "pending" | "running" | "done" | "error"; error?: string;
}

const COMMON_QUANTS = [
  { tag: "q2_k", label: "Q2_K" }, { tag: "q3_k_m", label: "Q3_K_M" },
  { tag: "q4_0", label: "Q4_0" }, { tag: "q4_k_m", label: "Q4_K_M" },
  { tag: "q5_k_m", label: "Q5_K_M" }, { tag: "q6_k", label: "Q6_K" },
  { tag: "q8_0", label: "Q8_0" },
];

const defaultConfig = useConfigStore();
const toast = useToastStore();
const mode = ref<Mode>("manual");
const prompt = ref("");
const configs = ref<CompareConfig[]>([
  { id: "1", label: "Config 1", serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey, model: defaultConfig.defaultModel || "llama3.2", temperature: 0.7, maxTokens: 2048 },
  { id: "2", label: "Config 2", serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey, model: defaultConfig.defaultModel || "llama3.2", temperature: 0.7, maxTokens: 2048 },
]);
const quantBase = ref("llama3.2");
const results = ref<CompareResult[]>([]);
const running = ref(false);
const currentProgress = ref("");
const availableModels = ref<string[]>([]);
let nextId = 3;

const quantConfigs = computed(() =>
  COMMON_QUANTS.map((q, i) => ({
    id: `q-${i}`, label: q.label, serverUrl: defaultConfig.serverUrl,
    apiKey: defaultConfig.apiKey, model: `${quantBase.value}:${q.tag}`,
    temperature: 0.7, maxTokens: 2048,
  }))
);

async function loadModelsFor(cfg: CompareConfig) {
  availableModels.value = await fetchModels(cfg.serverUrl, cfg.apiKey);
}

function addConfig() {
  configs.value.push({
    id: String(nextId++), label: `Config ${configs.value.length + 1}`,
    serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey,
    model: defaultConfig.defaultModel || "llama3.2", temperature: 0.7, maxTokens: 2048,
  });
}
function removeConfig(id: string) { if (configs.value.length > 1) configs.value = configs.value.filter((c) => c.id !== id); }
function switchMode(m: Mode) { mode.value = m; results.value = []; }

async function runAll() {
  if (!prompt.value.trim() || running.value) return;
  const targets = mode.value === "quant" ? quantConfigs.value : configs.value;
  running.value = true; results.value = [];
  currentProgress.value = `0 / ${targets.length}`;

  for (let i = 0; i < targets.length; i++) {
    const cfg = targets[i];
    const result: CompareResult = {
      config: { ...cfg }, response: "", reasoning: "",
      metrics: null, status: "running",
    };
    results.value.push(result);
    currentProgress.value = `${i + 1} / ${targets.length}`;

    try {
      let content = ""; let reasoning = ""; let finalMetrics: RunMetrics | null = null;
      for await (const chunk of streamChat(cfg.serverUrl, cfg.apiKey, cfg.model,
        [{ role: "user", content: prompt.value }],
        { temperature: cfg.temperature, maxTokens: cfg.maxTokens }
      )) {
        if (chunk.done) { finalMetrics = chunk.metrics as RunMetrics; break; }
        content += chunk.content;
        if (chunk.reasoningContent) reasoning += chunk.reasoningContent;
        result.response = content; result.reasoning = reasoning;
      }
      result.response = content; result.reasoning = reasoning;
      result.metrics = finalMetrics; result.status = "done";
    } catch (err: unknown) {
      result.error = err instanceof Error ? err.message : "Unknown error";
      result.status = "error";
    }
  }
  running.value = false; currentProgress.value = "";
  toast.add(`Completed ${targets.length} configs`, "success");
}

function clearResults() { results.value = []; }
</script>

<template>
  <div class="compare-page">
    <div class="top-bar">
      <div class="left">
        <h1 class="title">Compare</h1>
        <div class="tabs">
          <button class="tab" :class="{ active: mode === 'manual' }" @click="switchMode('manual')">Manual</button>
          <button class="tab" :class="{ active: mode === 'quant' }" @click="switchMode('quant')">Quant Tuner</button>
        </div>
      </div>
      <div class="right">
        <span v-if="running" class="progress">{{ currentProgress }}</span>
        <button v-if="results.length" class="btn ghost btn-sm" @click="clearResults">Clear</button>
      </div>
    </div>

    <!-- Manual: config cards -->
    <template v-if="mode === 'manual'">
      <div class="config-grid">
        <div v-for="cfg in configs" :key="cfg.id" class="card compact">
          <div class="card-h">
            <input v-model="cfg.label" class="label-input" />
            <div class="card-actions">
              <button class="icon-btn" @click="loadModelsFor(cfg)" title="Load models">↻</button>
              <button v-if="configs.length > 1" class="icon-btn" @click="removeConfig(cfg.id)">✕</button>
            </div>
          </div>
          <div class="card-fields">
            <div class="fld"><label>Server</label><input v-model="cfg.serverUrl" class="sm" /></div>
            <div class="fld"><label>Model</label>
              <input v-model="cfg.model" class="sm" list="cmp-models" />
              <datalist id="cmp-models"><option v-for="m in availableModels" :key="m" :value="m" /></datalist>
            </div>
            <div class="fld"><label>Temp</label><input v-model.number="cfg.temperature" type="number" min="0" max="2" step="0.1" class="sm" /></div>
            <div class="fld"><label>Max tokens</label><input v-model.number="cfg.maxTokens" type="number" min="64" max="8192" step="64" class="sm" /></div>
          </div>
        </div>
        <button class="card add-card" @click="addConfig">+</button>
      </div>
    </template>

    <!-- Quant Tuner -->
    <template v-if="mode === 'quant'">
      <div class="card">
        <div class="card-h"><span class="card-title">Quantization Tuner</span></div>
        <p class="desc">Tests the same prompt across quantization levels of <code>{{ quantBase }}</code>.</p>
        <div class="quant-field">
          <label>Model base</label>
          <input v-model="quantBase" class="field-input" placeholder="llama3.2, deepseek-r1..." />
        </div>
        <div class="tags">
          <span v-for="qc in quantConfigs" :key="qc.id" class="tag">{{ qc.model }}</span>
        </div>
      </div>
    </template>

    <!-- Prompt -->
    <div class="prompt-row">
      <textarea v-model="prompt" placeholder="Enter a prompt to run against all configurations…" rows="2" class="prompt-input" :disabled="running" />
      <button class="btn primary" @click="runAll" :disabled="!prompt.trim() || running">
        {{ running ? "Running…" : `Run All (${mode === 'quant' ? quantConfigs.length : configs.length})` }}
      </button>
    </div>

    <!-- Results -->
    <div v-if="results.length" class="results">
      <div class="bars">
        <div v-for="r in results" :key="r.config.id" class="bar-row">
          <span class="bar-label" :title="r.config.model">{{ r.config.label }}</span>
          <div class="bar-track">
            <div v-if="r.metrics" class="bar-fill" :style="{ width: Math.min((r.metrics.tps / 60) * 100, 100) + '%' }">{{ r.metrics.tps.toFixed(1) }}</div>
            <div v-else-if="r.status === 'error'" class="bar-err">{{ r.error }}</div>
            <div v-else class="bar-pend">{{ r.status }}</div>
          </div>
        </div>
      </div>
      <div class="result-cards">
        <div v-for="r in results" :key="r.config.id" class="r-card" :class="r.status">
          <div class="r-h">
            <strong>{{ r.config.label }}</strong>
            <code>{{ r.config.model }}</code>
            <span v-if="r.metrics" class="r-tps">{{ r.metrics.tps.toFixed(1) }} tok/s</span>
            <span v-else-if="r.status === 'error'" class="r-err">Error</span>
          </div>
          <div v-if="r.metrics" class="r-metrics">
            TTFT {{ (r.metrics.ttft / 1000).toFixed(2) }}s · TPOT {{ r.metrics.tpot.toFixed(0) }}ms · {{ r.metrics.completionTokens }} tok · {{ (r.metrics.duration / 1000).toFixed(1) }}s
          </div>
          <details v-if="r.reasoning" class="r-reasoning" :open="r.status === 'running'">
            <summary>Reasoning ({{ r.reasoning.length }} char)</summary>
            <pre>{{ r.reasoning }}</pre>
          </details>
          <div v-if="r.error" class="r-err-text">{{ r.error }}</div>
          <pre class="r-text">{{ r.response || (r.status === 'running' ? 'Waiting…' : '') }}</pre>
        </div>
      </div>
    </div>

    <div v-else class="empty">
      <p>{{ mode === 'manual' ? 'Add configs, enter a prompt, and run.' : 'Set a model name, enter a prompt, and run.' }}</p>
    </div>
  </div>
</template>

<style scoped>
.compare-page { height: 100%; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); max-width: 1100px; margin: 0 auto; width: 100%; overflow: hidden; }

/* Top bar */
.top-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.left, .right { display: flex; align-items: center; gap: var(--space-2); }
.title { font-size: 16px; font-weight: 600; }
.tabs { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.tab { padding: var(--space-1) var(--space-3); font-size: 11px; font-weight: 500; background: transparent; border: none; color: var(--muted); cursor: pointer; }
.tab.active { background: var(--primary); color: white; }
.progress { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }

/* Config cards */
.config-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-2); }
.card { padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-2); }
.card.compact { gap: var(--space-2); }
.add-card { display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--muted); cursor: pointer; min-height: 80px; }
.add-card:hover { border-color: var(--primary); color: var(--primary); }
.card-h { display: flex; align-items: center; justify-content: space-between; }
.card-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.card-actions { display: flex; gap: 2px; }
.label-input { font-weight: 600; font-size: 13px; background: transparent; border: none; color: var(--ink); padding: 2px 4px; border-radius: var(--radius-sm); }
.label-input:focus { outline: none; background: var(--bg); }
.card-fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-1); }
.fld { display: flex; flex-direction: column; gap: 1px; }
.fld label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.sm { padding: var(--space-1) var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 11px; width: 100%; }
.sm:focus { outline: none; border-color: var(--primary); }

.quant-field { display: flex; flex-direction: column; gap: var(--space-1); }
.quant-field label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.field-input { padding: var(--space-1) var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 12px; }
.field-input:focus { outline: none; border-color: var(--primary); }
.desc { font-size: 12px; color: var(--muted); }
.desc code { font-family: var(--font-mono); color: var(--ink); }
.tags { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.tag { padding: 2px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 10px; color: var(--ink); }

/* Prompt */
.prompt-row { display: flex; gap: var(--space-2); align-items: flex-start; }
.prompt-input { flex: 1; padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 13px; resize: vertical; min-height: 50px; }
.prompt-input:focus { outline: none; border-color: var(--primary); }
.prompt-input:disabled { opacity: 0.5; }

/* Results */
.results { flex: 1; display: flex; flex-direction: column; gap: var(--space-3); min-height: 0; }
.bars { padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-1); }
.bar-row { display: grid; grid-template-columns: 80px 1fr; gap: var(--space-2); align-items: center; }
.bar-label { font-size: 10px; font-weight: 500; text-align: right; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 22px; background: var(--bg); border-radius: var(--radius-sm); overflow: hidden; }
.bar-fill { height: 100%; background: var(--primary); border-radius: var(--radius-sm); display: flex; align-items: center; padding: 0 var(--space-2); font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: white; min-width: fit-content; transition: width 300ms ease; }
.bar-err { padding: 0 var(--space-2); font-size: 10px; color: var(--danger); line-height: 22px; }
.bar-pend { padding: 0 var(--space-2); font-size: 10px; color: var(--muted); line-height: 22px; }

.result-cards { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-2); overflow-y: auto; min-height: 0; }
.r-card { padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; max-height: 300px; }
.r-card.error { border-color: var(--danger); }
.r-h { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); font-size: 12px; flex-wrap: wrap; }
.r-h strong { font-size: 11px; }
.r-h code { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }
.r-tps { margin-left: auto; font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--primary); }
.r-err { margin-left: auto; font-size: 11px; color: var(--danger); font-weight: 500; }
.r-metrics { font-size: 10px; color: var(--muted); font-family: var(--font-mono); margin-bottom: var(--space-1); }
.r-reasoning { margin-bottom: var(--space-1); }
.r-reasoning summary { font-size: 10px; color: var(--accent); cursor: pointer; }
.r-reasoning pre { margin-top: var(--space-1); padding: var(--space-1) var(--space-2); background: var(--bg); border-radius: var(--radius-sm); font-size: 11px; color: var(--muted); max-height: 80px; overflow-y: auto; white-space: pre-wrap; }
.r-err-text { font-size: 11px; color: var(--danger); margin-bottom: var(--space-1); }
.r-text { flex: 1; overflow-y: auto; font-family: var(--font-mono); font-size: 11px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; background: var(--bg); padding: var(--space-2); border-radius: var(--radius-sm); }

.empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 13px; text-align: center; }

/* Shared */
.btn { padding: var(--space-1) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border); font-size: 11px; font-weight: 500; cursor: pointer; transition: background var(--transition-fast); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-sm { padding: var(--space-1) var(--space-2); font-size: 10px; }
.btn.primary { background: var(--primary); color: white; border-color: transparent; }
.btn.primary:hover:not(:disabled) { opacity: 0.85; }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover { background: var(--surface); color: var(--ink); }
.icon-btn { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 12px; padding: 2px; line-height: 1; }
.icon-btn:hover { color: var(--ink); }
</style>
