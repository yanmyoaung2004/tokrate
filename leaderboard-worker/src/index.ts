// TokRate Leaderboard API — Cloudflare Worker
// Deploy: npx wrangler deploy
// Requires KV namespace "LEADERBOARD" bound to the worker.

export interface ResultEntry {
  id: string;
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
  timestamp: number;
}

interface Env {
  LEADERBOARD: KVNamespace;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // POST /api/results — submit a result
    if (request.method === "POST" && path === "/api/results") {
      try {
        const body: Omit<ResultEntry, "id" | "timestamp"> = await request.json();
        const entry: ResultEntry = {
          ...body,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        };

        // Validate required fields
        if (!entry.engine || !entry.model || typeof entry.tps !== "number") {
          return new Response(JSON.stringify({ error: "engine, model, and tps are required" }), {
            status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }

        // Store by ID
        await env.LEADERBOARD.put(`result:${entry.id}`, JSON.stringify(entry));

        // Add to model index
        const modelKey = `by_model:${entry.model}`;
        const modelIds = JSON.parse((await env.LEADERBOARD.get(modelKey)) || "[]") as string[];
        modelIds.push(entry.id);
        await env.LEADERBOARD.put(modelKey, JSON.stringify(modelIds));

        // Add to engine index
        const engineKey = `by_engine:${entry.engine}`;
        const engineIds = JSON.parse((await env.LEADERBOARD.get(engineKey)) || "[]") as string[];
        engineIds.push(entry.id);
        await env.LEADERBOARD.put(engineKey, JSON.stringify(engineIds));

        // Add to master list
        const allIds = JSON.parse((await env.LEADERBOARD.get("all_ids")) || "[]") as string[];
        allIds.push(entry.id);
        await env.LEADERBOARD.put("all_ids", JSON.stringify(allIds));

        return new Response(JSON.stringify({ success: true, id: entry.id }), {
          status: 201, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }
    }

    // GET /api/results — list results
    if (request.method === "GET" && path === "/api/results") {
      const sort = url.searchParams.get("sort") || "tps";
      const engine = url.searchParams.get("engine");
      const model = url.searchParams.get("model");
      const osFilter = url.searchParams.get("os");
      const gpuFilter = url.searchParams.get("gpu");

      let ids: string[];

      if (engine) {
        ids = JSON.parse((await env.LEADERBOARD.get(`by_engine:${engine}`)) || "[]");
      } else if (model) {
        ids = JSON.parse((await env.LEADERBOARD.get(`by_model:${model}`)) || "[]");
      } else {
        ids = JSON.parse((await env.LEADERBOARD.get("all_ids")) || "[]");
      }

      // Fetch all results in parallel
      let results: ResultEntry[] = (
        await Promise.all(ids.map((id) => env.LEADERBOARD.get(`result:${id}`)))
      )
        .filter((r): r is string => r !== null)
        .map((r) => JSON.parse(r));

      // Apply hardware filters
      if (osFilter) results = results.filter((r) => r.os?.toLowerCase().includes(osFilter.toLowerCase()));
      if (gpuFilter) results = results.filter((r) => r.gpu?.toLowerCase().includes(gpuFilter.toLowerCase()));

      // Sort
      if (sort === "ttft") {
        results.sort((a, b) => a.ttft - b.ttft);
      } else {
        results.sort((a, b) => b.tps - a.tps);
      }

      return new Response(JSON.stringify(results), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
