<script setup lang="ts">
import { computed } from "vue";
import type { RunMetrics } from "@/types";

const props = defineProps<{
  metrics: Partial<RunMetrics>;
  thinkingTps?: number;
  answeringTps?: number;
  streaming: boolean;
}>();

const items = computed(() => [
  {
    label: "TTFT", value: props.metrics.ttft ? format(props.metrics.ttft) : "—",
  },
  {
    label: "Speed",
    value: props.metrics.tps ? props.metrics.tps.toFixed(1) : "—",
    unit: "tok/s",
  },
  {
    label: "Tokens",
    value: props.metrics.completionTokens?.toString() ?? "—",
  },
  {
    label: "Duration",
    value: props.metrics.duration ? format(props.metrics.duration) : "—",
  },
]);

function format(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
</script>

<template>
  <div class="metrics-bar">
    <div v-for="item in items" :key="item.label" class="metric">
      <span class="metric-value">{{ item.value }}<span v-if="item.unit" class="unit">{{ item.unit }}</span></span>
      <span class="metric-label">{{ item.label }}</span>
    </div>
    <div v-if="thinkingTps !== undefined" class="metric phase thinking" title="Thinking phase speed">
      <span class="metric-value thinking-val">{{ thinkingTps.toFixed(1) }}<span class="unit">tok/s</span></span>
      <span class="metric-label">Thinking</span>
    </div>
    <div v-if="answeringTps !== undefined" class="metric phase answering" title="Answering phase speed">
      <span class="metric-value answering-val">{{ answeringTps.toFixed(1) }}<span class="unit">tok/s</span></span>
      <span class="metric-label">Answering</span>
    </div>
    <span v-if="streaming" class="live-dot" title="Streaming live">●</span>
  </div>
</template>

<style scoped>
.metrics-bar {
  display: flex;
  align-items: stretch;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: var(--space-1) var(--space-3);
  min-width: 60px;
  border-right: 1px solid var(--border);
}

.metric:last-of-type {
  border-right: none;
}

.metric.phase {
  background: color-mix(in oklch, var(--bg) 60%, transparent);
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.1;
}

.unit {
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
  margin-left: 1px;
}

.metric-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.thinking-val { color: #6b8cff; }
.answering-val { color: #8854D0; }

.live-dot {
  display: flex;
  align-items: center;
  padding: 0 var(--space-2);
  font-size: 12px;
  color: var(--danger);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
