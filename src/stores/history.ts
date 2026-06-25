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

export const useHistoryStore = defineStore("history", () => {
  const runs = ref<BenchmarkRun[]>([]);
  const loaded = ref(false);

  async function load() {
    runs.value = await loadData();
    loaded.value = true;
  }

  async function addRun(run: BenchmarkRun) {
    runs.value.unshift(run);
    await persistData(runs.value);
  }

  async function removeRun(id: string) {
    runs.value = runs.value.filter((r) => r.id !== id);
    await persistData(runs.value);
  }

  async function clearAll() {
    runs.value = [];
    await persistData(runs.value);
  }

  return { runs, loaded, load, addRun, removeRun, clearAll };
});
