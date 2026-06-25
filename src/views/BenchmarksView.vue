<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useConfigStore } from "@/stores/config";
import { useSuitesStore } from "@/stores/suites";
import { useToastStore } from "@/stores/toast";
import { streamChat, fetchModels } from "@/api/client";
import type { RunMetrics } from "@/types";
import { TEMPLATES } from "@/data/templates";

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
const runProviderUrl = ref(config.serverUrl);
const runApiKey = ref(config.apiKey);
const runModel = ref(config.defaultModel || "");
const models = ref<string[]>([]);
const loadingModels = ref(false);
const showTemplates = ref(false);
const activeTemplateCategory = ref(0);

const selected = computed(() => suites.suites.find((s) => s.id === selectedId.value));

onMounted(async () => {
  await suites.load();
  if (suites.suites.length) selectedId.value = suites.suites[0].id;
  runProviderUrl.value = config.serverUrl;
  runApiKey.value = config.apiKey;
  runModel.value = config.defaultModel || "";
  await loadModels();
});

async function loadModels() {
  loadingModels.value = true;
  models.value = await fetchModels(runProviderUrl.value, runApiKey.value);
  loadingModels.value = false;
  if (!runModel.value && models.value.length) runModel.value = models.value[0];
}

function onProviderChange(url: string) {
  runProviderUrl.value = url;
  const p = config.providers.find((pr) => pr.url === url);
  if (p) runApiKey.value = p.apiKey;
  loadModels();
}

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

async function addTemplatePrompt(t: { name: string; content: string }) {
  if (!selected.value) return;
  await suites.addPrompt(selected.value.id, {
    id: Date.now().toString(36),
    name: t.name,
    content: t.content,
  });
}

async function runSuite() {
  if (!selected.value || running.value || !runModel.value) return;
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
        runProviderUrl.value, runApiKey.value, runModel.value,
        [{ role: "user", content: p.content }]
      )) {
        if (chunk.done) { finalMetrics = chunk.metrics as RunMetrics; break; }
        // We don't show streaming content in suite mode — just collect metrics
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
  <div class="page">
    <div class="top-bar">
      <h1 class="title">Benchmarks</h1>
      <div class="create-row">
        <input v-model="newName" class="input" placeholder="Suite name…" @keydown.enter.prevent="createSuite" />
        <button class="btn primary" @click="createSuite" :disabled="!newName.trim()">Create</button>
      </div>
    </div>

    <div class="body">
      <!-- Left: suite list -->
      <aside class="sidebar">
        <span class="sidebar-label">Suites</span>
        <div v-if="!suites.suites.length" class="empty-state-sidebar">No suites yet. Create one above.</div>
        <div v-for="s in suites.suites" :key="s.id" class="suite-card" :class="{ on: s.id === selectedId }" @click="selectSuite(s.id)">
          <div class="suite-name">{{ s.name }}</div>
          <div class="suite-count">{{ s.prompts.length }} prompt{{ s.prompts.length !== 1 ? "s" : "" }}</div>
        </div>
      </aside>

      <!-- Right: detail -->
      <div v-if="selected" class="detail">
        <!-- Header -->
        <div class="detail-head">
          <h2>{{ selected.name }}</h2>
          <button class="btn ghost sm" @click="suites.remove(selected.id)">Delete suite</button>
        </div>

        <!-- Run configuration -->
        <section class="card">
          <div class="card-h">Run configuration</div>
          <div class="run-config">
            <div class="field">
              <label>Provider</label>
              <select v-model="runProviderUrl" class="sel" @change="onProviderChange(runProviderUrl)">
                <option v-for="p in config.providers" :key="p.url" :value="p.url">{{ p.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>Model</label>
              <select v-model="runModel" class="sel">
                <option value="" disabled>Select model…</option>
                <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
            <div class="field actions">
              <button class="btn primary" @click="runSuite" :disabled="!selected.prompts.length || running || !runModel">
                {{ running ? "Running…" : `Run (${selected.prompts.length})` }}
              </button>
              <span v-if="currentProgress" class="progress">{{ currentProgress }}</span>
            </div>
          </div>
        </section>

        <!-- Prompts -->
        <section class="card">
          <div class="card-h">Prompts ({{ selected.prompts.length }})</div>

          <div v-if="!selected.prompts.length" class="empty-hint">Add prompts below to build your benchmark suite.</div>

          <div v-for="(p, i) in selected.prompts" :key="p.id" class="prompt">
            <div class="prompt-head">
              <span class="idx">{{ i + 1 }}</span>
              <input :value="p.name" class="name-input" @change="(e) => suites.updatePrompt(selected!.id, p.id, { name: (e.target as HTMLInputElement).value })" />
              <button class="btn-icon" @click="suites.removePrompt(selected!.id, p.id)" title="Remove">✕</button>
            </div>
            <textarea :value="p.content" class="content-input" rows="2" @change="(e) => suites.updatePrompt(selected!.id, p.id, { content: (e.target as HTMLTextAreaElement).value })" />
            <div v-if="results[p.id]" class="result ok">
              <span class="badge tps">{{ results[p.id]!.tps.toFixed(1) }} tok/s</span>
              <span class="badge">{{ (results[p.id]!.ttft / 1000).toFixed(2) }}s TTFT</span>
              <span class="badge muted">{{ results[p.id]!.completionTokens }} tok</span>
              <span class="badge muted">{{ (results[p.id]!.duration / 1000).toFixed(1) }}s</span>
            </div>
            <div v-else-if="results[p.id] === null && !running" class="result fail">Failed</div>
          </div>

          <!-- Add prompt -->
          <div class="add-block">
            <div class="add-top">
              <input v-model="newPromptName" class="input flex" placeholder="Prompt name…" />
              <button class="btn" @click="showTemplates = !showTemplates">Templates</button>
            </div>
            <textarea v-model="newPromptContent" class="input area" rows="2" placeholder="Prompt content…" />
            <button class="btn primary sm" @click="addPrompt" :disabled="!newPromptName.trim() || !newPromptContent.trim()">Add</button>

            <!-- Template picker -->
            <div v-if="showTemplates" class="template-picker">
              <div class="tp-nav">
                <button v-for="(cat, ci) in TEMPLATES" :key="ci" class="tp-tab" :class="{ on: activeTemplateCategory === ci }" @click="activeTemplateCategory = ci">{{ cat.name }}</button>
              </div>
              <div class="tp-list">
                <div v-for="t in TEMPLATES[activeTemplateCategory].prompts" :key="t.name" class="tp-item" @click="addTemplatePrompt(t)">
                  <span class="tp-name">{{ t.name }}</span>
                  <span class="tp-preview">{{ t.content.slice(0, 60) }}{{ t.content.length > 60 ? "…" : "" }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Aggregate -->
        <section v-if="Object.keys(results).length" class="card">
          <div class="card-h">Aggregate results</div>
          <div class="agg">
            <div class="agg-item">
              <span class="agg-val">{{ avgTps() }}</span>
              <span class="agg-lbl">Avg TPS</span>
            </div>
            <div class="agg-item">
              <span class="agg-val">{{ avgTtft() }}</span>
              <span class="agg-lbl">Avg TTFT</span>
            </div>
            <div class="agg-item">
              <span class="agg-val">{{ selected.prompts.length }}</span>
              <span class="agg-lbl">Prompts</span>
            </div>
            <div class="agg-item">
              <span class="agg-val" :class="{ good: Object.values(results).filter(Boolean).length === selected.prompts.length }">
                {{ Object.values(results).filter(Boolean).length }}/{{ selected.prompts.length }}
              </span>
              <span class="agg-lbl">Succeeded</span>
            </div>
          </div>
        </section>
      </div>

      <div v-else class="empty-detail">
        <p v-if="suites.suites.length">Select a suite from the left.</p>
        <p v-else>Create a suite to get started.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  height: 100%; display: flex; flex-direction: column;
  padding: var(--space-4) var(--space-5); gap: var(--space-3);
  max-width: 1100px; margin: 0 auto; width: 100%; overflow: hidden;
}

.top-bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
}
.title { font-size: 18px; font-weight: 600; }
.create-row { display: flex; gap: var(--space-2); align-items: center; }
.create-row .input { width: 200px; }

.body { flex: 1; display: grid; grid-template-columns: 180px 1fr; gap: var(--space-3); min-height: 0; overflow: hidden; }

/* Sidebar */
.sidebar { display: flex; flex-direction: column; gap: var(--space-1); overflow-y: auto; }
.sidebar-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: var(--space-1); }
.empty-sidebar { font-size: 12px; color: var(--muted); padding: var(--space-2) 0; }
.suite-card { padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: border-color var(--transition-fast); }
.suite-card:hover { border-color: var(--muted); }
.suite-card.on { border-color: var(--primary); }
.suite-name { font-size: 13px; font-weight: 500; }
.suite-count { font-size: 10px; color: var(--muted); margin-top: 1px; }

/* Detail */
.detail { display: flex; flex-direction: column; gap: var(--space-3); overflow-y: auto; }
.detail-head { display: flex; align-items: center; justify-content: space-between; }
.detail-head h2 { font-size: 16px; font-weight: 600; }
.empty-detail { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 13px; }

/* Cards */
.card { padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-2); }
.card-h { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }

/* Run config */
.run-config { display: flex; gap: var(--space-3); align-items: flex-end; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 3px; }
.field label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.field.actions { margin-left: auto; flex-direction: row; align-items: center; gap: var(--space-2); }
.sel { padding: var(--space-1) var(--space-2); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 12px; min-width: 140px; }
.sel:focus { outline: none; border-color: var(--primary); }
.progress { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }

/* Prompts */
.empty-hint { font-size: 12px; color: var(--muted); }
.prompt { padding: var(--space-2) var(--space-3); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); }
.prompt-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
.idx { font-size: 10px; color: var(--muted); font-family: var(--font-mono); min-width: 16px; }
.name-input { font-weight: 600; font-size: 13px; background: transparent; border: none; color: var(--ink); flex: 1; padding: 2px 4px; border-radius: var(--radius-sm); }
.name-input:focus { outline: none; background: var(--surface); }
.content-input { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-family: var(--font-mono); font-size: 11px; padding: var(--space-1) var(--space-2); resize: vertical; }
.content-input:focus { outline: none; border-color: var(--primary); }

.result { margin-top: var(--space-1); display: flex; gap: var(--space-2); flex-wrap: wrap; }
.result.fail { font-size: 11px; color: var(--danger); font-family: var(--font-mono); }
.badge { font-size: 10px; font-family: var(--font-mono); padding: 1px 6px; border-radius: 3px; background: var(--surface); border: 1px solid var(--border); }
.badge.tps { color: var(--primary); font-weight: 600; border-color: var(--primary); }
.badge.muted { color: var(--muted); }

.add-block { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px dashed var(--border); border-radius: var(--radius-md); background: var(--bg); }
.add-top { display: flex; gap: var(--space-2); }
.add-block .input { padding: var(--space-1) var(--space-2); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink); font-size: 12px; }
.add-block .input.flex { flex: 1; }
.add-block .input:focus { outline: none; border-color: var(--primary); }
.add-block .area { font-family: var(--font-mono); font-size: 11px; resize: vertical; }
.add-block .sm { align-self: flex-start; }

/* Template picker */
.template-picker { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; }
.tp-nav { display: flex; overflow-x: auto; gap: 0; border-bottom: 1px solid var(--border); }
.tp-tab { padding: var(--space-1) var(--space-2); font-size: 11px; font-weight: 500; background: transparent; border: none; color: var(--muted); cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; }
.tp-tab.on { color: var(--ink); border-bottom-color: var(--primary); }
.tp-list { display: flex; flex-direction: column; max-height: 240px; overflow-y: auto; }
.tp-item { padding: var(--space-2) var(--space-3); cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: background var(--transition-fast); }
.tp-item:hover { background: var(--bg); }
.tp-name { font-size: 13px; font-weight: 500; }
.tp-preview { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Aggregate */
.agg { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-2); }
.agg-item { display: flex; flex-direction: column; gap: 2px; }
.agg-val { font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--ink); }
.agg-val.good { color: var(--success); }
.agg-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }

/* Shared */
.input { padding: var(--space-1) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); font-size: 13px; }
.input:focus { outline: none; border-color: var(--primary); }

.btn { padding: var(--space-1) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border); font-size: 12px; font-weight: 500; cursor: pointer; background: var(--surface); color: var(--ink); transition: background var(--transition-fast); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn:hover:not(:disabled) { background: var(--border); }
.btn.sm { padding: var(--space-1) var(--space-2); font-size: 11px; }
.btn.primary { background: var(--primary); color: white; border-color: transparent; }
.btn.primary:hover:not(:disabled) { opacity: 0.85; }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover { background: var(--surface); color: var(--ink); }

.btn-icon { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 14px; padding: 2px; line-height: 1; }
.btn-icon:hover { color: var(--danger); }
</style>
