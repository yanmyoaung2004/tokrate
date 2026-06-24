import type { StreamChunk, RunMetrics } from "@/types";

function normalizeUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

function cleanPath(base: string): string {
  try {
    const path = new URL(base).pathname;
    // If base already ends with /v1, don't prepend another /v1
    if (path.endsWith("/v1")) return "";
    if (path.endsWith("/v1/")) return "/";
    // If base contains /v1/ somewhere, don't add /v1
    if (path.includes("/v1/")) return "";
    return "/v1";
  } catch {
    return "/v1";
  }
}

function apiUrl(base: string, path: string): string {
  const normalized = normalizeUrl(base);
  return `${normalized}${cleanPath(base)}${path}`;
}

async function fetchWithCors(
  url: string,
  options?: RequestInit & { apiKey?: string }
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options?.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    ...(options?.headers as Record<string, string>),
  };

  if (options?.method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  return res;
}

export async function testConnection(serverUrl: string, apiKey: string): Promise<boolean> {
  const base = normalizeUrl(serverUrl);

  // Try OpenAI-compatible models endpoint first
  try {
    const res = await fetchWithCors(apiUrl(base, "/models"), {
      signal: AbortSignal.timeout(5000),
      apiKey,
    });
    if (res.ok) return true;
  } catch {
    // Fall through
  }

  // Fallback to Ollama-specific /api/tags
  try {
    const res = await fetchWithCors(`${base}/api/tags`, {
      signal: AbortSignal.timeout(5000),
      apiKey,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchModels(serverUrl: string, apiKey: string): Promise<string[]> {
  const base = normalizeUrl(serverUrl);

  // Try OpenAI-compatible endpoint first
  try {
    const res = await fetchWithCors(apiUrl(base, "/models"), {
      signal: AbortSignal.timeout(5000),
      apiKey,
    });
    if (res.ok) {
      const data = await res.json();
      const models = data.data || [];
      return models.map((m: { id: string }) => m.id);
    }
  } catch {
    // Fall through
  }

  // Fallback to Ollama /api/tags
  try {
    const res = await fetchWithCors(`${base}/api/tags`, {
      signal: AbortSignal.timeout(5000),
      apiKey,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

export async function* streamChat(
  serverUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number; thinking?: boolean; signal?: AbortSignal }
): AsyncGenerator<StreamChunk> {
  const base = normalizeUrl(serverUrl);
  const startTime = performance.now();
  let firstToken = true;
  let completionTokens = 0;
  let inThinking = false;
  let inAnswering = false;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(apiUrl(base, "/chat/completions"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      ...(options?.thinking === false ? { reasoning_effort: "none" } : {}),
    }),
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        const now = performance.now();
        const duration = now - startTime;
        yield {
          content: "",
          done: true,
          phase: "answering",
          metrics: {
            ttft: 0,
            tpot: duration / (completionTokens || 1),
            tps: completionTokens / (duration / 1000),
            promptTokens: 0,
            completionTokens,
            totalTokens: completionTokens,
            duration,
          },
        };
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content || "";
        const reasoningContent = choice?.delta?.reasoning_content || choice?.delta?.reasoning || "";
        const finishReason = choice?.finish_reason;
        const usage = parsed.usage;

        if (delta) completionTokens++;

        const now = performance.now();
        const elapsed = now - startTime;

        let ttft = 0;
        if (firstToken && (delta || reasoningContent)) {
          ttft = elapsed;
          firstToken = false;
        }

        const metrics: Partial<RunMetrics> = {
          ttft,
          tpot: completionTokens > 1 ? elapsed / completionTokens : 0,
          tps: completionTokens > 0 ? completionTokens / (elapsed / 1000) : 0,
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens: usage?.completion_tokens ?? completionTokens,
          totalTokens: usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? completionTokens),
          duration: elapsed,
        };

        // Track phase transitions BEFORE setting chunk phase
        if (reasoningContent && !inThinking && !inAnswering) {
          inThinking = true;
        }
        if (!inThinking && !inAnswering && delta && !reasoningContent) {
          // No reasoning at all — straight to answering phase
          inAnswering = true;
        }
        if (inThinking && delta && !reasoningContent) {
          inThinking = false;
          inAnswering = true;
        }

        const chunk: StreamChunk = {
          content: delta,
          reasoningContent,
          done: !!finishReason || parsed.choices?.[0]?.finish_reason === "stop",
          metrics,
          phase: inThinking ? "thinking" : "answering",
          raw: parsed,
        };

        yield chunk;
      } catch {
        // Skip malformed JSON
      }
    }
  }
}
