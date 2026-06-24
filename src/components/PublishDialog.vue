<script setup lang="ts">
import { ref } from "vue";
import type { BenchmarkRun } from "@/types";

const props = defineProps<{
  run: BenchmarkRun;
}>();

const emit = defineEmits<{
  (e: "publish"): void;
  (e: "close"): void;
}>();

const publishing = ref(false);
const done = ref(false);

async function publish() {
  publishing.value = true;
  try {
    const { publishResult, runToPublishPayload } = await import("@/api/leaderboard");
    await publishResult(runToPublishPayload(props.run));
    done.value = true;
    emit("publish");
  } finally {
    publishing.value = false;
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog">
      <h2 class="dialog-title">{{ done ? "Published!" : "Publish to Leaderboard" }}</h2>

      <div v-if="done" class="done-state">
        <p>Your result has been submitted.</p>
        <button class="btn btn-primary" @click="emit('close')">Done</button>
      </div>

      <template v-else>
        <p class="dialog-desc">Share anonymized results with the community. No prompts or responses are sent.</p>

        <div class="preview">
          <div class="preview-row"><span class="preview-label">Model</span><span class="preview-value">{{ run.model }}</span></div>
          <div class="preview-row"><span class="preview-label">Engine</span><span class="preview-value">{{ run.engine }}</span></div>
          <div class="preview-row"><span class="preview-label">TPS</span><span class="preview-value mono">{{ run.tps.toFixed(1) }}</span></div>
          <div class="preview-row"><span class="preview-label">TTFT</span><span class="preview-value mono">{{ (run.ttft / 1000).toFixed(2) }}s</span></div>
          <div class="preview-row"><span class="preview-label">TPOT</span><span class="preview-value mono">{{ run.tpot.toFixed(0) }}ms</span></div>
          <div class="preview-row"><span class="preview-label">Tokens</span><span class="preview-value mono">{{ run.completionTokens }} / {{ run.totalTokens }}</span></div>
        </div>

        <div class="dialog-actions">
          <button class="btn btn-ghost" @click="emit('close')">Cancel</button>
          <button class="btn btn-primary" @click="publish" :disabled="publishing">
            {{ publishing ? "Publishing..." : "Publish" }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  min-width: 400px;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
}

.dialog-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.preview-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-label {
  font-size: 12px;
  color: var(--muted);
}

.preview-value {
  font-size: 13px;
  font-weight: 500;
}

.mono {
  font-family: var(--font-mono);
}

.done-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) 0;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.btn:disabled { opacity: 0.5; cursor: default; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-ghost { background: transparent; border-color: var(--border); color: var(--muted); }
.btn-ghost:hover { background: var(--surface); color: var(--ink); }
</style>
