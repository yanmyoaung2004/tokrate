import { defineStore } from "pinia";
import { ref } from "vue";

export interface ProxyStatus {
  running: boolean;
  port: number;
  request_count: number;
}

export const useProxyStore = defineStore("proxy", () => {
  const running = ref(false);
  const port = ref(8080);
  const requestCount = ref(0);
  const error = ref("");

  async function refresh() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const status = await invoke<ProxyStatus>("proxy_status");
      running.value = status.running;
      port.value = status.port;
      requestCount.value = status.request_count;
      error.value = "";
    } catch {
      // Not in Tauri — use localStorage for browser dev
      const raw = localStorage.getItem("tokrate-proxy");
      if (raw) {
        const s = JSON.parse(raw);
        running.value = s.running ?? false;
        port.value = s.port ?? 8080;
        requestCount.value = s.request_count ?? 0;
      }
    }
  }

  async function start(targetPort: number, backendUrl: string) {
    error.value = "";
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("proxy_start", { port: targetPort, backendUrl });
      port.value = targetPort;
      running.value = true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      error.value = msg;
      // Browser fallback: just pretend it works
      if (typeof (window as any).__TAURI__ === "undefined") {
        running.value = true;
        port.value = targetPort;
        localStorage.setItem("tokrate-proxy", JSON.stringify({ running: true, port: targetPort, request_count: 0 }));
      }
    }
  }

  async function stop() {
    error.value = "";
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("proxy_stop");
      running.value = false;
    } catch {
      if (typeof (window as any).__TAURI__ === "undefined") {
        running.value = false;
        localStorage.setItem("tokrate-proxy", JSON.stringify({ running: false, port: port.value, request_count: 0 }));
      }
    }
  }

  return { running, port, requestCount, error, refresh, start, stop };
});
