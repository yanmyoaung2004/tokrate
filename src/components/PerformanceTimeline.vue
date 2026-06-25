<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import * as echarts from "echarts";
import type { BenchmarkRun } from "@/types";

const MUTED = "#8a8a9a";
const BORDER = "#38384a";

const props = defineProps<{
  runs: BenchmarkRun[];
}>();

const containerRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

const engineColors = [
  "#8854D0", "#6b8cff", "#4ecdc4", "#ff6b6b", "#ffd93d",
  "#9b59b6", "#1abc9c", "#e74c3c", "#3498db", "#2ecc71",
];

function engineColor(_engine: string, idx: number): string {
  return engineColors[idx % engineColors.length];
}

function init() {
  if (!containerRef.value) return;
  chart = echarts.init(containerRef.value, undefined, { renderer: "canvas" });
  render();
}

function render() {
  if (!chart || !props.runs.length) return;

  const engines = [...new Set(props.runs.map((r) => r.engine))];
  const series = engines.map((engine, idx) => {
    const data = props.runs
      .filter((r) => r.engine === engine && r.tps > 0)
      .map((r) => ({
        value: [r.timestamp, +r.tps.toFixed(1)],
        run: r,
      }));

    return {
      name: engine.length > 20 ? engine.slice(0, 20) + "…" : engine,
      type: "scatter" as const,
      data: data.map((d) => d.value),
      symbolSize: 8,
      itemStyle: { color: engineColor(engine, idx) },
      tooltip: {
        formatter: () => {
          // handled by global tooltip
          return "";
        },
      },
    };
  });

  chart.setOption({
    grid: { left: 60, right: 20, top: 30, bottom: 50 },
    xAxis: {
      type: "time",
      axisLabel: { color: MUTED, fontSize: 9 },
      axisLine: { lineStyle: { color: BORDER } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: "TPS (tok/s)",
      nameTextStyle: { color: MUTED, fontSize: 10 },
      axisLabel: { color: MUTED, fontSize: 9 },
      splitLine: { lineStyle: { color: BORDER, opacity: 0.2 } },
      min: 0,
    },
    series,
    animation: false,
    legend: {
      type: "scroll",
      orient: "horizontal",
      bottom: 0,
      textStyle: { color: MUTED, fontSize: 10 },
      pageIconColor: MUTED,
      pageIconInactiveColor: BORDER,
      pageTextStyle: { color: MUTED },
    },
    tooltip: {
      trigger: "item",
      formatter: (p: { dataIndex: number; seriesIndex: number }) => {
        const engine = engines[p.seriesIndex];
        const run = props.runs.filter((r) => r.engine === engine && r.tps > 0)[p.dataIndex];
        if (!run) return "";
        const date = new Date(run.timestamp).toLocaleString();
        return `<strong>${run.model}</strong><br/>
Date: ${date}<br/>
TPS: ${run.tps.toFixed(1)}<br/>
TTFT: ${(run.ttft / 1000).toFixed(2)}s<br/>
Engine: ${run.engine}<br/>
Source: ${run.source}`;
      },
    },
  });
}

onMounted(init);
onUnmounted(() => {
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="containerRef" class="timeline-chart"></div>
</template>

<style scoped>
.timeline-chart { width: 100%; height: 300px; }
</style>
