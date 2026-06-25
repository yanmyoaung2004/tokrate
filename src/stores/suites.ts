import { defineStore } from "pinia";
import { ref } from "vue";

export interface BenchPrompt {
  id: string;
  name: string;
  content: string;
}

export interface BenchSuite {
  id: string;
  name: string;
  prompts: BenchPrompt[];
  created: number;
}

const STORAGE_KEY = "tokrate-suites";

async function persist(suites: BenchSuite[]) {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    const store = await load("suites.json");
    await store.set("suites", suites);
    await store.save();
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(suites));
  }
}

async function loadSaved(): Promise<BenchSuite[]> {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    const store = await load("suites.json");
    return ((await store.get("suites")) as BenchSuite[]) ?? [];
  } catch {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

let _id = Date.now();
function id(): string {
  return (++_id).toString(36);
}

export const useSuitesStore = defineStore("suites", () => {
  const suites = ref<BenchSuite[]>([]);
  const loaded = ref(false);

  async function load() {
    suites.value = await loadSaved();
    loaded.value = true;
  }

  async function create(name: string): Promise<BenchSuite> {
    const s: BenchSuite = { id: id(), name, prompts: [], created: Date.now() };
    suites.value.unshift(s);
    await persist(suites.value);
    return s;
  }

  async function remove(id: string) {
    suites.value = suites.value.filter((s) => s.id !== id);
    await persist(suites.value);
  }

  async function rename(id: string, name: string) {
    const s = suites.value.find((su) => su.id === id);
    if (s) { s.name = name; await persist(suites.value); }
  }

  async function addPrompt(suiteId: string, prompt: BenchPrompt) {
    const s = suites.value.find((su) => su.id === suiteId);
    if (s) { s.prompts.push(prompt); await persist(suites.value); }
  }

  async function removePrompt(suiteId: string, promptId: string) {
    const s = suites.value.find((su) => su.id === suiteId);
    if (s) { s.prompts = s.prompts.filter((p) => p.id !== promptId); await persist(suites.value); }
  }

  async function updatePrompt(suiteId: string, promptId: string, data: Partial<BenchPrompt>) {
    const s = suites.value.find((su) => su.id === suiteId);
    if (!s) return;
    const p = s.prompts.find((pr) => pr.id === promptId);
    if (p) { Object.assign(p, data); await persist(suites.value); }
  }

  return { suites, loaded, load, create, remove, rename, addPrompt, removePrompt, updatePrompt };
});
