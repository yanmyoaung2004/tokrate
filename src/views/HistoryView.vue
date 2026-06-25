<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useHistoryStore } from "@/stores/history";
import { useToastStore } from "@/stores/toast";
import type { BenchmarkRun } from "@/types";
import PublishDialog from "@/components/PublishDialog.vue";

const router = useRouter();
const history = useHistoryStore();
const toast = useToastStore();
const selectedRun = ref<BenchmarkRun | null>(null);
const publishRun = ref<BenchmarkRun | null>(null);
const search = ref("");
const sourceFilter = ref<"all" | "playground" | "proxy">("all");

const filteredRuns = computed(() => {
  let runs = history.runs;
  if (sourceFilter.value !== "all") {
    runs = runs.filter((r) => r.source === sourceFilter.value);
  }
  if (search.value) {
    const f = search.value.toLowerCase();
    runs = runs.filter(
      (r) =>
        r.model.toLowerCase().includes(f) ||
        r.prompt.toLowerCase().includes(f) ||
        r.engine.toLowerCase().includes(f)
    );
  }
  return runs;
});

onMounted(async () => {
  await history.load();
});

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

async function handleDelete(id: string) {
  await history.removeRun(id);
  if (selectedRun.value?.id === id) selectedRun.value = null;
  toast.add("Run deleted", "info");
}

function reRun(run: BenchmarkRun) {
  router.push({
    path: "/",
    query: { prompt: run.prompt, model: run.model },
  });
}

async function handleClearAll() {
  await history.clearAll();
  selectedRun.value = null;
  toast.add("All runs cleared", "info");
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
</script>

<template>
  <PublishDialog
    v-if="publishRun"
    :run="publishRun"
    @publish="publishRun = null"
    @close="publishRun = null"
  />
  <div class="history-page">
    <div class="page-header">
      <h1 class="page-title">History</h1>
      <button
        v-if="history.runs.length"
        class="btn btn-ghost btn-sm"
        @click="handleClearAll"
      >
        Clear All
      </button>
    </div>

    <div v-if="!history.loaded" class="loading">Loading...</div>

    <div v-else-if="!history.runs.length" class="empty-state">
      <div class="empty-icon">↻</div>
      <h3 class="empty-title">No saved runs yet</h3>
      <p class="empty-desc">Run a benchmark in the Playground and click "Save Run" to see it here.</p>
    </div>

    <div v-else class="history-layout">
      <div class="runs-list">
        <div class="source-tabs">
          <button class="source-tab" :class="{ active: sourceFilter === 'all' }" @click="sourceFilter = 'all'">All</button>
          <button class="source-tab" :class="{ active: sourceFilter === 'playground' }" @click="sourceFilter = 'playground'">Playground</button>
          <button class="source-tab" :class="{ active: sourceFilter === 'proxy' }" @click="sourceFilter = 'proxy'">Proxy</button>
        </div>
        <input
          v-model="search"
          class="search-input"
          placeholder="Search by model, prompt, engine..."
        />
        <div class="runs-scroll">
          <div
            v-for="run in filteredRuns"
            :key="run.id"
            class="run-card"
            :class="{ selected: selectedRun?.id === run.id }"
            @click="selectedRun = run"
          >
            <div class="run-model">
              {{ run.model }}
              <span class="source-badge" :class="run.source">{{ run.source === "proxy" ? "Proxy" : "Play" }}</span>
            </div>
            <div class="run-meta">
              <span>{{ formatDate(run.timestamp) }}</span>
              <span>{{ run.tps.toFixed(1) }} tok/s</span>
            </div>
            <div class="run-preview">{{ run.prompt.slice(0, 80) }}{{ run.prompt.length > 80 ? "..." : "" }}</div>
          </div>
        </div>
      </div>

      <div v-if="selectedRun" class="run-detail">
        <div class="detail-header">
          <h2>{{ selectedRun.model }}</h2>
          <div class="detail-actions">
            <button class="btn btn-secondary btn-sm" @click="reRun(selectedRun)">Re-run</button>
            <button class="btn btn-secondary btn-sm" @click="publishRun = selectedRun">Publish</button>
            <button class="btn btn-ghost btn-sm" @click="handleDelete(selectedRun.id)">Delete</button>
          </div>
        </div>
        <div class="detail-meta">
          <div class="meta-row">
            <span class="meta-label">Date</span>
            <span>{{ formatDate(selectedRun.timestamp) }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Engine</span>
            <span class="mono">{{ selectedRun.engine }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Source</span>
            <span class="mono">{{ selectedRun.source === "proxy" ? "Proxy capture" : "Playground" }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">TTFT</span>
            <span class="mono">{{ formatMs(selectedRun.ttft) }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">TPS</span>
            <span class="mono">{{ selectedRun.tps.toFixed(1) }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">TPOT</span>
            <span class="mono">{{ selectedRun.tpot.toFixed(0) }}ms</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Tokens</span>
            <span class="mono">{{ selectedRun.promptTokens }} → {{ selectedRun.completionTokens }} ({{ selectedRun.totalTokens }})</span>
          </div>
        </div>
        <div class="detail-section">
          <h3>Prompt</h3>
          <pre class="detail-text">{{ selectedRun.prompt }}</pre>
        </div>
        <div class="detail-section">
          <h3>Response</h3>
          <pre class="detail-text">{{ selectedRun.response }}</pre>
        </div>
      </div>

      <div v-else class="detail-empty">
        <p>Select a run to view details.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--space-6);
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.page-title {
  font-size: 20px;
  font-weight: 600;
}

.loading, .empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  text-align: center;
}

.sub {
  font-size: 13px;
  margin-top: var(--space-2);
}

.history-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-4);
  min-height: 0;
}

.runs-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
}

.source-tabs {
  display: flex; gap: 0; border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;
}
.source-tab {
  flex: 1; padding: var(--space-1) var(--space-2); font-size: 11px; font-weight: 500;
  background: transparent; color: var(--muted); cursor: pointer; border: none;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.source-tab:hover { background: var(--surface); }
.source-tab.active { background: var(--surface); color: var(--ink); font-weight: 600; }
.source-tab + .source-tab { border-left: 1px solid var(--border); }

.source-badge {
  display: inline-block; font-size: 9px; font-weight: 600; padding: 1px 5px;
  border-radius: 3px; margin-left: var(--space-1); vertical-align: middle;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.source-badge.playground { background: color-mix(in oklch, var(--primary) 15%, transparent); color: var(--primary); }
.source-badge.proxy { background: color-mix(in oklch, var(--accent) 15%, transparent); color: var(--accent); }

.search-input {
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 13px;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary);
}

.runs-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.run-card {
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.run-card:hover,
.run-card.selected {
  border-color: var(--primary);
}

.run-model {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 2px;
}

.run-meta {
  display: flex;
  gap: var(--space-3);
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  margin-bottom: var(--space-1);
}

.run-preview {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-detail {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-actions {
  display: flex;
  gap: var(--space-2);
}

.detail-header h2 {
  font-size: 18px;
  font-weight: 600;
}

.detail-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.meta-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}

.detail-section h3 {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: var(--space-2);
}

.detail-text {
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
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

.btn-sm {
  padding: var(--space-1) var(--space-3);
  font-size: 12px;
}

.btn-ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--muted);
}

.btn-ghost:hover {
  background: var(--surface);
  color: var(--ink);
}

.btn-secondary {
  background: var(--surface);
  border-color: var(--border);
  color: var(--ink);
}

.btn-secondary:hover {
  background: var(--border);
}
</style>
