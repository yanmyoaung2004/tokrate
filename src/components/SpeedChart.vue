<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import type { RunMetrics } from "@/types";

const props = defineProps<{
  metrics: Partial<RunMetrics>;
}>();

const containerRef = ref<HTMLElement | null>(null);
let chart: import("echarts").ECharts | null = null;
const tpsHistory = ref<{ time: number; tps: number }[]>([]);
const startTime = ref(0);

async function initChart() {
  if (!containerRef.value) return;
  const { init } = await import("echarts");
  chart = init(containerRef.value, undefined, { renderer: "canvas" });
  chart.setOption({
    grid: { left: 50, right: 20, top: 20, bottom: 25 },
    xAxis: {
      type: "value",
      name: "Time (s)",
      nameTextStyle: { color: "var(--muted)", fontSize: 10 },
      axisLine: { lineStyle: { color: "var(--border)" } },
      splitLine: { lineStyle: { color: "var(--border)", opacity: 0.3 } },
    },
    yAxis: {
      type: "value",
      name: "TPS",
      min: 0,
      nameTextStyle: { color: "var(--muted)", fontSize: 10 },
      axisLine: { lineStyle: { color: "var(--border)" } },
      splitLine: { lineStyle: { color: "var(--border)", opacity: 0.3 } },
    },
    series: [
      {
        type: "line",
        data: [],
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: "var(--primary)" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "var(--primary)" },
              { offset: 1, color: "transparent" },
            ],
          },
        },
      },
    ],
    animation: false,
  });
}

function updateChart() {
  if (!chart) return;
  const tps = props.metrics.tps;
  const elapsed = props.metrics.duration ?? 0;

  if (tps && elapsed > 0) {
    tpsHistory.value.push({ time: elapsed / 1000, tps });
  }

  chart.setOption({
    series: [{ data: tpsHistory.value.map((p) => [p.time, p.tps]) }],
  });
}

function reset() {
  tpsHistory.value = [];
  startTime.value = 0;
  if (chart) {
    chart.setOption({ series: [{ data: [] }] });
  }
}

watch(() => props.metrics, () => {
  if (props.metrics.ttft && !startTime.value) {
    startTime.value = Date.now();
  }
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
  <div ref="containerRef" class="speed-chart"></div>
</template>

<style scoped>
.speed-chart {
  width: 100%;
  height: 160px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
</style>
