<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import * as echarts from "echarts";

const ACCENT = "#6b8cff";
const PRIMARY = "#8854D0";
const MUTED = "#8a8a9a";
const BORDER = "#38384a";

const props = defineProps<{
  metrics: Record<string, unknown>;
  phase?: "thinking" | "answering";
  thinkingData?: { time: number; tps: number }[];
  answeringData?: { time: number; tps: number }[];
  thinkingMode?: boolean;
}>();

const containerRef = ref<HTMLElement | null>(null);
const visible = ref(true);
let chart: echarts.ECharts | null = null;

function initChart() {
  if (!containerRef.value) return;
  chart = echarts.init(containerRef.value, undefined, { renderer: "canvas" });
  chart.setOption({
    grid: { left: 45, right: 10, top: 8, bottom: 24 },
    xAxis: {
      type: "value",
      name: "Seconds",
      nameLocation: "center",
      nameGap: 16,
      nameTextStyle: { color: MUTED, fontSize: 10 },
      axisLine: { lineStyle: { color: BORDER } },
      axisLabel: { color: MUTED, fontSize: 9 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: "tok/s",
      nameTextStyle: { color: MUTED, fontSize: 10 },
      min: 0,
      axisLine: { lineStyle: { color: BORDER } },
      axisLabel: { color: MUTED, fontSize: 9 },
      splitLine: { lineStyle: { color: BORDER, opacity: 0.2 } },
    },
    series: props.thinkingMode ? [
      {
        name: "Thinking",
        type: "line",
        data: [],
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: ACCENT },
        areaStyle: {
          color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: ACCENT }, { offset: 1, color: "transparent" }],
          },
        },
      },
      {
        name: "Answering",
        type: "line",
        data: [],
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: PRIMARY },
        areaStyle: {
          color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: PRIMARY }, { offset: 1, color: "transparent" }],
          },
        },
      },
    ] : [
      {
        name: "Speed",
        type: "line",
        data: [],
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: PRIMARY },
        areaStyle: {
          color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: PRIMARY }, { offset: 1, color: "transparent" }],
          },
        },
      },
    ],
    animation: false,
  });
}

function updateChart() {
  if (!chart) return;
  chart.setOption({
    series: props.thinkingMode ? [
      { data: (props.thinkingData || []).map((p) => [p.time, p.tps]) },
      { data: (props.answeringData || []).map((p) => [p.time, p.tps]) },
    ] : [
      { data: (props.answeringData || []).map((p) => [p.time, p.tps]) },
    ],
  });
}

function reset() {
  if (chart) {
    chart.setOption({ series: props.thinkingMode ? [{ data: [] }, { data: [] }] : [{ data: [] }] });
  }
}

watch(
  () => ({ t: props.thinkingData?.length, a: props.answeringData?.length }),
  updateChart,
);

defineExpose({ reset });

onMounted(initChart);
onUnmounted(() => {
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div class="chart-panel">
    <div class="panel-header" @click="visible = !visible">
      <span class="panel-title">Speed over time</span>
      <span class="legend">
        <template v-if="thinkingMode">
          <span class="legend-dot thinking" /> Thinking
        </template>
        <span class="legend-dot answering" /> {{ thinkingMode ? "Answering" : "Speed" }}
      </span>
      <span class="toggle-btn">{{ visible ? "▲" : "▼" }}</span>
    </div>
    <div v-show="visible" ref="containerRef" class="chart-area"></div>
  </div>
</template>

<style scoped>
.chart-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  user-select: none;
}

.panel-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.legend {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 10px;
  color: var(--muted);
  margin-left: auto;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-dot.thinking { background: #6b8cff; }
.legend-dot.answering { background: #8854D0; }

.toggle-btn {
  font-size: 10px;
  color: var(--muted);
  opacity: 0.5;
}

.chart-area {
  width: 100%;
  height: 120px;
  border-top: 1px solid var(--border);
}
</style>
