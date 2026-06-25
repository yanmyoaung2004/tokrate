<script setup lang="ts">
import { ref } from "vue";
import { useConfigStore } from "@/stores/config";
import { useToastStore } from "@/stores/toast";
import { streamChat, fetchModels } from "@/api/client";
import { renderMarkdown } from "@/utils/markdown";
import type { RunMetrics } from "@/types";
import QuantizationScanner from "@/components/QuantizationScanner.vue";
import ComparisonChart from "@/components/ComparisonChart.vue";

interface CompareConfig {
  id: string; label: string; serverUrl: string; apiKey: string;
  model: string; temperature: number; maxTokens: number;
}

interface CompareResult {
  config: CompareConfig; response: string; reasoning: string;
  metrics: RunMetrics | null;
  status: "pending" | "running" | "done" | "error"; error?: string;
}

const tab = ref<"compare" | "quant">("compare");

const QUANTS = ["q2_k", "q3_k_m", "q4_0", "q4_k_m", "q5_k_m", "q6_k", "q8_0"];

const defaultConfig = useConfigStore();
const toast = useToastStore();
const prompt = ref("");
const configs = ref<CompareConfig[]>([
  { id: "1", label: "Config 1", serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey, model: defaultConfig.defaultModel || "llama3.2", temperature: 0.7, maxTokens: 2048 },
  { id: "2", label: "Config 2", serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey, model: defaultConfig.defaultModel || "llama3.2", temperature: 0.7, maxTokens: 2048 },
]);
const results = ref<CompareResult[]>([]);
const running = ref(false);
const currentProgress = ref("");
const fillBase = ref("");
const modelsByUrl = ref<Record<string, string[]>>({});
let nextId = 3;

function modelList(cfg: CompareConfig): string[] {
  return modelsByUrl.value[cfg.serverUrl] || [];
}

async function onProviderChange(cfg: CompareConfig) {
  const url = cfg.serverUrl;
  const p = defaultConfig.providers.find((pr) => pr.url === url);
  if (p) cfg.apiKey = p.apiKey;
  if (!modelsByUrl.value[url]) {
    modelsByUrl.value[url] = await fetchModels(url, cfg.apiKey);
  }
  const models = modelsByUrl.value[url] || [];
  if (models.length && !cfg.model) cfg.model = models[0];
}

function addConfig() {
  configs.value.push({
    id: String(nextId++), label: `Config ${configs.value.length + 1}`,
    serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey,
    model: defaultConfig.defaultModel || "llama3.2", temperature: 0.7, maxTokens: 2048,
  });
}

// Load models for existing configs on mount
configs.value.forEach((c) => onProviderChange(c));

function removeConfig(id: string) {
  if (configs.value.length > 1) configs.value = configs.value.filter((c) => c.id !== id);
}

function fillQuants() {
  if (!fillBase.value.trim()) return;
  const base = fillBase.value.split(":")[0];
  configs.value = QUANTS.map((q) => ({
    id: String(nextId++), label: q, serverUrl: defaultConfig.serverUrl,
    apiKey: defaultConfig.apiKey, model: `${base}:${q}`,
    temperature: 0.7, maxTokens: 2048,
  }));
  toast.add(`Filled ${QUANTS.length} quantization configs`, "info");
}

async function runAll() {
  if (!prompt.value.trim() || running.value) return;
  running.value = true; results.value = [];
  currentProgress.value = `0 / ${configs.value.length}`;

  for (let i = 0; i < configs.value.length; i++) {
    const cfg = configs.value[i];
    const result: CompareResult = {
      config: { ...cfg }, response: "", reasoning: "",
      metrics: null, status: "running",
    };
    results.value.push(result);
    currentProgress.value = `${i + 1} / ${configs.value.length}`;

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
  toast.add(`Completed ${configs.value.length} configs`, "success");
}

function clearResults() { results.value = []; }

function exportResults() {
  if (!results.value.length) return;
  const data = {
    exportedAt: new Date().toISOString(),
    configs: results.value.map((r) => ({
      label: r.config.label,
      model: r.config.model,
      serverUrl: r.config.serverUrl,
      status: r.status,
      error: r.error,
      tps: r.metrics?.tps,
      ttft: r.metrics?.ttft,
      tpot: r.metrics?.tpot,
      completionTokens: r.metrics?.completionTokens,
      duration: r.metrics?.duration,
      responseLength: r.response.length,
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compare-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast.add("Results exported as JSON", "success");
}
</script>

<template>
  <div class="compare-page">
    <div class="top-bar">
      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'compare' }" @click="tab = 'compare'">Manual Compare</button>
        <button class="tab" :class="{ active: tab === 'quant' }" @click="tab = 'quant'">Quantization Scanner</button>
      </div>
      <div class="right">
        <span v-if="running" class="progress">{{ currentProgress }}</span>
        <button v-if="results.length" class="btn ghost btn-sm" @click="exportResults">Export</button>
        <button v-if="results.length" class="btn ghost btn-sm" @click="clearResults">Clear</button>
      </div>
    </div>

    <QuantizationScanner v-if="tab === 'quant'" />

    <template v-if="tab === 'compare'">
    <!-- Config cards -->
    <div class="config-grid">
      <div v-for="cfg in configs" :key="cfg.id" class="card">
        <div class="card-h">
          <input v-model="cfg.label" class="label-input" />
          <div class="card-actions">
            <button v-if="configs.length > 1" class="icon-btn" @click="removeConfig(cfg.id)" title="Remove">✕</button>
          </div>
        </div>
        <div class="card-body">
          <div class="fld"><label>Provider</label>
            <select v-model="cfg.serverUrl" class="sm" @change="onProviderChange(cfg)">
              <option value="" disabled>Select…</option>
              <option v-for="p in defaultConfig.providers" :key="p.url" :value="p.url">{{ p.label }}</option>
            </select>
          </div>
          <div class="fld"><label>Model</label>
            <select v-model="cfg.model" class="sm">
              <option value="" disabled>Select…</option>
              <option v-for="m in modelList(cfg)" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="fld"><label>Temp</label><input v-model.number="cfg.temperature" type="number" min="0" max="2" step="0.1" class="sm" /></div>
          <div class="fld"><label>Max tokens</label><input v-model.number="cfg.maxTokens" type="number" min="64" max="8192" step="64" class="sm" /></div>
        </div>
      </div>
      <div class="card add-card" @click="addConfig">+</div>
    </div>

    <!-- Fill quants helper -->
    <details class="fill-quants">
      <summary>Fill quantization variants</summary>
      <div class="fill-row">
        <input v-model="fillBase" class="fill-input" placeholder="Model name (e.g. llama3.2)" />
        <button class="btn" @click="fillQuants" :disabled="!fillBase.trim()">Fill</button>
      </div>
    </details>

    <!-- Prompt + run -->
    <div class="prompt-row">
      <textarea v-model="prompt" placeholder="Enter a prompt to run against all configurations…" rows="2" class="prompt-input" :disabled="running" />
      <button class="btn primary" @click="runAll" :disabled="!prompt.trim() || running">
        {{ running ? "Running…" : `Run (${configs.length})` }}
      </button>
    </div>

    <!-- Results -->
    <div v-if="results.length" class="results">
      <ComparisonChart :data="results.filter(r => r.metrics).map(r => ({ label: r.config.label, model: r.config.model, tps: r.metrics!.tps, ttft: r.metrics!.ttft }))" />
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
            <div class="md" v-html="renderMarkdown(r.reasoning)"></div>
          </details>
          <div v-if="r.error" class="r-err-text">{{ r.error }}</div>
          <div class="r-text md" v-html="renderMarkdown(r.response)"></div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">⊞</div>
      <h3 class="empty-title">No results yet</h3>
      <p class="empty-desc">Add configurations on the left, enter a prompt below, and click Run.</p>
    </div>
    </template>
  </div>
</template>

<style scoped>
.compare-page { height: 100%; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); max-width: 1100px; margin: 0 auto; width: 100%; overflow: hidden; }

.top-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.title { font-size: 16px; font-weight: 600; }
.tabs { display: flex; gap: 0; border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.tab { padding: var(--space-1) var(--space-3); font-size: 11px; font-weight: 500; background: transparent; color: var(--muted); cursor: pointer; border: none; transition: background var(--transition-fast), color var(--transition-fast); }
.tab:hover { background: var(--surface); }
.tab.active { background: var(--surface); color: var(--ink); font-weight: 600; }
.tab + .tab { border-left: 1px solid var(--border); }
.right { display: flex; align-items: center; gap: var(--space-2); }
.progress { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }

.config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.card { padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.add-card { display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--muted); cursor: pointer; min-height: 80px; }
.add-card:hover { border-color: var(--primary); color: var(--primary); }
.card-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.card-actions { display: flex; gap: 2px; }
.label-input { font-weight: 600; font-size: 13px; background: transparent; border: none; color: var(--ink); padding: 2px 4px; border-radius: var(--radius-sm); width: 100%; }
.label-input:focus { outline: none; background: var(--bg); }
.card-body { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-1); }
.fld { display: flex; flex-direction: column; gap: 1px; }
.fld label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.sm { padding: var(--space-1) var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 11px; width: 100%; }
.sm:focus { outline: none; border-color: var(--primary); }

.fill-quants { font-size: 12px; color: var(--muted); }
.fill-quants summary { cursor: pointer; color: var(--primary); font-size: 11px; }
.fill-row { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
.fill-input { flex: 1; padding: var(--space-1) var(--space-2); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-family: var(--font-mono); font-size: 12px; }
.fill-input:focus { outline: none; border-color: var(--primary); }

.prompt-row { display: flex; gap: var(--space-2); align-items: flex-start; }
.prompt-input { flex: 1; padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 13px; resize: vertical; min-height: 50px; }
.prompt-input:focus { outline: none; border-color: var(--primary); }
.prompt-input:disabled { opacity: 0.5; }

.results { flex: 1; display: flex; flex-direction: column; gap: var(--space-3); min-height: 0; }
.bars { padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-1); }
.bar-row { display: grid; grid-template-columns: 80px 1fr; gap: var(--space-2); align-items: center; }
.bar-label { font-size: 10px; font-weight: 500; text-align: right; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 22px; background: var(--bg); border-radius: var(--radius-sm); overflow: hidden; }
.bar-fill { height: 100%; background: var(--primary); border-radius: var(--radius-sm); display: flex; align-items: center; padding: 0 var(--space-2); font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: white; min-width: fit-content; }
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
