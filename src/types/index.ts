export interface ImageContent {
  type: "image_url";
  image_url: { url: string };
}

export interface TextContent {
  type: "text";
  text: string;
}

export type ContentPart = TextContent | ImageContent;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  reasoning?: string;
  metrics?: RunMetrics;
}

export interface StreamChunk {
  content: string;
  reasoningContent?: string;
  done: boolean;
  metrics: Partial<RunMetrics>;
  phase: "thinking" | "answering";
  raw?: Record<string, unknown>;
}

export interface RunMetrics {
  ttft: number;
  tpot: number;
  tps: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  duration: number;
}

export interface EngineConfig {
  id: string;
  label: string;
  serverUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export interface ModelProfile {
  name: string;
  engine: string;
  quantization?: string;
  parameterSize?: string;
}

export interface BenchmarkRun {
  id: string;
  timestamp: number;
  engine: string;
  model: string;
  prompt: string;
  response: string;
  tps: number;
  ttft: number;
  tpot: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface HardwareInfo {
  os: string;
  cpu: string;
  ram: string;
  gpu: string;
}

export interface LeaderboardEntry {
  id: string;
  engine: string;
  model: string;
  quantization?: string;
  gpu: string;
  tps: number;
  ttft: number;
  timestamp: number;
  runCount: number;
}
