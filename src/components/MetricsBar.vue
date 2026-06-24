<script setup lang="ts">
import { computed } from "vue";
import type { RunMetrics } from "@/types";

const props = defineProps<{
  metrics: Partial<RunMetrics>;
  streaming?: boolean;
}>();

const items = computed(() => [
  {
    label: "Time to First Token",
    value: props.metrics.ttft ? format(props.metrics.ttft) : "—",
    hint: "TTFT · time before first word appears",
    key: "ttft",
  },
  {
    label: "Speed",
    value: props.metrics.tps ? `${props.metrics.tps.toFixed(1)}` : "—",
    unit: "tok/s",
    hint: props.streaming ? "Current generation speed" : "Average generation speed",
    key: "tps",
  },
  {
    label: "Per Token",
    value: props.metrics.tpot ? format(props.metrics.tpot) : "—",
    hint: "TPOT · time per output token",
    key: "tpot",
  },
  {
    label: "Tokens Generated",
    value: props.metrics.completionTokens?.toString() ?? "—",
    hint: "Completion tokens so far",
    key: "tokens",
  },
]);

function format(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
</script>

<template>
  <div class="metrics-panel">
    <div class="panel-header">
      <span class="panel-title">Metrics</span>
      <span v-if="streaming" class="live-badge">LIVE</span>
    </div>
    <div class="metrics-grid">
      <div v-for="item in items" :key="item.key" class="metric-block">
        <span class="metric-value" :class="{ mono: item.unit || item.key === 'tps' }">
          {{ item.value }}<span v-if="item.unit" class="metric-unit">{{ item.unit }}</span>
        </span>
        <span class="metric-label">{{ item.label }}</span>
        <span class="metric-hint">{{ item.hint }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metrics-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.live-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: var(--danger);
  color: white;
  padding: 1px 6px;
  border-radius: 3px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.metric-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.1;
}

.mono {
  font-family: var(--font-mono);
}

.metric-unit {
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  margin-left: 2px;
}

.metric-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--ink);
}

.metric-hint {
  font-size: 10px;
  color: var(--muted);
  line-height: 1.3;
}
</style>
