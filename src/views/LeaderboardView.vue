<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import type { LeaderboardEntry } from "@/types";
import { fetchLeaderboard } from "@/api/leaderboard";

interface LbRow extends LeaderboardEntry {
  _expanded?: boolean;
}

const entries = ref<LbRow[]>([]);
const loading = ref(true);
const sortKey = ref<"tps" | "ttft">("tps");
const filterEngine = ref("");
const filterModel = ref("");

const engines = computed(() => [...new Set(entries.value.map((e) => e.engine))]);
const models = computed(() => [...new Set(entries.value.map((e) => e.model))]);

const sorted = computed(() => {
  let list = [...entries.value];
  if (filterEngine.value) list = list.filter((e) => e.engine === filterEngine.value);
  if (filterModel.value) list = list.filter((e) => e.model === filterModel.value);
  list.sort((a, b) => (sortKey.value === "tps" ? b.tps - a.tps : a.ttft - b.ttft));
  return list;
});

onMounted(async () => {
  loading.value = true;
  entries.value = await fetchLeaderboard();
  loading.value = false;
});

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
</script>

<template>
  <div class="lb-page">
    <div class="page-header">
      <h1 class="page-title">Leaderboard</h1>
      <p class="page-subtitle">Community-sourced local LLM benchmark results.</p>
    </div>

    <div class="filters">
      <select v-model="filterEngine" class="filter-select">
        <option value="">All engines</option>
        <option v-for="e in engines" :key="e" :value="e">{{ e }}</option>
      </select>
      <select v-model="filterModel" class="filter-select">
        <option value="">All models</option>
        <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
      </select>
      <div class="sort-toggle">
        <button class="sort-btn" :class="{ active: sortKey === 'tps' }" @click="sortKey = 'tps'">TPS</button>
        <button class="sort-btn" :class="{ active: sortKey === 'ttft' }" @click="sortKey = 'ttft'">TTFT</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else-if="!sorted.length" class="empty">
      <p>No results yet. Be the first to publish from the History page!</p>
    </div>

    <div v-else class="table-wrap">
      <table class="lb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Model</th>
            <th>Engine</th>
            <th>GPU</th>
            <th class="num">TPS</th>
            <th class="num">TTFT</th>
            <th class="num">Runs</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, i) in sorted" :key="entry.id">
            <td class="rank">{{ i + 1 }}</td>
            <td class="model">{{ entry.model }}</td>
            <td class="engine">{{ entry.engine }}</td>
            <td class="gpu">{{ entry.gpu || "—" }}</td>
            <td class="num mono">{{ entry.tps.toFixed(1) }}</td>
            <td class="num mono">{{ formatMs(entry.ttft) }}</td>
            <td class="num muted">{{ entry.runCount }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.lb-page { height: 100%; display: flex; flex-direction: column; gap: var(--space-4); max-width: 1000px; margin: 0 auto; width: 100%; padding: var(--space-6); overflow: hidden; }
.page-title { font-size: 20px; font-weight: 600; }
.page-subtitle { font-size: 13px; color: var(--muted); }

.filters { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; }
.filter-select { padding: var(--space-1) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 13px; }
.filter-select:focus { outline: none; border-color: var(--primary); }
.sort-toggle { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; margin-left: auto; }
.sort-btn { padding: var(--space-1) var(--space-3); font-size: 12px; font-weight: 500; background: transparent; border: none; color: var(--muted); cursor: pointer; }
.sort-btn.active { background: var(--primary); color: white; }

.loading, .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); }

.table-wrap { flex: 1; overflow-y: auto; }
.lb-table { width: 100%; border-collapse: collapse; }
.lb-table th { text-align: left; padding: var(--space-2) var(--space-3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); }
.lb-table td { padding: var(--space-2) var(--space-3); font-size: 13px; border-bottom: 1px solid var(--border); }
.lb-table tbody tr:hover { background: var(--surface); }
.rank { color: var(--muted); font-family: var(--font-mono); font-size: 12px; width: 32px; }
.model { font-weight: 500; }
.engine, .gpu { color: var(--muted); font-size: 12px; }
.num { text-align: right; }
.mono { font-family: var(--font-mono); }
.muted { color: var(--muted); }
</style>
