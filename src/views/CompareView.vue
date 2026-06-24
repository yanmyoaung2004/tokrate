<script setup lang="ts">
import { ref, computed } from "vue";
import { useConfigStore } from "@/stores/config";
import { streamChat } from "@/api/client";
import type { RunMetrics } from "@/types";

type Mode = "manual" | "quant";

interface CompareConfig {
  id: string;
  label: string;
  serverUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface CompareResult {
  config: CompareConfig;
  response: string;
  metrics: RunMetrics | null;
  status: "pending" | "running" | "done" | "error";
  error?: string;
}

const COMMON_QUANTS = [
  { tag: "q2_k", label: "Q2_K (Smallest)" },
  { tag: "q3_k_m", label: "Q3_K_M" },
  { tag: "q4_0", label: "Q4_0" },
  { tag: "q4_k_m", label: "Q4_K_M (Balanced)" },
  { tag: "q5_k_m", label: "Q5_K_M" },
  { tag: "q6_k", label: "Q6_K" },
  { tag: "q8_0", label: "Q8_0 (Highest)" },
];

const defaultConfig = useConfigStore();
const mode = ref<Mode>("manual");
const prompt = ref("");
const configs = ref<CompareConfig[]>([
  { id: "1", label: "Config 1", serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey, model: defaultConfig.defaultModel || "llama3.2", temperature: 0.7, maxTokens: 2048, },
  { id: "2", label: "Config 2", serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey, model: defaultConfig.defaultModel || "llama3.2", temperature: 0.7, maxTokens: 2048, },
]);
const quantBase = ref("llama3.2");
const results = ref<CompareResult[]>([]);
const running = ref(false);
let nextId = 3;

const quantConfigs = computed(() =>
  COMMON_QUANTS.map((q, i) => ({
    id: `q-${i}`,
    label: q.label,
    serverUrl: defaultConfig.serverUrl,
    apiKey: defaultConfig.apiKey,
    model: `${quantBase.value}:${q.tag}`,
    temperature: 0.7,
    maxTokens: 2048,
  }))
);

function addConfig() {
  configs.value.push({
    id: String(nextId++), label: `Config ${configs.value.length + 1}`,
    serverUrl: defaultConfig.serverUrl, apiKey: defaultConfig.apiKey,
    model: defaultConfig.defaultModel || "llama3.2",
    temperature: 0.7, maxTokens: 2048,
  });
}

function removeConfig(id: string) {
  if (configs.value.length <= 1) return;
  configs.value = configs.value.filter((c) => c.id !== id);
}

function switchMode(m: Mode) {
  mode.value = m;
  results.value = [];
}

async function runAll() {
  if (!prompt.value.trim() || running.value) return;
  const targets = mode.value === "quant" ? quantConfigs.value : configs.value;
  running.value = true;
  results.value = targets.map((c) => ({
    config: { ...c }, response: "", metrics: null,
    status: "pending" as const,
  }));

  for (let i = 0; i < targets.length; i++) {
    const cfg = targets[i];
    const result = results.value[i];
    result.status = "running";
    try {
      let fullContent = "";
      let finalMetrics: RunMetrics | null = null;
      for await (const chunk of streamChat(cfg.serverUrl, cfg.apiKey, cfg.model,
        [{ role: "user", content: prompt.value }],
        { temperature: cfg.temperature, maxTokens: cfg.maxTokens }
      )) {
        if (chunk.done) { finalMetrics = chunk.metrics as RunMetrics; break; }
        fullContent += chunk.content;
        result.response = fullContent;
      }
      result.response = fullContent;
      result.metrics = finalMetrics;
      result.status = "done";
    } catch (err: unknown) {
      result.error = err instanceof Error ? err.message : "Unknown error";
      result.status = "error";
    }
  }
  running.value = false;
}

function clearResults() { results.value = []; }
</script>

<template>
  <div class="compare-page">
    <div class="page-header">
      <h1 class="page-title">Compare</h1>
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'manual' }" @click="switchMode('manual')">Manual</button>
        <button class="mode-tab" :class="{ active: mode === 'quant' }" @click="switchMode('quant')">Quant Tuner</button>
      </div>
      <button v-if="results.length" class="btn btn-ghost btn-sm" @click="clearResults">Clear</button>
    </div>

    <!-- Manual Mode -->
    <template v-if="mode === 'manual'">
      <div class="config-section">
        <div class="section-header">
          <h2 class="section-title">Configurations</h2>
          <button class="btn btn-secondary btn-sm" @click="addConfig">+ Add</button>
        </div>
        <div class="config-list">
          <div v-for="cfg in configs" :key="cfg.id" class="config-card">
            <div class="config-header">
              <input v-model="cfg.label" class="config-label-input" />
              <button v-if="configs.length > 1" class="btn-icon" @click="removeConfig(cfg.id)">&times;</button>
            </div>
            <div class="config-fields">
              <div class="field"><label>Server</label><input v-model="cfg.serverUrl" class="field-input-sm" /></div>
              <div class="field"><label>Model</label><input v-model="cfg.model" class="field-input-sm" /></div>
              <div class="field"><label>Temp</label><input v-model.number="cfg.temperature" type="number" min="0" max="2" step="0.1" class="field-input-sm" /></div>
              <div class="field"><label>Max Tok</label><input v-model.number="cfg.maxTokens" type="number" min="64" max="8192" class="field-input-sm" /></div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Quant Tuner Mode -->
    <template v-if="mode === 'quant'">
      <div class="quant-section">
        <div class="section-header">
          <h2 class="section-title">Quantization Tuner</h2>
        </div>
        <p class="section-desc">Compare how different quantizations of the same model perform on your hardware.</p>
        <div class="quant-config">
          <div class="field">
            <label>Model base name</label>
            <input v-model="quantBase" class="field-input" placeholder="llama3.2, deepseek-r1, mistral..." />
          </div>
          <div class="quant-preview">
            <span class="preview-label">Will test these models:</span>
            <div class="preview-models">
              <span v-for="qc in quantConfigs" :key="qc.id" class="preview-tag">{{ qc.model }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="prompt-section">
      <textarea v-model="prompt" placeholder="Enter the prompt to run against all configurations..." rows="3" class="prompt-input" :disabled="running" />
      <div class="prompt-actions">
        <button class="btn btn-primary" @click="runAll" :disabled="!prompt.trim() || running">
          {{ running ? "Running..." : `Run All (${mode === 'quant' ? quantConfigs.length : configs.length})` }}
        </button>
      </div>
    </div>

    <div v-if="results.length" class="results-section">
      <div class="comparison-chart">
        <div class="chart-container">
          <div v-for="r in results" :key="r.config.id" class="bar-group">
            <div class="bar-label">{{ r.config.label }}</div>
            <div class="bar-track">
              <div v-if="r.metrics" class="bar-fill" :style="{ width: Math.min((r.metrics.tps / 60) * 100, 100) + '%' }">
                {{ r.metrics.tps.toFixed(1) }}
              </div>
              <div v-else-if="r.status === 'error'" class="bar-error">{{ r.error }}</div>
              <div v-else class="bar-pending">{{ r.status }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="results-grid">
        <div v-for="r in results" :key="r.config.id" class="result-card" :class="r.status">
          <div class="result-header">
            <span class="result-label">{{ r.config.label }}</span>
            <span class="result-model">{{ r.config.model }}</span>
            <span v-if="r.metrics" class="result-tps">{{ r.metrics.tps.toFixed(1) }} tok/s</span>
            <span v-else-if="r.status === 'error'" class="result-error">Error</span>
          </div>
          <div v-if="r.metrics" class="result-metrics">
            TTFT {{ (r.metrics.ttft / 1000).toFixed(2) }}s · TPOT {{ r.metrics.tpot.toFixed(0) }}ms · {{ r.metrics.completionTokens }} tok · {{ (r.metrics.duration / 1000).toFixed(1) }}s
          </div>
          <div v-if="r.error" class="result-error-text">{{ r.error }}</div>
          <pre class="result-text">{{ r.response || (r.status === 'running' ? 'Waiting...' : '') }}</pre>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>Add configurations, enter a prompt, and click "Run All" to compare.</p>
    </div>
  </div>
</template>

<style scoped>
.compare-page { height: 100%; display: flex; flex-direction: column; gap: var(--space-4); max-width: 1100px; margin: 0 auto; width: 100%; }
.page-header { display: flex; align-items: center; gap: var(--space-4); }
.page-title { font-size: 20px; font-weight: 600; margin-right: auto; }

.mode-tabs { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.mode-tab { padding: var(--space-1) var(--space-3); font-size: 12px; font-weight: 500; background: transparent; border: none; color: var(--muted); cursor: pointer; }
.mode-tab.active { background: var(--primary); color: white; }

.config-section, .quant-section { display: flex; flex-direction: column; gap: var(--space-3); }
.section-header { display: flex; align-items: center; justify-content: space-between; }
.section-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.section-desc { font-size: 13px; color: var(--muted); }

.config-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-3); }
.config-card { padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.config-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.config-label-input { font-weight: 600; font-size: 13px; background: transparent; border: none; color: var(--ink); padding: 2px 4px; border-radius: var(--radius-sm); }
.config-label-input:focus { outline: none; background: var(--bg); }
.config-fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.field { display: flex; flex-direction: column; gap: 2px; }
.field label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.field-input { padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 14px; max-width: 400px; }
.field-input:focus { outline: none; border-color: var(--primary); }
.field-input-sm { padding: var(--space-1) var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 12px; width: 100%; }
.field-input-sm:focus { outline: none; border-color: var(--primary); }

.quant-config { display: flex; flex-direction: column; gap: var(--space-3); }
.quant-preview { display: flex; flex-direction: column; gap: var(--space-2); }
.preview-label { font-size: 12px; color: var(--muted); }
.preview-models { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.preview-tag { padding: 2px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 11px; color: var(--ink); }

.prompt-section { display: flex; flex-direction: column; gap: var(--space-2); }
.prompt-input { width: 100%; padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 14px; resize: vertical; min-height: 60px; }
.prompt-input:focus { outline: none; border-color: var(--primary); }
.prompt-input:disabled { opacity: 0.5; }
.prompt-actions { display: flex; justify-content: flex-end; }

.results-section { display: flex; flex-direction: column; gap: var(--space-4); flex: 1; min-height: 0; }

.comparison-chart { padding: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.chart-container { display: flex; flex-direction: column; gap: var(--space-2); }
.bar-group { display: grid; grid-template-columns: 100px 1fr; gap: var(--space-2); align-items: center; }
.bar-label { font-size: 11px; font-weight: 500; text-align: right; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 24px; background: var(--bg); border-radius: var(--radius-sm); overflow: hidden; display: flex; align-items: center; }
.bar-fill { height: 100%; background: var(--primary); border-radius: var(--radius-sm); display: flex; align-items: center; padding: 0 var(--space-2); font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: white; min-width: fit-content; transition: width var(--transition-normal); }
.bar-error { padding: 0 var(--space-2); font-size: 11px; color: var(--danger); }
.bar-pending { padding: 0 var(--space-2); font-size: 11px; color: var(--muted); }

.results-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-3); overflow-y: auto; min-height: 0; }
.result-card { padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; max-height: 350px; }
.result-card.error { border-color: var(--danger); }
.result-header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); flex-wrap: wrap; }
.result-label { font-weight: 600; font-size: 12px; }
.result-model { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }
.result-tps { margin-left: auto; font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--primary); }
.result-error { margin-left: auto; font-size: 12px; color: var(--danger); font-weight: 500; }
.result-metrics { font-size: 11px; color: var(--muted); font-family: var(--font-mono); margin-bottom: var(--space-2); }
.result-error-text { font-size: 12px; color: var(--danger); margin-bottom: var(--space-2); }
.result-text { flex: 1; overflow-y: auto; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; background: var(--bg); padding: var(--space-2); border-radius: var(--radius-sm); }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); text-align: center; }

.btn { padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); border: 1px solid transparent; font-size: 13px; font-weight: 500; cursor: pointer; transition: background var(--transition-fast); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-sm { padding: var(--space-1) var(--space-3); font-size: 12px; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-secondary { background: var(--surface); border-color: var(--border); color: var(--ink); }
.btn-secondary:hover { background: var(--border); }
.btn-ghost { background: transparent; border-color: var(--border); color: var(--muted); }
.btn-ghost:hover { background: var(--surface); color: var(--ink); }
.btn-icon { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 2px; }
.btn-icon:hover { color: var(--danger); }
</style>
