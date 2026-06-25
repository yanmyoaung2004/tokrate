import { defineStore } from "pinia";
import { ref } from "vue";
import type { BenchmarkRun } from "@/types";

const HISTORY_KEY = "tokrate-history";

async function persistData(runs: BenchmarkRun[]) {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    const store = await load("history.json");
    await store.set("runs", runs);
    await store.save();
  } catch {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(runs));
  }
}

async function loadData(): Promise<BenchmarkRun[]> {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    const store = await load("history.json");
    return ((await store.get("runs")) as BenchmarkRun[]) ?? [];
  } catch {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

export interface DeltaAlert {
  id: string;
  runId: string;
  engine: string;
  model: string;
  oldAvgTps: number;
  newTps: number;
  direction: "up" | "down";
  percent: number;
  timestamp: number;
}

export const useHistoryStore = defineStore("history", () => {
  const runs = ref<BenchmarkRun[]>([]);
  const loaded = ref(false);
  const deltas = ref<DeltaAlert[]>([]);

  async function load() {
    runs.value = await loadData();
    loaded.value = true;
  }

  async function addRun(run: BenchmarkRun) {
    runs.value.unshift(run);
    await persistData(runs.value);
    checkDelta(run);
  }

  async function removeRun(id: string) {
    runs.value = runs.value.filter((r) => r.id !== id);
    deltas.value = deltas.value.filter((d) => d.runId !== id);
    await persistData(runs.value);
  }

  async function clearAll() {
    runs.value = [];
    deltas.value = [];
    await persistData(runs.value);
  }

  function checkDelta(run: BenchmarkRun) {
    if (!run.tps) return;
    const recent = runs.value.filter(
      (r) => r.id !== run.id && r.engine === run.engine && r.model === run.model && r.tps > 0
    );
    if (recent.length < 2) return;
    const recentBatch = recent.slice(0, 10);
    const avg = recentBatch.reduce((s, r) => s + r.tps, 0) / recentBatch.length;
    if (avg <= 0) return;
    const change = (run.tps - avg) / avg;
    if (Math.abs(change) < 0.1) return;
    const direction = change > 0 ? "up" : "down";
    deltas.value.unshift({
      id: "delta-" + run.id,
      runId: run.id,
      engine: run.engine,
      model: run.model,
      oldAvgTps: avg,
      newTps: run.tps,
      direction,
      percent: Math.abs(Math.round(change * 100)),
      timestamp: run.timestamp,
    });
    if (deltas.value.length > 50) deltas.value = deltas.value.slice(0, 50);
  }

  function dismissDelta(id: string) {
    deltas.value = deltas.value.filter((d) => d.id !== id);
  }

  return { runs, loaded, deltas, load, addRun, removeRun, clearAll, checkDelta, dismissDelta };
});
