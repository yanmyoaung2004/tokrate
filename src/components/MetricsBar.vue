<script setup lang="ts">
import { computed } from "vue";
import type { RunMetrics } from "@/types";

const props = defineProps<{
  metrics: Partial<RunMetrics>;
}>();

const items = computed(() => [
  { label: "TTFT", value: formatMs(props.metrics.ttft), key: "ttft" },
  { label: "TPS", value: props.metrics.tps ? `${props.metrics.tps.toFixed(1)}` : "-", key: "tps" },
  { label: "TPOT", value: props.metrics.tpot ? `${props.metrics.tpot.toFixed(0)}ms` : "-", key: "tpot" },
  { label: "Tokens", value: props.metrics.completionTokens?.toString() ?? "-", key: "tokens" },
]);

function formatMs(ms: number | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
</script>

<template>
  <div class="metrics-bar">
    <div v-for="item in items" :key="item.key" class="metric-item">
      <span class="metric-label">{{ item.label }}</span>
      <span class="metric-value">{{ item.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.metrics-bar {
  display: flex;
  gap: var(--space-6);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}
</style>
