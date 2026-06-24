import type { StreamChunk, RunMetrics } from "@/types";

export async function testConnection(serverUrl: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function* streamChat(
  serverUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<StreamChunk> {
  const startTime = performance.now();
  let firstToken = true;
  let completionTokens = 0;

  const res = await fetch(`${serverUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
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
        const finishReason = choice?.finish_reason;
        const usage = parsed.usage;

        if (delta) completionTokens++;

        const now = performance.now();
        const elapsed = now - startTime;

        let ttft = 0;
        if (firstToken && delta) {
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

        const chunk: StreamChunk = {
          content: delta,
          done: !!finishReason || parsed.choices?.[0]?.finish_reason === "stop",
          metrics,
          raw: parsed,
        };

        yield chunk;
      } catch {
        // Skip malformed JSON
      }
    }
  }
}

export async function fetchModels(serverUrl: string, apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(`${serverUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}
