<script setup lang="ts">
import { ref, computed } from "vue";
import { useConfigStore } from "@/stores/config";
import { useToastStore } from "@/stores/toast";
import { streamChat, fetchModels } from "@/api/client";
import * as echarts from "echarts";
import type { RunMetrics } from "@/types";

interface QuantResult {
  label: string;
  model: string;
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
const allModels = ref<string[]>([]);
const selectedBase = ref("");
const loading = ref(false);
const running = ref(false);
const results = ref<QuantResult[]>([]);
const chartRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

function onProviderChange(url: string) {
  providerUrl.value = url;
  const p = config.providers.find((pr) => pr.url === url);
  if (p) providerApiKey.value = p.apiKey;
  fetchAllModels();
}

const bases = computed(() => {
  const map = new Map<string, string[]>();
  for (const m of allModels.value) {
    // Parse model name: "base:quant" or "base"
    const parts = m.split(":");
    const base = parts[0];
    if (!map.has(base)) map.set(base, []);
    map.get(base)!.push(m);
  }
  return Array.from(map.entries()).map(([base, models]) => ({ base, models }));
});

const variants = computed(() => {
  if (!selectedBase.value) return [];
  const entry = bases.value.find((b) => b.base === selectedBase.value);
  return entry?.models || [];
});

async function fetchAllModels() {
  loading.value = true;
  results.value = [];
  try {
    const models = await fetchModels(providerUrl.value, providerApiKey.value);
    allModels.value = models;
    if (!selectedBase.value && bases.value.length) {
      selectedBase.value = bases.value[0].base;
    }
  } catch {
    toast.add("Failed to load models", "error");
  }
  loading.value = false;
}

async function runScan() {
  if (!prompt.value.trim() || running.value || !variants.value.length) return;

  running.value = true;
  results.value = variants.value.map((m) => ({
    label: m.includes(":") ? m.split(":")[1] || "default" : "default",
    model: m,
    tps: 0, ttft: 0, tpot: 0, tokens: 0, duration: 0,
    status: "pending" as const,
  }));

  for (let i = 0; i < variants.value.length; i++) {
    const model = variants.value[i];
    results.value[i].status = "running";
    const r = results.value[i];

    try {
      let finalMetrics: RunMetrics | null = null;
      for await (const chunk of streamChat(
        providerUrl.value, providerApiKey.value, model,
        [{ role: "user", content: prompt.value }],
        {},
      )) {
        if (chunk.done) {
          finalMetrics = chunk.metrics as RunMetrics;
          break;
        }
      }
      if (finalMetrics) {
        r.tps = finalMetrics.tps;
        r.ttft = finalMetrics.ttft;
        r.tpot = finalMetrics.tpot;
        r.tokens = finalMetrics.completionTokens;
        r.duration = finalMetrics.duration;
      }
      r.status = "done";
    } catch (err: unknown) {
      r.error = err instanceof Error ? err.message : "Unknown error";
      r.status = "error";
    }
  }

  running.value = false;
  toast.add(`Scanned ${results.value.length} quantizations`, "success");
  drawChart();
}

function drawChart() {
  if (!chartRef.value) return;
  if (!chart) {
    chart = echarts.init(chartRef.value);
  }

  const done = results.value.filter((r) => r.status === "done");
  chart.setOption({
    grid: { left: 80, right: 20, top: 10, bottom: 40 },
    xAxis: {
      type: "category",
      data: done.map((r) => r.label),
      axisLabel: { color: "#8a8a9a", fontSize: 10, rotate: 30 },
      axisLine: { lineStyle: { color: "#38384a" } },
    },
    yAxis: {
      type: "value",
      name: "tok/s",
      nameTextStyle: { color: "#8a8a9a", fontSize: 10 },
      axisLabel: { color: "#8a8a9a", fontSize: 9 },
      splitLine: { lineStyle: { color: "#38384a", opacity: 0.2 } },
    },
    series: [{
      type: "bar",
      data: done.map((r) => ({
        value: +r.tps.toFixed(1),
        itemStyle: { color: "#8854D0" },
      })),
      barMaxWidth: 40,
      label: {
        show: true,
        position: "top",
        color: "#8a8a9a",
        fontSize: 10,
        formatter: (p: { value: number }) => `${p.value} tok/s`,
      },
    }],
    animation: false,
    tooltip: {
      trigger: "item",
      formatter: (p: { name: string; value: number; dataIndex: number }) => {
        const r = done[p.dataIndex];
        return `${r.label}<br/>TPS: ${r.tps.toFixed(1)}<br/>TTFT: ${(r.ttft / 1000).toFixed(2)}s<br/>TPOT: ${r.tpot.toFixed(0)}ms<br/>Tokens: ${r.tokens}`;
      },
    },
  });
}
</script>

<template>
  <div class="quant-scanner">
    <div class="qs-header">
      <h2>Quantization Scanner</h2>
    </div>

    <div class="qs-row">
      <div class="qs-field">
        <label>Provider</label>
        <select v-model="providerUrl" class="qs-select" @change="onProviderChange(providerUrl)">
          <option v-for="p in config.providers" :key="p.url" :value="p.url">{{ p.label }}</option>
        </select>
      </div>
      <div class="qs-field">
        <label>Model base</label>
        <select v-model="selectedBase" class="qs-select" :disabled="loading">
          <option value="" disabled>Select model family…</option>
          <option v-for="b in bases" :key="b.base" :value="b.base">{{ b.base }} ({{ b.models.length }})</option>
        </select>
      </div>
      <button class="btn" @click="fetchAllModels" :disabled="loading">{{ loading ? "Loading…" : "⟳ Refresh" }}</button>
    </div>

    <div class="qs-variants">
      <span class="qs-vlabel">Variants: {{ variants.length }}</span>
      <div class="qs-tags">
        <span v-for="v in variants" :key="v" class="qs-tag">{{ v.includes(":") ? v.split(":")[1] : "default" }}</span>
      </div>
    </div>

    <div class="qs-prompt-row">
      <textarea v-model="prompt" placeholder="Prompt to run on all variants…" rows="2" class="qs-prompt" :disabled="running" />
      <button class="btn primary" @click="runScan" :disabled="!prompt.trim() || running || !variants.length">
        {{ running ? `Scanning… (${results.filter(r => r.status !== 'pending').length}/${variants.length})` : "Scan" }}
      </button>
    </div>

    <div v-if="results.length" ref="chartRef" class="qs-chart"></div>

    <div class="qs-results">
      <div v-for="r in results" :key="r.model" class="qs-card" :class="r.status">
        <div class="qs-card-h">
          <strong>{{ r.label }}</strong>
          <span v-if="r.status === 'done' && r.tps" class="qs-val">{{ r.tps.toFixed(1) }} tok/s</span>
          <span v-else-if="r.status === 'error'" class="qs-err">{{ r.error }}</span>
          <span v-else class="qs-pend">{{ r.status }}</span>
        </div>
        <div v-if="r.status === 'done'" class="qs-meta">
          TTFT {{ (r.ttft / 1000).toFixed(2) }}s · TPOT {{ r.tpot.toFixed(0) }}ms · {{ r.tokens }} tok
        </div>
      </div>
    </div>

    <div v-if="!variants.length && !loading" class="qs-empty">
      <p>Click Refresh to load models from your provider, then select a model family.</p>
    </div>
  </div>
</template>

<style scoped>
.quant-scanner { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.qs-header { display: flex; align-items: center; justify-content: space-between; }
.qs-header h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }

.qs-row { display: flex; gap: var(--space-2); align-items: flex-end; }
.qs-field { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.qs-field label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.qs-select { padding: var(--space-1) var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 11px; width: 100%; }
.qs-select:focus { outline: none; border-color: var(--primary); }

.qs-variants { display: flex; flex-direction: column; gap: var(--space-1); }
.qs-vlabel { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }
.qs-tags { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.qs-tag { font-size: 10px; padding: 2px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-mono); color: var(--muted); }

.qs-prompt-row { display: flex; gap: var(--space-2); align-items: flex-start; }
.qs-prompt { flex: 1; padding: var(--space-2) var(--space-3); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 12px; resize: vertical; min-height: 40px; }
.qs-prompt:focus { outline: none; border-color: var(--primary); }
.qs-prompt:disabled { opacity: 0.5; }

.qs-chart { height: 200px; border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2); }
.qs-results { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.qs-card { padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); min-width: 140px; flex: 1; }
.qs-card.done { border-color: color-mix(in oklch, var(--success) 20%, transparent); }
.qs-card.error { border-color: var(--danger); }
.qs-card-h { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-size: 11px; margin-bottom: 2px; }
.qs-val { font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--primary); }
.qs-err { font-size: 10px; color: var(--danger); }
.qs-pend { font-size: 10px; color: var(--muted); }
.qs-meta { font-size: 9px; color: var(--muted); font-family: var(--font-mono); }
.qs-empty { padding: var(--space-4); text-align: center; color: var(--muted); font-size: 12px; }

.btn { padding: var(--space-1) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border); font-size: 11px; font-weight: 500; cursor: pointer; transition: background var(--transition-fast); white-space: nowrap; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary { background: var(--primary); color: white; border-color: transparent; }
.btn.primary:hover:not(:disabled) { opacity: 0.85; }
</style>
