import type { BenchmarkRun, LeaderboardEntry } from "@/types";

const API_URL = "https://leaderboard.tokrate.app/api";

export interface PublishPayload {
  engine: string;
  model: string;
  quantization?: string;
  os?: string;
  cpu?: string;
  ram?: string;
  gpu?: string;
  tps: number;
  ttft: number;
  tpot: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

export async function publishResult(data: PublishPayload): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
  } catch {
    // For MVP: silently handle offline - data is saved locally
    console.log("Leaderboard unavailable, result stored locally");
  }
}

export async function fetchLeaderboard(
  params?: { engine?: string; model?: string; sort?: string; os?: string; gpu?: string }
): Promise<LeaderboardEntry[]> {
  try {
    const url = new URL(`${API_URL}/results`);
    if (params?.engine) url.searchParams.set("engine", params.engine);
    if (params?.model) url.searchParams.set("model", params.model);
    if (params?.sort) url.searchParams.set("sort", params.sort);
    if (params?.os) url.searchParams.set("os", params.os);
    if (params?.gpu) url.searchParams.set("gpu", params.gpu);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function runToPublishPayload(run: BenchmarkRun): Promise<PublishPayload> {
  let os = ""; let cpu = ""; let ram = ""; let gpu = "";
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const hw = await invoke<{ os: string; cpu: string; ram: string; gpu: string }>("get_hardware_info");
    os = hw.os; cpu = hw.cpu; ram = hw.ram; gpu = hw.gpu;
  } catch {
    // Browser mode — no hardware info available
  }

  return {
    engine: run.engine,
    model: run.model,
    os: os || undefined,
    cpu: cpu || undefined,
    ram: ram || undefined,
    gpu: gpu || undefined,
    tps: run.tps,
    ttft: run.ttft,
    tpot: run.tpot,
    totalTokens: run.totalTokens,
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
  };
}
