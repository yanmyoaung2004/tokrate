<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useConfigStore } from "@/stores/config";
import { useHistoryStore } from "@/stores/history";
import { useToastStore } from "@/stores/toast";
import { streamChat, fetchModels } from "@/api/client";
import type { ChatMessage, RunMetrics, BenchmarkRun } from "@/types";
import MetricsBar from "@/components/MetricsBar.vue";
import SpeedChart from "@/components/SpeedChart.vue";

const config = useConfigStore();
const history = useHistoryStore();
const toast = useToastStore();
const prompt = ref("");
const messages = ref<ChatMessage[]>([]);
const streaming = ref(false);
const liveMetrics = ref<Partial<RunMetrics>>({});
const abortController = ref<AbortController | null>(null);
const speedChartRef = ref<InstanceType<typeof SpeedChart> | null>(null);
const models = ref<string[]>([]);
const selectedModel = ref(config.defaultModel || "");
const loadingModels = ref(false);

onMounted(async () => {
  if (config.serverUrl) {
    loadingModels.value = true;
    models.value = await fetchModels(config.serverUrl, config.apiKey);
    loadingModels.value = false;
    if (!selectedModel.value && models.value.length) {
      selectedModel.value = models.value[0];
    }
  }
});

async function refreshModels() {
  loadingModels.value = true;
  models.value = await fetchModels(config.serverUrl, config.apiKey);
  loadingModels.value = false;
  if (!selectedModel.value && models.value.length) {
    selectedModel.value = models.value[0];
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function saveRun() {
  const m = messages.value;
  const userMsg = m.find((msg) => msg.role === "user");
  const assistantMsg = m.find((msg) => msg.role === "assistant" && msg.metrics);
  if (!userMsg || !assistantMsg?.metrics) return;

  const run: BenchmarkRun = {
    id: generateId(),
    timestamp: Date.now(),
    engine: config.serverUrl,
    model: config.defaultModel || "unknown",
    prompt: userMsg.content,
    response: assistantMsg.content,
    tps: assistantMsg.metrics.tps,
    ttft: assistantMsg.metrics.ttft,
    tpot: assistantMsg.metrics.tpot,
    promptTokens: assistantMsg.metrics.promptTokens,
    completionTokens: assistantMsg.metrics.completionTokens,
    totalTokens: assistantMsg.metrics.totalTokens,
  };
  await history.addRun(run);
  toast.add("Run saved to History", "success");
}

function canSave(): boolean {
  const assistantMsg = messages.value.find(
    (msg) => msg.role === "assistant" && msg.metrics
  );
  return !!assistantMsg;
}

async function send() {
  if (!prompt.value.trim() || streaming.value) return;

  const userMsg: ChatMessage = { role: "user", content: prompt.value };
  messages.value.push(userMsg);
  const currentPrompt = prompt.value;
  prompt.value = "";

  const assistantMsg: ChatMessage = { role: "assistant", content: "" };
  messages.value.push(assistantMsg);

  const controller = new AbortController();
  abortController.value = controller;
  streaming.value = true;
  liveMetrics.value = {};

  try {
    for await (const chunk of streamChat(
      config.serverUrl,
      config.apiKey,
      config.defaultModel || selectedModel.value || "llama3.2",
      [{ role: "user", content: currentPrompt }],
      { signal: controller.signal }
    )) {
      if (chunk.done) {
        assistantMsg.metrics = chunk.metrics as RunMetrics;
        liveMetrics.value = chunk.metrics;
        break;
      }
      assistantMsg.content += chunk.content;
      if (chunk.metrics.ttft) {
        liveMetrics.value = { ...chunk.metrics };
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      assistantMsg.content += "\n\n[Stopped]";
      toast.add("Generation stopped", "info");
    } else {
      const message = err instanceof Error ? err.message : "Unknown error";
      assistantMsg.content = `\n\n**Error:** ${message}`;
      toast.add(`Error: ${message}`, "error");
    }
  } finally {
    streaming.value = false;
    abortController.value = null;
  }
}

function stop() {
  abortController.value?.abort();
}

function clear() {
  messages.value = [];
  liveMetrics.value = {};
  speedChartRef.value?.reset();
}
</script>

<template>
  <div class="playground">
    <div class="playground-header">
      <h1 class="page-title">Playground</h1>
      <div class="playground-controls">
        <div class="model-selector">
          <select v-model="selectedModel" class="model-select" :disabled="streaming">
            <option value="" disabled>Select model</option>
            <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
          </select>
          <button class="btn-icon" @click="refreshModels" :disabled="loadingModels" title="Refresh models">
            ↻
          </button>
        </div>
        <button v-if="canSave() && !streaming" class="btn btn-secondary btn-sm" @click="saveRun">Save Run</button>
        <button v-if="messages.length && !streaming" class="btn btn-ghost btn-sm" @click="clear">Clear</button>
      </div>
    </div>

    <SpeedChart
      v-if="liveMetrics.ttft"
      ref="speedChartRef"
      :metrics="liveMetrics"
    />

    <MetricsBar
      v-if="liveMetrics.ttft"
      :metrics="liveMetrics"
    />

    <div class="chat-area" v-if="messages.length">
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="message"
        :class="msg.role"
      >
        <div class="message-label">{{ msg.role }}</div>
        <div class="message-content">{{ msg.content }}</div>
        <div v-if="msg.metrics" class="message-metrics">
          <span class="metric">TTFT {{ (msg.metrics.ttft / 1000).toFixed(2) }}s</span>
          <span class="divider">·</span>
          <span class="metric">{{ msg.metrics.tps.toFixed(1) }} tok/s</span>
          <span class="divider">·</span>
          <span class="metric">{{ msg.metrics.completionTokens }} tokens</span>
          <span class="divider">·</span>
          <span class="metric">{{ (msg.metrics.duration / 1000).toFixed(1) }}s</span>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>Connect to a server and send a prompt to see live metrics.</p>
    </div>

    <div class="input-area">
      <textarea
        v-model="prompt"
        placeholder="Send a message..."
        rows="3"
        @keydown.enter.ctrl="send"
        :disabled="streaming"
        class="prompt-input"
      />
      <div class="input-actions">
        <button
          v-if="streaming"
          class="btn btn-danger"
          @click="stop"
        >
          Stop
        </button>
        <button
          v-else
          class="btn btn-primary"
          @click="send"
          :disabled="!prompt.trim()"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playground {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  gap: var(--space-3);
}

.playground-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: var(--space-2);
}

.playground-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.model-selector {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.model-select {
  padding: var(--space-1) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
  max-width: 200px;
}

.model-select:focus {
  outline: none;
  border-color: var(--primary);
}

.model-select:disabled {
  opacity: 0.5;
}

.chat-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.message {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
}

.message.user {
  border-left: 2px solid var(--primary);
}

.message.assistant {
  border-left: 2px solid var(--accent);
}

.message-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: var(--space-2);
}

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.message-metrics {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  text-align: center;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.prompt-input {
  width: 100%;
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 14px;
  resize: vertical;
  min-height: 60px;
}

.prompt-input:focus {
  outline: none;
  border-color: var(--primary);
}

.prompt-input:disabled {
  opacity: 0.5;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast), opacity var(--transition-fast);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn-sm {
  padding: var(--space-1) var(--space-3);
  font-size: 12px;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-danger {
  background: var(--danger);
  color: white;
}

.btn-danger:hover {
  opacity: 0.9;
}

.btn-icon {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 4px;
  line-height: 1;
}

.btn-icon:hover {
  color: var(--ink);
}

.btn-icon:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn-secondary {
  background: var(--surface);
  border-color: var(--border);
  color: var(--ink);
}

.btn-secondary:hover {
  background: var(--border);
}

.btn-ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--muted);
}

.btn-ghost:hover {
  background: var(--surface);
  color: var(--ink);
}
</style>
