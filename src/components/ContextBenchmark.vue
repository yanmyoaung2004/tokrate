<script setup lang="ts">
import { ref } from "vue";
import { useConfigStore } from "@/stores/config";
import { useToastStore } from "@/stores/toast";
import { streamChat, fetchModels } from "@/api/client";
import * as echarts from "echarts";
import type { RunMetrics } from "@/types";

const FILLER = "The quick brown fox jumps over the lazy dog. ";
const CONTEXT_SIZES = [2048, 4096, 8192, 16384];
const CHART_COLOR = "#8854D0";

interface CtxResult {
  size: number;
  tps: number;
  ttft: number;
  tpot: number;
  tokens: number;
  duration: number;
  status: "pending" | "running" | "done" | "error";
  error?: string;
}

const config = useConfigStore();
const toast = useToastStore();

const prompt = ref("");
const providerUrl = ref(config.serverUrl);
const providerApiKey = ref(config.apiKey);
const model = ref("");
const models = ref<string[]>([]);
const loadingModels = ref(false);
const running = ref(false);
const results = ref<CtxResult[]>([]);
const chartRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

function onProviderChange(url: string) {
  providerUrl.value = url;
  const p = config.providers.find((pr) => pr.url === url);
  if (p) providerApiKey.value = p.apiKey;
  loadModels();
}

async function loadModels() {
  loadingModels.value = true;
  try {
    models.value = await fetchModels(providerUrl.value, providerApiKey.value);
    if (!model.value && models.value.length) model.value = models.value[0];
  } catch {
    toast.add("Failed to load models", "error");
  }
  loadingModels.value = false;
}

function padPrompt(base: string, targetChars: number): string {
  let padded = base;
  while (padded.length < targetChars) {
    padded += FILLER;
  }
  // Truncate to exact target
  padded = padded.slice(0, targetChars);
  // Append a separator and the original prompt at the end to ensure the model can answer
  return padded + "\n\n---\n\n" + base;
}

async function runBenchmark() {
  if (!prompt.value.trim() || running.value || !model.value) return;

  running.value = true;
  results.value = CONTEXT_SIZES.map((s) => ({
    size: s,
    tps: 0, ttft: 0, tpot: 0, tokens: 0, duration: 0,
    status: "pending" as const,
  }));

  for (let i = 0; i < CONTEXT_SIZES.length; i++) {
    const size = CONTEXT_SIZES[i];
    results.value[i].status = "running";

    // Pad to 70% of target size to leave room for the response
    const targetChars = Math.floor(size * 0.7 * 3.5); // ~3.5 chars per token
    const input = padPrompt(prompt.value, targetChars);

    try {
      let finalMetrics: RunMetrics | null = null;
      for await (const chunk of streamChat(providerUrl.value, providerApiKey.value, model.value,
        [{ role: "user", content: input }], {},
      )) {
        if (chunk.done) { finalMetrics = chunk.metrics as RunMetrics; break; }
      }
      if (finalMetrics) {
        results.value[i].tps = finalMetrics.tps;
        results.value[i].ttft = finalMetrics.ttft;
        results.value[i].tpot = finalMetrics.tpot;
        results.value[i].tokens = finalMetrics.completionTokens;
        results.value[i].duration = finalMetrics.duration;
      }
      results.value[i].status = "done";
    } catch (err: unknown) {
      results.value[i].error = err instanceof Error ? err.message : "Error";
      results.value[i].status = "error";
    }
  }

  running.value = false;
  drawChart();
  toast.add("Context window benchmark complete", "success");
}

function drawChart() {
  if (!chartRef.value) return;
  if (!chart) chart = echarts.init(chartRef.value);

  const done = results.value.filter((r) => r.status === "done");
  chart.setOption({
    grid: { left: 60, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: "category",
      data: done.map((r) => `${(r.size / 1024).toFixed(0)}k`),
      axisLabel: { color: "#8a8a9a", fontSize: 11 },
      axisLine: { lineStyle: { color: "#38384a" } },
      name: "Context size",
      nameLocation: "center",
      nameGap: 25,
      nameTextStyle: { color: "#8a8a9a", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      name: "tok/s",
      nameTextStyle: { color: "#8a8a9a", fontSize: 10 },
      axisLabel: { color: "#8a8a9a", fontSize: 9 },
      splitLine: { lineStyle: { color: "#38384a", opacity: 0.2 } },
      min: 0,
    },
    series: [{
      type: "line",
      data: done.map((r) => ({
        value: +r.tps.toFixed(1),
        itemStyle: { color: CHART_COLOR },
      })),
      smooth: true,
      showSymbol: true,
      symbolSize: 8,
      lineStyle: { width: 2, color: CHART_COLOR },
      areaStyle: {
        color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: CHART_COLOR },
            { offset: 1, color: "transparent" },
          ],
        },
      },
      label: {
        show: true, position: "top",
        color: "#8a8a9a", fontSize: 10,
        formatter: (p: { value: number }) => `${p.value}`,
      },
    }],
    animation: false,
    tooltip: {
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const r = done[p.dataIndex];
        return `<strong>${(r.size / 1024).toFixed(0)}k context</strong><br/>
TPS: ${r.tps.toFixed(1)}<br/>
TTFT: ${(r.ttft / 1000).toFixed(2)}s<br/>
TPOT: ${r.tpot.toFixed(0)}ms<br/>
Tokens: ${r.tokens}<br/>
Duration: ${(r.duration / 1000).toFixed(1)}s`;
      },
    },
  });
}
</script>

<template>
  <div class="ctx-bench">
    <div class="ctx-header">
      <h2>Context Window Scaling</h2>
      <p class="ctx-desc">Measures how TPS degrades as context size grows. Runs the same prompt at 2k, 4k, 8k, and 16k context windows.</p>
    </div>

    <div class="ctx-row">
      <div class="ctx-field">
        <label>Provider</label>
        <select v-model="providerUrl" class="ctx-select" @change="onProviderChange(providerUrl)">
          <option v-for="p in config.providers" :key="p.url" :value="p.url">{{ p.label }}</option>
        </select>
      </div>
      <div class="ctx-field">
        <label>Model</label>
        <select v-model="model" class="ctx-select" :disabled="loadingModels">
          <option value="" disabled>Select model…</option>
          <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
      <button class="btn" @click="loadModels" :disabled="loadingModels">{{ loadingModels ? "Loading…" : "⟳" }}</button>
    </div>

    <div class="ctx-prompt-row">
      <textarea v-model="prompt" placeholder="Enter a prompt to test at each context size…" rows="2" class="ctx-prompt" :disabled="running" />
      <button class="btn primary" @click="runBenchmark" :disabled="!prompt.trim() || running || !model">
        {{ running ? `Running… (${results.filter(r => r.status !== 'pending').length}/${CONTEXT_SIZES.length})` : "Run" }}
      </button>
    </div>

    <div v-if="results.length" ref="chartRef" class="ctx-chart"></div>

    <div class="ctx-results">
      <div v-for="r in results" :key="r.size" class="ctx-card" :class="r.status">
        <div class="ctx-card-h">
          <strong>{{ (r.size / 1024).toFixed(0) }}k context</strong>
          <span v-if="r.status === 'done'" class="ctx-val">{{ r.tps.toFixed(1) }} tok/s</span>
          <span v-else-if="r.status === 'error'" class="ctx-err">{{ r.error }}</span>
          <span v-else class="ctx-pend">{{ r.status }}</span>
        </div>
        <div v-if="r.status === 'done'" class="ctx-meta">
          TTFT {{ (r.ttft / 1000).toFixed(2) }}s · TPOT {{ r.tpot.toFixed(0) }}ms · {{ r.tokens }} tok
        </div>
      </div>
    </div>

    <div v-if="!models.length && !loadingModels" class="ctx-empty">
      <p>Click Refresh to load models, then enter a prompt and run.</p>
    </div>
  </div>
</template>

<style scoped>
.ctx-bench { display: flex; flex-direction: column; gap: var(--space-3); }
.ctx-header h2 { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.ctx-desc { font-size: 12px; color: var(--muted); line-height: 1.5; }
.ctx-row { display: flex; gap: var(--space-2); align-items: flex-end; }
.ctx-field { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.ctx-field label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.ctx-select { padding: var(--space-1) var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 11px; width: 100%; }
.ctx-select:focus { outline: none; border-color: var(--primary); }
.ctx-prompt-row { display: flex; gap: var(--space-2); align-items: flex-start; }
.ctx-prompt { flex: 1; padding: var(--space-2) var(--space-3); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 12px; resize: vertical; min-height: 40px; }
.ctx-prompt:focus { outline: none; border-color: var(--primary); }
.ctx-prompt:disabled { opacity: 0.5; }
.ctx-chart { height: 200px; border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2); }
.ctx-results { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.ctx-card { padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); flex: 1; min-width: 160px; }
.ctx-card.done { border-color: color-mix(in oklch, var(--primary) 20%, transparent); }
.ctx-card.error { border-color: var(--danger); }
.ctx-card-h { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-size: 12px; margin-bottom: 2px; }
.ctx-val { font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--primary); }
.ctx-err { font-size: 10px; color: var(--danger); }
.ctx-pend { font-size: 10px; color: var(--muted); }
.ctx-meta { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }
.ctx-empty { padding: var(--space-4); text-align: center; color: var(--muted); font-size: 12px; }

.btn { padding: var(--space-1) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border); font-size: 11px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary { background: var(--primary); color: white; border-color: transparent; }
.btn.primary:hover:not(:disabled) { opacity: 0.85; }
</style>
