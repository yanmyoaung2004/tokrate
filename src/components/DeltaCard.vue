<script setup lang="ts">
import type { DeltaAlert } from "@/stores/history";

defineProps<{
  delta: DeltaAlert;
}>();

const emit = defineEmits<{
  dismiss: [id: string];
}>();
</script>

<template>
  <div class="delta-card" :class="delta.direction">
    <div class="delta-icon">{{ delta.direction === "up" ? "▲" : "▼" }}</div>
    <div class="delta-body">
      <div class="delta-title">
        {{ delta.model }}
        <span class="delta-badge" :class="delta.direction">{{ delta.direction === "up" ? "+" : "−" }}{{ delta.percent }}%</span>
      </div>
      <div class="delta-desc">
        TPS changed from <strong>{{ delta.oldAvgTps.toFixed(1) }}</strong> to <strong>{{ delta.newTps.toFixed(1) }}</strong> tok/s
        (avg of last {{ delta.oldAvgTps.toFixed(1) > delta.newTps.toFixed(1) ? '↓' : '↑' }})
      </div>
      <div class="delta-engine">{{ delta.engine }}</div>
    </div>
    <button class="delta-dismiss" @click="emit('dismiss', delta.id)" title="Dismiss">✕</button>
  </div>
</template>

<style scoped>
.delta-card {
  display: flex; gap: var(--space-2); align-items: flex-start;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md); border: 1px solid var(--border);
  background: var(--surface);
}
.delta-card.up { border-left: 3px solid var(--success); }
.delta-card.down { border-left: 3px solid var(--danger); }

.delta-icon { font-size: 14px; line-height: 1.4; flex-shrink: 0; }
.delta-card.up .delta-icon { color: var(--success); }
.delta-card.down .delta-icon { color: var(--danger); }

.delta-body { flex: 1; min-width: 0; }
.delta-title { font-size: 12px; font-weight: 600; margin-bottom: 1px; }
.delta-badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; margin-left: var(--space-1); }
.delta-badge.up { background: color-mix(in oklch, var(--success) 15%, transparent); color: var(--success); }
.delta-badge.down { background: color-mix(in oklch, var(--danger) 15%, transparent); color: var(--danger); }

.delta-desc { font-size: 11px; color: var(--muted); margin-bottom: 1px; }
.delta-engine { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }

.delta-dismiss { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 11px; padding: 2px; line-height: 1; }
.delta-dismiss:hover { color: var(--ink); }
</style>
