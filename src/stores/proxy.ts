import { defineStore } from "pinia";
import { ref } from "vue";
import type { BenchmarkRun } from "@/types";

export interface ProxyStatus {
  running: boolean;
  port: number;
  request_count: number;
}

export interface ProxyRunBuffer {
  id: string;
  model: string;
  prompt: string;
  response: string;
  ttft_ms: number;
  tps: number;
  tpot_ms: number;
  duration_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  timestamp: number;
}

const isTauri = typeof (window as any).__TAURI__ !== "undefined";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const useProxyStore = defineStore("proxy", () => {
  const running = ref(false);
  const port = ref(8080);
  const requestCount = ref(0);
  const error = ref("");

  async function refresh() {
    if (!isTauri) {
      const raw = localStorage.getItem("tokrate-proxy");
      if (raw) {
        const s = JSON.parse(raw);
        running.value = s.running ?? false;
        port.value = s.port ?? 8080;
        requestCount.value = s.request_count ?? 0;
      }
      return;
    }
    try {
      const status = await tauriInvoke<ProxyStatus>("proxy_status");
      running.value = status.running;
      port.value = status.port;
      requestCount.value = status.request_count;
      error.value = "";
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function start(targetPort: number, backendUrl: string) {
    error.value = "";
    if (!isTauri) {
      running.value = true;
      port.value = targetPort;
      localStorage.setItem("tokrate-proxy", JSON.stringify({ running: true, port: targetPort, request_count: 0 }));
      return;
    }
    try {
      await tauriInvoke("proxy_start", { port: targetPort, backendUrl });
      port.value = targetPort;
      running.value = true;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function stop() {
    error.value = "";
    if (!isTauri) {
      running.value = false;
      localStorage.setItem("tokrate-proxy", JSON.stringify({ running: false, port: port.value, request_count: 0 }));
      return;
    }
    try {
      await tauriInvoke("proxy_stop");
      running.value = false;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function drainRuns(): Promise<BenchmarkRun[]> {
    if (!isTauri) return [];
    try {
      const raw: ProxyRunBuffer[] = await tauriInvoke("proxy_drain_runs");
      return raw.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        engine: "proxy",
        model: r.model || "unknown",
        prompt: r.prompt,
        response: r.response,
        tps: r.tps,
        ttft: r.ttft_ms,
        tpot: r.tpot_ms,
        promptTokens: r.prompt_tokens,
        completionTokens: r.completion_tokens,
        totalTokens: r.prompt_tokens + r.completion_tokens,
        source: "proxy" as const,
      }));
    } catch {
      return [];
    }
  }

  return { running, port, requestCount, error, refresh, start, stop, drainRuns };
});
