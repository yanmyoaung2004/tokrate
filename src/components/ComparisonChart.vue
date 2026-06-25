<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import * as echarts from "echarts";

const ACCENT = "#6b8cff";
const PRIMARY = "#8854D0";

interface ChartItem {
  label: string;
  model: string;
  tps: number;
  ttft: number;
}

const props = defineProps<{
  data: ChartItem[];
}>();

const containerRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

function init() {
  if (!containerRef.value) return;
  chart = echarts.init(containerRef.value, undefined, { renderer: "canvas" });
  render();
}

function render() {
  if (!chart) return;
  const done = props.data.filter((d) => d.tps > 0);
  if (!done.length) return;

  chart.setOption({
    grid: { left: 80, right: 80, top: 10, bottom: 30 },
    xAxis: {
      type: "category",
      data: done.map((d) => d.label),
      axisLabel: { color: "#8a8a9a", fontSize: 10, rotate: 25 },
      axisLine: { lineStyle: { color: "#38384a" } },
    },
    yAxis: {
      type: "value",
      name: "tok/s",
      nameTextStyle: { color: "#8a8a9a", fontSize: 10 },
      axisLabel: { color: "#8a8a9a", fontSize: 9 },
      splitLine: { lineStyle: { color: "#38384a", opacity: 0.2 } },
    },
    series: [
      {
        name: "TPS",
        type: "bar",
        data: done.map((d) => ({
          value: +d.tps.toFixed(1),
          itemStyle: { color: PRIMARY },
        })),
        barMaxWidth: 40,
        label: {
          show: true, position: "top",
          color: "#8a8a9a", fontSize: 10,
          formatter: (p: { value: number }) => `${p.value}`,
        },
      },
      {
        name: "TTFT",
        type: "bar",
        yAxisIndex: 0,
        data: done.map((d) => ({
          value: +(d.ttft / 1000).toFixed(2),
          itemStyle: { color: ACCENT },
        })),
        barMaxWidth: 40,
        label: {
          show: true, position: "top",
          color: "#8a8a9a", fontSize: 9,
          formatter: (p: { value: number }) => `${p.value}s`,
        },
      },
    ],
    animation: false,
    tooltip: {
      trigger: "axis",
      formatter: (params: { name: string; value: number; seriesName: string }[]) => {
        let html = `<strong>${params[0]?.name || ""}</strong><br/>`;
        for (const p of params) {
          html += `${p.seriesName}: ${p.value}<br/>`;
        }
        return html;
      },
    },
  });
}

watch(() => props.data.length, render);

onMounted(init);
onUnmounted(() => {
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="containerRef" class="chart-container"></div>
</template>

<style scoped>
.chart-container { width: 100%; height: 200px; }
</style>
