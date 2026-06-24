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
  { label: "Ollama (default)", url: "http://localhost:11434", apiKey: "" },
  { label: "Ollama (remote)", url: "http://localhost:11434", apiKey: "" },
  { label: "OpenAI compatible", url: "http://localhost:8000", apiKey: "" },
];

export const useConfigStore = defineStore("config", () => {
  const serverUrl = ref("http://localhost:11434");
  const apiKey = ref("");
  const defaultModel = ref("");
  const theme = ref<"dark" | "light">("dark");
  const timeout = ref(30000);
  const providers = ref<Provider[]>([]);
  const activeProvider = ref<string>("");
  const loaded = ref(false);

  async function load() {
    try {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load("config.json");
      serverUrl.value = ((await store.get("serverUrl")) as string) ?? "http://localhost:11434";
      apiKey.value = ((await store.get("apiKey")) as string) ?? "";
      defaultModel.value = ((await store.get("defaultModel")) as string) ?? "";
      theme.value = ((await store.get("theme")) as "dark" | "light") ?? "dark";
      timeout.value = ((await store.get("timeout")) as number) ?? 30000;
      providers.value = ((await store.get("providers")) as Provider[]) ?? [];
      activeProvider.value = ((await store.get("activeProvider")) as string) ?? "";
    } catch {
      // Running in browser dev mode without Tauri
    }
    if (!providers.value.length) {
      providers.value = [...DEFAULT_PROVIDERS];
    }
    loaded.value = true;
  }

  async function save() {
    try {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load("config.json");
      await store.set("serverUrl", serverUrl.value);
      await store.set("apiKey", apiKey.value);
      await store.set("defaultModel", defaultModel.value);
      await store.set("theme", theme.value);
      await store.set("timeout", timeout.value);
      await store.set("providers", providers.value);
      await store.set("activeProvider", activeProvider.value);
      await store.save();
    } catch {
      // Running in browser dev mode without Tauri
    }
    document.documentElement.setAttribute("data-theme", theme.value);
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
