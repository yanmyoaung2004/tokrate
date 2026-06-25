<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useConfigStore } from "@/stores/config";
import { useSuitesStore } from "@/stores/suites";
import { useToastStore } from "@/stores/toast";
import { streamChat } from "@/api/client";
import type { RunMetrics } from "@/types";

const config = useConfigStore();
const suites = useSuitesStore();
const toast = useToastStore();

const selectedId = ref("");
const newName = ref("");
const newPromptName = ref("");
const newPromptContent = ref("");
const running = ref(false);
const results = ref<Record<string, RunMetrics | null>>({});
const currentProgress = ref("");

const selected = computed(() => suites.suites.find((s) => s.id === selectedId.value));

onMounted(async () => {
  await suites.load();
  if (suites.suites.length) selectedId.value = suites.suites[0].id;
});

async function createSuite() {
  if (!newName.value.trim()) return;
  const s = await suites.create(newName.value.trim());
  selectedId.value = s.id;
  newName.value = "";
}

function selectSuite(id: string) {
  selectedId.value = id;
  results.value = {};
}

async function addPrompt() {
  if (!selected.value || !newPromptName.value.trim() || !newPromptContent.value.trim()) return;
  await suites.addPrompt(selected.value.id, {
    id: Date.now().toString(36),
    name: newPromptName.value.trim(),
    content: newPromptContent.value.trim(),
  });
  newPromptName.value = "";
  newPromptContent.value = "";
}

async function runSuite() {
  if (!selected.value || running.value) return;
  const s = selected.value;
  running.value = true;
  results.value = {};
  currentProgress.value = "";

  for (let i = 0; i < s.prompts.length; i++) {
    const p = s.prompts[i];
    currentProgress.value = `${i + 1} / ${s.prompts.length} — ${p.name}`;
    try {
      let finalMetrics: RunMetrics | null = null;
      for await (const chunk of streamChat(
        config.serverUrl, config.apiKey,
        config.defaultModel || "llama3.2",
        [{ role: "user", content: p.content }]
      )) {
        if (chunk.done) { finalMetrics = chunk.metrics as RunMetrics; break; }
      }
      results.value[p.id] = finalMetrics;
    } catch {
      results.value[p.id] = null;
    }
  }
  running.value = false;
  currentProgress.value = "";
  toast.add(`Suite "${s.name}" complete`, "success");
}

function avgTps(): string {
  const vals = Object.values(results.value).filter((r): r is RunMetrics => r !== null);
  if (!vals.length) return "—";
  return (vals.reduce((a, r) => a + r.tps, 0) / vals.length).toFixed(1);
}

function avgTtft(): string {
  const vals = Object.values(results.value).filter((r): r is RunMetrics => r !== null);
  if (!vals.length) return "—";
  const ms = vals.reduce((a, r) => a + r.ttft, 0) / vals.length;
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}
</script>

<template>
  <div class="benchmarks-page">
    <div class="page-header">
      <h1 class="page-title">Benchmarks</h1>
      <div class="header-row">
        <input
          v-model="newName"
          class="input"
          placeholder="Suite name…"
          @keydown.enter.prevent="createSuite"
        />
        <button class="btn primary" @click="createSuite" :disabled="!newName.trim()">Create</button>
      </div>
    </div>

    <div class="layout">
      <!-- Left: suite list -->
      <div class="suite-list">
        <div class="list-label">Suites</div>
        <div v-if="!suites.suites.length" class="list-empty">No suites yet.</div>
        <div
          v-for="s in suites.suites"
          :key="s.id"
          class="suite-item"
          :class="{ active: s.id === selectedId }"
          @click="selectSuite(s.id)"
        >
          <div class="suite-name">{{ s.name }}</div>
          <div class="suite-meta">{{ s.prompts.length }} prompts</div>
        </div>
      </div>

      <!-- Right: suite detail -->
      <div v-if="selected" class="suite-detail">
        <div class="detail-header">
          <h2>{{ selected.name }}</h2>
          <button class="btn ghost btn-sm" @click="suites.remove(selected.id)">Delete</button>
        </div>

        <div class="prompt-section">
          <div class="section-title">Prompts ({{ selected.prompts.length }})</div>

          <div v-if="!selected.prompts.length" class="empty-hint">Add prompts to build your benchmark suite.</div>

          <div v-for="(p, i) in selected.prompts" :key="p.id" class="prompt-card">
            <div class="prompt-header">
              <span class="prompt-idx">{{ i + 1 }}</span>
              <input
                :value="p.name"
                class="prompt-name-input"
                @change="(e) => suites.updatePrompt(selected!.id, p.id, { name: (e.target as HTMLInputElement).value })"
              />
              <button class="btn-icon" @click="suites.removePrompt(selected!.id, p.id)" title="Remove prompt">✕</button>
            </div>
            <textarea
              :value="p.content"
              class="prompt-content"
              rows="2"
              @change="(e) => suites.updatePrompt(selected!.id, p.id, { content: (e.target as HTMLTextAreaElement).value })"
            />
            <div v-if="results[p.id]" class="prompt-result">
              TPS {{ results[p.id]!.tps.toFixed(1) }} · TTFT {{ (results[p.id]!.ttft / 1000).toFixed(2) }}s · {{ results[p.id]!.completionTokens }} tok · {{ (results[p.id]!.duration / 1000).toFixed(1) }}s
            </div>
            <div v-else-if="results[p.id] === null && running === false" class="prompt-result error">Failed</div>
          </div>

          <div class="add-prompt">
            <input v-model="newPromptName" class="input" placeholder="Prompt name…" />
            <textarea v-model="newPromptContent" class="input textarea" rows="2" placeholder="Prompt content…" />
            <button class="btn" @click="addPrompt" :disabled="!newPromptName.trim() || !newPromptContent.trim()">Add</button>
          </div>
        </div>

        <!-- Run section -->
        <div class="run-section">
          <div class="server-info">
            Running against <strong>{{ config.defaultModel || "no model" }}</strong> on <code>{{ config.serverUrl }}</code>
          </div>
          <div class="run-bar">
            <button
              class="btn primary"
              @click="runSuite"
              :disabled="!selected.prompts.length || running"
            >
              {{ running ? "Running…" : `Run Suite (${selected.prompts.length} prompts)` }}
            </button>
            <span v-if="currentProgress" class="progress">{{ currentProgress }}</span>
          </div>
        </div>

        <!-- Aggregate results -->
        <div v-if="Object.keys(results).length" class="aggregate">
          <div class="section-title">Aggregate</div>
          <div class="agg-grid">
            <div class="agg-item"><span class="agg-label">Avg TPS</span><span class="agg-value">{{ avgTps() }}</span></div>
            <div class="agg-item"><span class="agg-label">Avg TTFT</span><span class="agg-value">{{ avgTtft() }}</span></div>
            <div class="agg-item"><span class="agg-label">Prompts</span><span class="agg-value">{{ selected.prompts.length }}</span></div>
          </div>
        </div>
      </div>

      <div v-else class="detail-empty">
        <p v-if="suites.suites.length">Select a suite from the list.</p>
        <p v-else>Create a suite to get started.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.benchmarks-page {
  height: 100%; display: flex; flex-direction: column;
  padding: var(--space-4) var(--space-5); gap: var(--space-3);
  max-width: 1000px; margin: 0 auto; width: 100%; overflow: hidden;
}

.page-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.page-title { font-size: 18px; font-weight: 600; }
.header-row { display: flex; gap: var(--space-2); align-items: center; }
.header-row .input { width: 200px; }

.layout { flex: 1; display: grid; grid-template-columns: 200px 1fr; gap: var(--space-3); min-height: 0; }

/* Suite list */
.suite-list { display: flex; flex-direction: column; gap: var(--space-1); overflow-y: auto; }
.list-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: var(--space-1); }
.list-empty { font-size: 12px; color: var(--muted); padding: var(--space-2) 0; }
.suite-item { padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: border-color var(--transition-fast); }
.suite-item:hover { border-color: var(--muted); }
.suite-item.active { border-color: var(--primary); }
.suite-name { font-size: 13px; font-weight: 500; }
.suite-meta { font-size: 10px; color: var(--muted); margin-top: 1px; }

/* Suite detail */
.suite-detail { display: flex; flex-direction: column; gap: var(--space-3); overflow-y: auto; }
.detail-header { display: flex; align-items: center; justify-content: space-between; }
.detail-header h2 { font-size: 16px; font-weight: 600; }
.detail-empty { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 13px; }

/* Prompt section */
.prompt-section { display: flex; flex-direction: column; gap: var(--space-2); }
.section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.empty-hint { font-size: 12px; color: var(--muted); }

.prompt-card { padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.prompt-header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
.prompt-idx { font-size: 10px; color: var(--muted); font-family: var(--font-mono); min-width: 16px; }
.prompt-name-input { font-weight: 600; font-size: 13px; background: transparent; border: none; color: var(--ink); flex: 1; padding: 2px 4px; border-radius: var(--radius-sm); }
.prompt-name-input:focus { outline: none; background: var(--bg); }
.prompt-content { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 11px; padding: var(--space-1) var(--space-2); resize: vertical; }
.prompt-content:focus { outline: none; border-color: var(--primary); }
.prompt-result { margin-top: var(--space-1); font-size: 11px; font-family: var(--font-mono); color: var(--success); }
.prompt-result.error { color: var(--danger); }

.add-prompt { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius-md); }
.add-prompt .input { padding: var(--space-1) var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-size: 12px; }
.add-prompt .input:focus { outline: none; border-color: var(--primary); }
.add-prompt .textarea { font-family: var(--font-mono); font-size: 11px; resize: vertical; }

/* Run section */
.run-section { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.server-info { font-size: 12px; color: var(--muted); }
.server-info code { font-family: var(--font-mono); font-size: 11px; }
.run-bar { display: flex; align-items: center; gap: var(--space-2); }
.progress { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }

/* Aggregate */
.aggregate { display: flex; flex-direction: column; gap: var(--space-2); }
.agg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.agg-item { padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 2px; }
.agg-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.agg-value { font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--ink); }

/* Shared */
.input { padding: var(--space-1) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 13px; }
.input:focus { outline: none; border-color: var(--primary); }

.btn { padding: var(--space-1) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border); font-size: 12px; font-weight: 500; cursor: pointer; transition: background var(--transition-fast); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-sm { padding: var(--space-1) var(--space-2); font-size: 11px; }
.btn.primary { background: var(--primary); color: white; border-color: transparent; }
.btn.primary:hover:not(:disabled) { opacity: 0.85; }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover { background: var(--surface); color: var(--ink); }

.btn-icon { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 14px; padding: 2px; line-height: 1; }
.btn-icon:hover { color: var(--danger); }
</style>
