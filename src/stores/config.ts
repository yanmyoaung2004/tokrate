import { defineStore } from "pinia";
import { ref } from "vue";

export interface AppConfig {
  serverUrl: string;
  apiKey: string;
  defaultModel: string;
  theme: "dark" | "light";
  timeout: number;
}

export interface Provider {
  label: string;
  url: string;
  apiKey: string;
}

export const DEFAULT_PROVIDERS: Provider[] = [
  { label: "Ollama (localhost)", url: "http://localhost:11434", apiKey: "" },
];

const STORAGE_KEY = "tokrate-config";

async function storeGet<T>(key: string): Promise<T | null> {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    const store = await load("config.json");
    return (await store.get(key)) as T | null;
  } catch {
    // Browser mode — use localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[key] ?? null;
  }
}

async function storeSet(key: string, value: unknown): Promise<void> {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    const store = await load("config.json");
    await store.set(key, value);
    await store.save();
  } catch {
    // Browser mode — use localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

export const useConfigStore = defineStore("config", () => {
  const serverUrl = ref("http://localhost:11434");
  const apiKey = ref("");
  const defaultModel = ref("");
  const theme = ref<"dark" | "light">("dark");
  const timeout = ref(30000);
  const providers = ref<Provider[]>([]);
  const activeProvider = ref("");
  const loaded = ref(false);

  async function load() {
    try {
      const s = await storeGet<string>("serverUrl");
      if (s !== null) serverUrl.value = s;
      const a = await storeGet<string>("apiKey");
      if (a !== null) apiKey.value = a;
      const d = await storeGet<string>("defaultModel");
      if (d !== null) defaultModel.value = d;
      const t = await storeGet<string>("theme");
      if (t !== null) theme.value = t as "dark" | "light";
      const to = await storeGet<number>("timeout");
      if (to !== null) timeout.value = to;
      const p = await storeGet<Provider[]>("providers");
      if (p !== null) providers.value = p;
      const ap = await storeGet<string>("activeProvider");
      if (ap !== null) activeProvider.value = ap;
    } catch {
      // Ignore
    }
    if (!providers.value.length) {
      providers.value = [...DEFAULT_PROVIDERS];
    }
    // Deduplicate providers by URL (keep last occurrence)
    const seen = new Set<string>();
    providers.value = providers.value.filter((p) => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
    loaded.value = true;
  }

  async function save() {
    // Deduplicate providers by URL before saving
    const seen = new Set<string>();
    providers.value = providers.value.filter((p) => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
    // Sync theme to DOM immediately (before async persistence)
    document.documentElement.setAttribute("data-theme", theme.value);
    await storeSet("serverUrl", serverUrl.value);
    await storeSet("apiKey", apiKey.value);
    await storeSet("defaultModel", defaultModel.value);
    await storeSet("theme", theme.value);
    await storeSet("timeout", timeout.value);
    await storeSet("providers", providers.value);
    await storeSet("activeProvider", activeProvider.value);
  }

  function selectProvider(url: string, key: string) {
    serverUrl.value = url;
    apiKey.value = key;
    activeProvider.value = url;
    save();
  }

  function addProvider(label: string, url: string, apiKey: string) {
    providers.value.push({ label, url, apiKey });
    selectProvider(url, apiKey);
  }

  function removeProvider(url: string) {
    providers.value = providers.value.filter((p) => p.url !== url);
    if (providers.value.length && activeProvider.value === url) {
      const first = providers.value[0];
      selectProvider(first.url, first.apiKey);
    }
    save();
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
    save();
  }

  return {
    serverUrl,
    apiKey,
    defaultModel,
    theme,
    timeout,
    providers,
    activeProvider,
    loaded,
    load,
    save,
    toggleTheme,
    selectProvider,
    addProvider,
    removeProvider,
  };
});
