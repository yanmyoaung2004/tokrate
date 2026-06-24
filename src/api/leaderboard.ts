import type { BenchmarkRun, LeaderboardEntry } from "@/types";

const API_URL = "https://leaderboard.tokrate.app/api";

export interface PublishPayload {
  engine: string;
  model: string;
  quantization?: string;
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
  params?: { engine?: string; model?: string; sort?: string }
): Promise<LeaderboardEntry[]> {
  try {
    const url = new URL(`${API_URL}/results`);
    if (params?.engine) url.searchParams.set("engine", params.engine);
    if (params?.model) url.searchParams.set("model", params.model);
    if (params?.sort) url.searchParams.set("sort", params.sort);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export function runToPublishPayload(run: BenchmarkRun): PublishPayload {
  return {
    engine: run.engine,
    model: run.model,
    tps: run.tps,
    ttft: run.ttft,
    tpot: run.tpot,
    totalTokens: run.totalTokens,
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
  };
}
