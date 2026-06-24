import { defineStore } from "pinia";
import { ref } from "vue";
import type { BenchmarkRun } from "@/types";

export const useHistoryStore = defineStore("history", () => {
  const runs = ref<BenchmarkRun[]>([]);
  const loaded = ref(false);

  async function load() {
    try {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load("history.json");
      const saved = (await store.get("runs")) as BenchmarkRun[] | null;
      if (saved) runs.value = saved;
    } catch {
      // Running in browser dev mode
    }
    loaded.value = true;
  }

  async function addRun(run: BenchmarkRun) {
    runs.value.unshift(run);
    await persist();
  }

  async function removeRun(id: string) {
    runs.value = runs.value.filter((r) => r.id !== id);
    await persist();
  }

  async function clearAll() {
    runs.value = [];
    await persist();
  }

  async function persist() {
    try {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load("history.json");
      await store.set("runs", runs.value);
      await store.save();
    } catch {
      // Running in browser dev mode
    }
  }

  return { runs, loaded, load, addRun, removeRun, clearAll };
});
