<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useConfigStore } from "@/stores/config";
import { useHistoryStore } from "@/stores/history";
import { useToastStore } from "@/stores/toast";
import { streamChat, fetchModels } from "@/api/client";
import { renderMarkdown } from "@/utils/markdown";
import { TEST_TOOLS } from "@/data/tools";
import type { ChatMessage, RunMetrics, ContentPart, TextContent } from "@/types";
import MetricsBar from "@/components/MetricsBar.vue";
import SpeedChart from "@/components/SpeedChart.vue";

const config = useConfigStore();
const history = useHistoryStore();
const toast = useToastStore();
const route = useRoute();
const prompt = ref("");
const messages = ref<ChatMessage[]>([]);
const streaming = ref(false);
const liveMetrics = ref<Partial<RunMetrics>>({});
const abortController = ref<AbortController | null>(null);
const speedChartRef = ref<InstanceType<typeof SpeedChart> | null>(null);
const models = ref<string[]>([]);
const selectedModel = ref(config.defaultModel || "");
const loadingModels = ref(false);
const showCharts = ref(false);
const showReasoning = ref(true);
const thinkingEnabled = ref(true);
const toolsEnabled = ref(false);
const toolCallValid = ref<boolean | null>(null);
const thinkingTps = ref<number>();
const answeringTps = ref<number>();
const thinkingData = ref<{ time: number; tps: number }[]>([]);
const answeringData = ref<{ time: number; tps: number }[]>([]);
const currentPhase = ref<"thinking" | "answering">("thinking");
const hasReasoning = computed(() => messages.value.some((m) => m.reasoning));
const attachments = ref<{ id: string; dataUrl: string; type: string; name: string }[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);

function pickFile() { fileInput.value?.click(); }

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  for (const file of Array.from(input.files)) {
    const reader = new FileReader();
    reader.onload = () => {
      attachments.value.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        dataUrl: reader.result as string,
        type: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  }
  input.value = "";
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

onMounted(async () => {
  await loadModels();
  // Handle re-run from History
  if (route.query.prompt) {
    prompt.value = route.query.prompt as string;
    if (route.query.model) selectedModel.value = route.query.model as string;
  }
});

async function loadModels() {
  loadingModels.value = true;
  try { models.value = await fetchModels(config.serverUrl, config.apiKey);
    if (!selectedModel.value && models.value.length) selectedModel.value = models.value[0];
  } catch { /* silent */ }
  loadingModels.value = false;
}

function msgText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content.filter((p): p is TextContent => p.type === "text").map((p) => p.text).join("\n");
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatToolArgs(args: string): string {
  try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args + "\n⚠ Invalid JSON"; }
}

async function copyModel() {
  try {
    await navigator.clipboard.writeText(selectedModel.value);
    toast.add("Copied: " + selectedModel.value, "success");
  } catch {
    toast.add("Failed to copy", "error");
  }
}

async function send() {
  if (!prompt.value.trim() || streaming.value) return;

  // Build content: plain string or content array with images
  const currentPrompt = prompt.value;
  let messageContent: string | ContentPart[];
  if (attachments.value.length) {
    messageContent = [{ type: "text", text: currentPrompt }];
    for (const att of attachments.value) {
      messageContent.push({ type: "image_url", image_url: { url: att.dataUrl } });
    }
  } else {
    messageContent = currentPrompt;
  }

  const userMsg: ChatMessage = { role: "user", content: messageContent };
  messages.value.push(userMsg);
  prompt.value = "";
  attachments.value = [];
  const assistantMsg: ChatMessage = { role: "assistant", content: "", reasoning: "" };
  messages.value.push(assistantMsg);
  toolCallValid.value = null;
  const controller = new AbortController();
  abortController.value = controller;
  streaming.value = true;
  liveMetrics.value = {};
  showCharts.value = false;
  thinkingData.value = [];
  answeringData.value = [];
  thinkingTps.value = undefined;
  answeringTps.value = undefined;
  currentPhase.value = "thinking";

  try {
    for await (const chunk of streamChat(
      config.serverUrl, config.apiKey,
      selectedModel.value || config.defaultModel || "llama3.2",
      [{ role: "user", content: messageContent }],
      { signal: controller.signal, thinking: thinkingEnabled.value, tools: toolsEnabled.value ? TEST_TOOLS : undefined }
    )) {
      assistantMsg.content += chunk.content;
      if (chunk.reasoningContent) {
        assistantMsg.reasoning = (assistantMsg.reasoning || "") + chunk.reasoningContent;
      }
      if (chunk.toolCalls?.length) {
        assistantMsg.toolCalls = chunk.toolCalls;
        toolCallValid.value = chunk.toolCalls.every((tc) => {
          try { JSON.parse(tc.function.arguments); return true; } catch { return false; }
        });
      }
      liveMetrics.value = { ...chunk.metrics };
      if (chunk.metrics.ttft) showCharts.value = true;

      const elapsed = (chunk.metrics.duration ?? 0) / 1000;
      const tps = chunk.metrics.tps ?? 0;
      if (elapsed > 0 && tps > 0) {
        if (chunk.phase === "thinking") {
          thinkingData.value.push({ time: +elapsed.toFixed(2), tps: +tps.toFixed(1) });
          thinkingTps.value = tps;
          currentPhase.value = "thinking";
        } else {
          answeringData.value.push({ time: +elapsed.toFixed(2), tps: +tps.toFixed(1) });
          answeringTps.value = tps;
          currentPhase.value = "answering";
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      assistantMsg.content += "\n\n[Stopped]";
      toast.add("Generation stopped", "info");
    } else {
      const message = err instanceof Error ? err.message : "Unknown error";
      assistantMsg.content = `\n\nError: ${message}`;
      toast.add(`Error: ${message}`, "error");
    }
  } finally {
    streaming.value = false;
    abortController.value = null;
  }
}

function stop() { abortController.value?.abort(); }

function clear() {
  messages.value = []; liveMetrics.value = {}; showCharts.value = false;
  thinkingData.value = []; answeringData.value = [];
  thinkingTps.value = undefined; answeringTps.value = undefined;
  speedChartRef.value?.reset();
}

async function saveRun() {
  const m = messages.value;
  const userMsg = m.find((r) => r.role === "user");
  const assistantMsg = m.find((r) => r.role === "assistant" && r.metrics);
  if (!userMsg || !assistantMsg?.metrics) return;
  await history.addRun({
    id: generateId(), timestamp: Date.now(),
    engine: config.serverUrl, model: selectedModel.value || config.defaultModel || "unknown",
    prompt: String(msgText(userMsg.content as any)), response: String(assistantMsg.content),
    tps: assistantMsg.metrics.tps, ttft: assistantMsg.metrics.ttft,
    tpot: assistantMsg.metrics.tpot,
    promptTokens: assistantMsg.metrics.promptTokens,
    completionTokens: assistantMsg.metrics.completionTokens,
    totalTokens: assistantMsg.metrics.totalTokens,
  });
  toast.add("Run saved to History", "success");
}

function canSave(): boolean {
  return !!messages.value.find((m) => m.role === "assistant" && m.metrics);
}
</script>

<template>
  <div class="playground">
    <!-- Top bar: model, thinking toggle, actions -->
    <div class="top-bar">
      <div class="left-group">
        <select
          class="model-select provider-select"
          :value="config.serverUrl"
          @change="(e) => {
            const url = (e.target as HTMLSelectElement).value;
            const p = config.providers.find((pr) => pr.url === url);
            if (p) { config.selectProvider(p.url, p.apiKey); loadModels(); }
          }"
        >
          <option value="" disabled>Provider</option>
          <option v-for="p in config.providers" :key="p.url" :value="p.url" :selected="p.url === config.serverUrl">{{ p.label }}</option>
        </select>
        <select v-model="selectedModel" class="model-select" :disabled="streaming">
          <option value="" disabled>Model…</option>
          <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
        </select>
        <button v-if="selectedModel" class="icon-btn" @click="copyModel" title="Copy model name">⎘</button>
        <button class="icon-btn" @click="loadModels" :disabled="loadingModels" :title="loadingModels ? 'Loading...' : 'Reload model list'">{{ loadingModels ? "⋯" : "↻" }}</button>
        <button
          class="toggle thin"
          :class="{ on: thinkingEnabled }"
          @click="thinkingEnabled = !thinkingEnabled"
        >
          {{ thinkingEnabled ? "🧠" : "⚡" }}
        </button>
        <button
          class="toggle tool-toggle"
          :class="{ on: toolsEnabled }"
          @click="toolsEnabled = !toolsEnabled"
          title="Test function calling with predefined tools"
        >
          fx{{ toolsEnabled ? " ✓" : "" }}
        </button>
      </div>
      <div class="right-group">
        <button v-if="canSave() && !streaming" class="btn btn-sm" @click="saveRun">Save</button>
        <button v-if="hasReasoning" class="btn btn-sm ghost" @click="showReasoning = !showReasoning">
          {{ showReasoning ? "Hide" : "Show" }} thinking
        </button>
        <button v-if="messages.length && !streaming" class="btn btn-sm ghost" @click="clear">Clear</button>
      </div>
    </div>

    <SpeedChart
      v-if="showCharts"
      ref="speedChartRef"
      :metrics="liveMetrics"
      :thinking-data="thinkingData"
      :answering-data="answeringData"
      :phase="currentPhase"
    />

    <MetricsBar
      v-if="showCharts"
      :metrics="liveMetrics"
      :streaming="streaming"
      :thinking-tps="thinkingTps"
      :answering-tps="answeringTps"
    />

    <!-- Chat -->
    <div class="chat-area">
      <div v-if="!selectedModel && !loadingModels" class="empty-state">
        <div class="empty-icon">▷</div>
        <h3 class="empty-title">No model selected</h3>
        <p class="empty-desc">Select a provider and model from the top bar, or add a provider in Settings.</p>
      </div>
      <div v-else-if="!messages.length" class="empty-state">
        <div class="empty-icon">▷</div>
        <h3 class="empty-title">Ready</h3>
        <p class="empty-desc">Type a message and press Enter to begin.</p>
      </div>

      <div v-for="(msg, i) in messages" :key="i" class="msg" :class="msg.role">
        <div class="msg-avatar">{{ msg.role === "user" ? "U" : "A" }}</div>
        <div class="msg-body">
          <div class="msg-label">{{ msg.role === "user" ? "You" : "Assistant" }}</div>

          <div v-if="msg.reasoning && streaming" class="thinking-live">
            <div class="thinking-header">Thinking…</div>
            <div class="thinking-text md" v-html="renderMarkdown(msg.reasoning)"></div>
          </div>
          <details v-if="msg.reasoning && !streaming" class="thinking-done" open>
            <summary class="thinking-summary">Show thinking ({{ msg.reasoning.length }} chars)</summary>
            <div class="thinking-text md" v-html="renderMarkdown(msg.reasoning)"></div>
          </details>

          <!-- Tool calls -->
          <div v-if="msg.toolCalls?.length" class="toolcalls">
            <div class="tclabel">Tool calls</div>
            <div v-for="tc in msg.toolCalls" :key="tc.id" class="tccard">
              <div class="tcname">{{ tc.function.name }}</div>
              <pre class="tcargs">{{ formatToolArgs(tc.function.arguments) }}</pre>
            </div>
            <div v-if="toolCallValid !== null" class="tcstatus" :class="toolCallValid ? 'ok' : 'fail'">
              {{ toolCallValid ? "✔ All tool calls valid JSON" : "✖ Invalid JSON in tool arguments" }}
            </div>
          </div>

          <div class="msg-content md" v-html="renderMarkdown(msgText(msg.content))"></div>
          <div v-if="msg.metrics" class="msg-stats">
            {{ (msg.metrics.ttft / 1000).toFixed(2) }}s TTFT · {{ msg.metrics.tps.toFixed(1) }} tok/s · {{ msg.metrics.completionTokens }} tok · {{ (msg.metrics.duration / 1000).toFixed(1) }}s
          </div>
        </div>
      </div>
    </div>

    <!-- Attachments -->
    <div v-if="attachments.length" class="attachments">
      <div v-for="att in attachments" :key="att.id" class="attachment-thumb">
        <img :src="att.dataUrl" class="thumb-img" />
        <button class="thumb-remove" @click="removeAttachment(att.id)" title="Remove">✕</button>
      </div>
    </div>

    <!-- Input -->
    <div class="input-area">
      <div class="input-wrap">
        <textarea
          v-model="prompt" :placeholder="toolsEnabled ? 'Ask about weather, math, or search…' : 'Type your message…'" rows="1"
          @keydown.enter.ctrl="send" @keydown.enter.exact.prevent="send"
          :disabled="streaming" class="input-field"
        />
        <button class="attach-btn" @click="pickFile" title="Attach image">⊞</button>
        <button v-if="streaming" class="send-btn stop" @click="stop" title="Stop">■</button>
        <button v-else class="send-btn" @click="send" :disabled="!prompt.trim()" title="Send">→</button>
      </div>
      <p class="input-hint">Enter to send · Ctrl+Enter for newline</p>
    </div>
    <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="onFilePicked" />
  </div>
</template>

<style scoped>
.playground {
  display: flex; flex-direction: column; height: 100%;
  padding: var(--space-3) var(--space-4); gap: var(--space-2);
  max-width: 800px; margin: 0 auto; width: 100%;
}

/* Compact top bar */
.top-bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
}

.left-group, .right-group {
  display: flex; align-items: center; gap: var(--space-1);
}

.model-select {
  padding: var(--space-1) var(--space-2); background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  color: var(--ink); font-family: var(--font-mono); font-size: 12px;
  max-width: 160px;
}
.model-select:focus { outline: none; border-color: var(--primary); }

.icon-btn {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 14px; padding: 2px; line-height: 1;
}
.icon-btn:hover { color: var(--ink); }
.icon-btn:disabled { opacity: 0.4; cursor: default; }

.toggle {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--surface); font-size: 12px; cursor: pointer;
  line-height: 1;
}
.toggle.on { border-color: var(--accent); }

.tool-toggle {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.tool-toggle.on {
  border-color: var(--success);
  background: color-mix(in oklch, var(--success) 12%, transparent);
  color: var(--success);
}

/* Chat area */
.chat-area {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column;
  gap: var(--space-2); min-height: 0; padding: 2px 0;
}



.empty-title { font-size: 16px; font-weight: 600; }
.empty-hint { font-size: 12px; }

.msg {
  display: flex; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface); border-radius: var(--radius-md);
}

.msg.user { background: color-mix(in oklch, var(--primary) 8%, var(--surface)); }

.msg-avatar {
  width: 24px; height: 24px; min-width: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  color: white; margin-top: 1px;
}
.msg.user .msg-avatar { background: var(--primary); }
.msg.assistant .msg-avatar { background: var(--accent); }

.msg-body { flex: 1; min-width: 0; }
.msg-label { font-size: 11px; font-weight: 600; margin-bottom: 2px; }

.msg-content {
  font-size: 13px; line-height: 1.5; white-space: pre-wrap;
  word-break: break-word; color: var(--ink);
}

.msg-stats {
  margin-top: var(--space-1); font-size: 11px; color: var(--muted);
  font-family: var(--font-mono);
}

/* Live thinking */
.thinking-live {
  margin-bottom: var(--space-2); padding: var(--space-2);
  background: color-mix(in oklch, var(--accent) 8%, transparent);
  border-radius: var(--radius-md); border: 1px solid var(--border);
}
.thinking-header { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin-bottom: var(--space-1); }
.thinking-text { font-size: 12px; line-height: 1.5; color: var(--muted); white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }

.thinking-done { margin-bottom: var(--space-2); }
.thinking-summary { font-size: 11px; font-weight: 500; color: var(--accent); cursor: pointer; }
.thinking-summary:hover { opacity: 0.8; }

/* Tool calls */
.toolcalls { margin-bottom: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); }
.tclabel { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); }
.tccard { padding: var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); }
.tcname { font-size: 12px; font-weight: 600; color: var(--primary); margin-bottom: var(--space-1); }
.tcargs { font-family: var(--font-mono); font-size: 11px; color: var(--ink); white-space: pre-wrap; word-break: break-word; margin: 0; line-height: 1.4; }
.tcstatus { font-size: 11px; font-weight: 500; padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); }
.tcstatus.ok { background: color-mix(in oklch, var(--success) 15%, transparent); color: var(--success); }
.tcstatus.fail { background: color-mix(in oklch, var(--danger) 15%, transparent); color: var(--danger); }

/* Input */
.input-area { display: flex; flex-direction: column; gap: 2px; }
.input-wrap {
  display: flex; align-items: flex-end; gap: var(--space-2);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: var(--space-1) var(--space-2);
  transition: border-color var(--transition-fast);
}
.input-wrap:focus-within { border-color: var(--primary); }
.input-field {
  flex: 1; background: transparent; border: none; color: var(--ink);
  font-family: var(--font-ui); font-size: 13px; line-height: 1.5;
  resize: none; padding: var(--space-1); max-height: 100px;
}
.input-field:focus { outline: none; }
.input-field::placeholder { color: var(--muted); opacity: 0.6; }

.send-btn {
  width: 30px; height: 30px; min-width: 30px; border-radius: 50%;
  border: none; background: var(--primary); color: white; font-size: 14px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: opacity var(--transition-fast);
}
.send-btn:hover:not(:disabled) { opacity: 0.85; }
.send-btn:disabled { opacity: 0.3; cursor: default; }
.send-btn.stop { background: var(--danger); font-size: 11px; }

.input-hint { font-size: 10px; color: var(--muted); text-align: right; }

/* Attachments */
.attachments { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.attachment-thumb { position: relative; width: 64px; height: 64px; border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.thumb-img { width: 100%; height: 100%; object-fit: cover; }
.thumb-remove { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(0,0,0,0.6); color: white; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; }

.attach-btn { width: 30px; height: 30px; min-width: 30px; border-radius: 50%; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background var(--transition-fast), color var(--transition-fast); }
.attach-btn:hover { background: var(--surface); color: var(--ink); }

/* Buttons */
.btn {
  padding: var(--space-1) var(--space-2); border-radius: var(--radius-md);
  border: 1px solid var(--border); font-size: 11px; font-weight: 500;
  cursor: pointer; background: var(--surface); color: var(--ink);
  transition: background var(--transition-fast);
}
.btn:hover { background: var(--border); }
.btn.solid { background: var(--primary); color: white; border-color: transparent; }
.btn.ghost { border-color: transparent; color: var(--muted); }
.btn.ghost:hover { background: var(--surface); color: var(--ink); }
</style>
