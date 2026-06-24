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
  loadModels();
});

async function loadModels() {
  loadingModels.value = true;
  models.value = await fetchModels(config.serverUrl, config.apiKey);
  loadingModels.value = false;
  if (!selectedModel.value && models.value.length) {
    selectedModel.value = models.value[0];
  }
}

function switchProvider(url: string, apiKey: string) {
  config.selectProvider(url, apiKey);
  loadModels();
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
      selectedModel.value || config.defaultModel || "llama3.2",
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

async function saveRun() {
  const m = messages.value;
  const userMsg = m.find((msg) => msg.role === "user");
  const assistantMsg = m.find((msg) => msg.role === "assistant" && msg.metrics);
  if (!userMsg || !assistantMsg?.metrics) return;

  const run: BenchmarkRun = {
    id: generateId(),
    timestamp: Date.now(),
    engine: config.serverUrl,
    model: selectedModel.value || config.defaultModel || "unknown",
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
</script>

<template>
  <div class="playground">
    <div class="top-bar">
      <div class="model-picker">
        <select v-model="selectedModel" class="model-select" :disabled="streaming">
          <option value="" disabled>Select a model…</option>
          <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
        </select>
        <button class="refresh-btn" @click="loadModels" :disabled="loadingModels" title="Refresh models">↻</button>
        <span v-if="loadingModels" class="loading-hint">loading…</span>
        <span class="separator">|</span>
        <select
          class="model-select provider-select"
          :value="config.serverUrl"
          @change="(e) => {
            const idx = (e.target as HTMLSelectElement).selectedIndex - 1;
            if (idx >= 0 && idx < config.providers.length) {
              const p = config.providers[idx];
              switchProvider(p.url, p.apiKey);
            }
          }"
        >
          <option value="" disabled>Provider…</option>
          <option
            v-for="p in config.providers"
            :key="p.url"
            :value="p.url"
            :selected="p.url === config.serverUrl"
          >{{ p.label }}</option>
        </select>
      </div>
      <div class="action-btns" v-if="messages.length">
        <button v-if="canSave() && !streaming" class="btn btn-sm btn-outline" @click="saveRun">Save</button>
        <button v-if="!streaming" class="btn btn-sm btn-ghost" @click="clear">Clear</button>
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

    <div class="chat-area" ref="chatRef">
      <div v-if="!messages.length" class="empty">
        <div class="empty-icon">▷</div>
        <p class="empty-title">Ready</p>
        <p class="empty-hint">Select a model, type a message, and press send to begin.</p>
      </div>

      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="msg"
        :class="msg.role"
      >
        <div class="msg-avatar">{{ msg.role === "user" ? "U" : "A" }}</div>
        <div class="msg-body">
          <div class="msg-label">{{ msg.role === "user" ? "You" : "Assistant" }}</div>
          <div class="msg-content">{{ msg.content }}</div>
          <div v-if="msg.metrics" class="msg-stats">
            <span>{{ (msg.metrics.ttft / 1000).toFixed(2) }}s TTFT</span>
            <span class="dot">·</span>
            <span>{{ msg.metrics.tps.toFixed(1) }} tok/s</span>
            <span class="dot">·</span>
            <span>{{ msg.metrics.completionTokens }} tokens</span>
            <span class="dot">·</span>
            <span>{{ (msg.metrics.duration / 1000).toFixed(1) }}s</span>
          </div>
        </div>
      </div>
    </div>

    <div class="input-area">
      <div class="input-wrap">
        <textarea
          v-model="prompt"
          placeholder="Type your message…"
          rows="1"
          @keydown.enter.ctrl="send"
          @keydown.enter.exact.prevent="send"
          :disabled="streaming"
          class="input-field"
        />
        <button
          v-if="streaming"
          class="send-btn stop"
          @click="stop"
          title="Stop"
        >
          ■
        </button>
        <button
          v-else
          class="send-btn"
          @click="send"
          :disabled="!prompt.trim()"
          title="Send"
        >
          →
        </button>
      </div>
      <p class="input-hint">Ctrl+Enter to send</p>
    </div>
  </div>
</template>

<style scoped>
.playground {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--space-4) var(--space-6);
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  gap: var(--space-3);
}

/* Top bar with model picker + actions */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.model-picker {
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
  min-width: 160px;
  cursor: pointer;
}

.model-select:focus {
  outline: none;
  border-color: var(--primary);
}

.refresh-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 4px;
  line-height: 1;
}

.refresh-btn:hover { color: var(--ink); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }

.loading-hint {
  font-size: 11px;
  color: var(--muted);
}

.separator {
  color: var(--border);
  margin: 0 var(--space-1);
}

.provider-select {
  max-width: 140px;
  font-size: 12px;
}

.action-btns {
  display: flex;
  gap: var(--space-2);
}

/* Chat area */
.chat-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  padding: var(--space-1);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--muted);
}

.empty-icon {
  font-size: 32px;
  opacity: 0.3;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--muted);
}

.empty-hint {
  font-size: 13px;
  text-align: center;
  max-width: 300px;
  line-height: 1.5;
}

/* Message bubbles */
.msg {
  display: flex;
  gap: var(--space-3);
  animation: fadeIn 200ms ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg-avatar {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: white;
  margin-top: 2px;
}

.msg.user .msg-avatar {
  background: var(--primary);
}

.msg.assistant .msg-avatar {
  background: var(--accent);
}

.msg-body {
  flex: 1;
  min-width: 0;
}

.msg-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: var(--space-1);
}

.msg-content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ink);
}

.msg-stats {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.dot {
  margin: 0 6px;
}

/* Input area */
.input-area {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.input-wrap {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-2);
  transition: border-color var(--transition-fast);
}

.input-wrap:focus-within {
  border-color: var(--primary);
}

.input-field {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  padding: var(--space-1);
  max-height: 120px;
}

.input-field:focus {
  outline: none;
}

.input-field::placeholder {
  color: var(--muted);
  opacity: 0.6;
}

.send-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 50%;
  border: none;
  background: var(--primary);
  color: white;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity var(--transition-fast), background var(--transition-fast);
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.send-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.send-btn.stop {
  background: var(--danger);
  font-size: 12px;
}

.input-hint {
  font-size: 11px;
  color: var(--muted);
  text-align: right;
  padding-right: var(--space-1);
}

/* Shared button styles */
.btn {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.btn-sm { padding: var(--space-1) var(--space-3); font-size: 12px; }

.btn-outline {
  background: transparent;
  border-color: var(--border);
  color: var(--ink);
}

.btn-outline:hover {
  background: var(--surface);
  border-color: var(--muted);
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--muted);
}

.btn-ghost:hover {
  background: var(--surface);
  color: var(--ink);
}
</style>
