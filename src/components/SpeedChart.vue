<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import type { RunMetrics } from "@/types";

const props = defineProps<{
  metrics: Partial<RunMetrics>;
}>();

const containerRef = ref<HTMLElement | null>(null);
let chart: import("echarts").ECharts | null = null;
const tpsHistory = ref<{ time: number; tps: number }[]>([]);
let initStarted = false;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

async function initChart() {
  if (initStarted || !containerRef.value) return;
  initStarted = true;
  try {
    const { init } = await import("echarts");
    chart = init(containerRef.value, undefined, { renderer: "canvas" });

    const primary = cssVar("--primary");
    const muted = cssVar("--muted");
    const border = cssVar("--border");

    chart.setOption({
      grid: { left: 55, right: 20, top: 10, bottom: 30 },
      xAxis: {
        type: "value",
        name: "Elapsed (seconds)",
        nameLocation: "center",
        nameGap: 20,
        nameTextStyle: { color: muted, fontSize: 11, fontWeight: 500 },
        axisLine: { lineStyle: { color: border } },
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { lineStyle: { color: border, opacity: 0.3 } },
      },
      yAxis: {
        type: "value",
        name: "Tokens/s",
        nameTextStyle: { color: muted, fontSize: 11, fontWeight: 500 },
        min: 0,
        axisLine: { lineStyle: { color: border } },
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { lineStyle: { color: border, opacity: 0.3 } },
      },
      series: [{
        type: "line",
        data: [],
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: primary },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: primary },
              { offset: 1, color: "transparent" },
            ],
          },
        },
      }],
      animation: false,
    });

    // Flush any data that arrived before chart was ready
    if (tpsHistory.value.length) {
      chart.setOption({ series: [{ data: tpsHistory.value.map((p) => [p.time, p.tps]) }] });
    }
  } catch (e) {
    console.warn("Chart init failed:", e);
  }
}

function updateChart() {
  const tps = props.metrics.tps;
  const elapsed = props.metrics.duration ?? 0;

  if (tps && elapsed > 0) {
    tpsHistory.value.push({ time: +(elapsed / 1000).toFixed(2), tps: +(tps).toFixed(1) });
  }

  if (chart) {
    chart.setOption({ series: [{ data: tpsHistory.value.map((p) => [p.time, p.tps]) }] });
  }
}

function reset() {
  tpsHistory.value = [];
  if (chart) {
    chart.setOption({ series: [{ data: [] }] });
  }
}

watch(() => props.metrics, () => {
  updateChart();
}, { deep: true });

defineExpose({ reset });

onMounted(initChart);
onUnmounted(() => {
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div class="chart-panel">
    <div class="panel-header">
      <span class="panel-title">Speed Over Time</span>
      <span class="panel-hint">TPS (tokens per second) during generation</span>
      <span v-if="tpsHistory.length" class="data-count">{{ tpsHistory.length }} points</span>
    </div>
    <div ref="containerRef" class="chart-area"></div>
  </div>
</template>

<style scoped>
.chart-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.panel-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.panel-hint {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.7;
}

.data-count {
  margin-left: auto;
  font-size: 10px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.chart-area {
  width: 100%;
  height: 150px;
}
</style>
