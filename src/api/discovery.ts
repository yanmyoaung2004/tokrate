// Auto-detection of local LLM engines

export interface DiscoveredEngine {
  port: number;
  engine: string;
  url: string;
  serverUrl: string;
  label: string;
  models: string[];
}

const ENGINE_PORTS = [
  { port: 11434, engine: "Ollama" },
  { port: 8000, engine: "vLLM" },
  { port: 8080, engine: "llama.cpp" },
  { port: 1234, engine: "LM Studio" },
  { port: 30000, engine: "SGLang" },
];

async function tryPort(port: number, engine: string): Promise<DiscoveredEngine | null> {
  const url = `http://localhost:${port}`;

  // First check via OpenAI /v1/models
  try {
    const res = await fetch(`${url}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({ data: null }));
      const models: string[] = (body.data || []).map((m: { id: string }) => m.id);
      return {
        port,
        engine,
        url,
        serverUrl: url,
        label: `${engine} (localhost:${port})`,
        models,
      };
    }
  } catch {
    // Not responding — try Ollama-specific API
  }

  // Fallback: Ollama's /api/tags endpoint
  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({ models: [] }));
      const models = (body.models || []).map((m: { name: string }) => m.name);
      return {
        port,
        engine,
        url,
        serverUrl: url,
        label: `${engine} (localhost:${port})`,
        models,
      };
    }
  } catch {
    // Not responding
  }

  return null;
}

export async function scanLocalEngines(
  onProgress?: (found: number, total: number) => void
): Promise<DiscoveredEngine[]> {
  const results: DiscoveredEngine[] = [];
  const total = ENGINE_PORTS.length;

  for (let i = 0; i < total; i++) {
    const { port, engine } = ENGINE_PORTS[i];
    onProgress?.(i, total);
    const found = await tryPort(port, engine);
    if (found) results.push(found);
  }

  onProgress?.(total, total);
  return results;
}
