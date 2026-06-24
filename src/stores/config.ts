import { defineStore } from "pinia";
import { ref } from "vue";

export interface AppConfig {
  serverUrl: string;
  apiKey: string;
  defaultModel: string;
  theme: "dark" | "light";
  timeout: number;
}

export const useConfigStore = defineStore("config", () => {
  const serverUrl = ref("http://localhost:11434");
  const apiKey = ref("");
  const defaultModel = ref("");
  const theme = ref<"dark" | "light">("dark");
  const timeout = ref(30000);
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
    } catch {
      // Running in browser dev mode without Tauri
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
      await store.save();
    } catch {
      // Running in browser dev mode without Tauri
    }
    document.documentElement.setAttribute("data-theme", theme.value);
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
    loaded,
    load,
    save,
    toggleTheme,
  };
});
