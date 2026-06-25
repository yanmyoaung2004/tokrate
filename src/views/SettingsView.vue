<script setup lang="ts">
import { ref } from "vue";
import { useConfigStore, type Provider } from "@/stores/config";
import { useToastStore } from "@/stores/toast";
import { testConnection, fetchModels } from "@/api/client";
import { scanLocalEngines, type DiscoveredEngine } from "@/api/discovery";

const config = useConfigStore();
const toast = useToastStore();

const editing = ref<Provider | null>(null);
const editLabel = ref("");
const editUrl = ref("");
const editKey = ref("");
const isEditing = ref(false);
const testingIdx = ref<number | null>(null);
const modelsCache = ref<Record<string, string[]>>({});
const scanning = ref(false);
const scanProgress = ref(0);
const scanTotal = ref(0);
const discovered = ref<DiscoveredEngine[]>([]);
const showScan = ref(false);

async function startScan() {
  scanning.value = true;
  discovered.value = [];
  scanProgress.value = 0;
  scanTotal.value = 5;
  try {
    discovered.value = await scanLocalEngines((found, total) => {
      scanProgress.value = found;
      scanTotal.value = total;
    });
    if (discovered.value.length) toast.add(`Found ${discovered.value.length} local server${discovered.value.length > 1 ? "s" : ""}`, "success");
    else toast.add("No local LLM servers found", "info");
  } catch {
    toast.add("Scan failed", "error");
  }
  scanning.value = false;
  showScan.value = true;
}

function addDiscovered(d: DiscoveredEngine) {
  if (config.providers.some((p) => p.url === d.serverUrl)) {
    toast.add(`${d.label} already added`, "info");
    return;
  }
  config.providers.push({ label: d.label, url: d.serverUrl, apiKey: "" });
  config.save();
  toast.add(`Added ${d.label}`, "success");
  discovered.value = discovered.value.filter((e) => e.url !== d.url);
}

function startAdd() {
  isEditing.value = true;
  editing.value = { label: "", url: "http://localhost:11434", apiKey: "" };
  editLabel.value = "";
  editUrl.value = "http://localhost:11434";
  editKey.value = "";
}

function startEdit(p: Provider) {
  isEditing.value = true;
  editing.value = { ...p };
  editLabel.value = p.label;
  editUrl.value = p.url;
  editKey.value = p.apiKey;
}

function cancelEdit() {
  isEditing.value = false;
  editing.value = null;
}

function saveProvider() {
  if (!editLabel.value.trim() || !editUrl.value.trim()) {
    toast.add("Name and URL are required", "error");
    return;
  }
  try { new URL(editUrl.value); } catch { toast.add("Invalid URL", "error"); return; }

  const updated: Provider = {
    label: editLabel.value.trim(),
    url: editUrl.value.trim().replace(/\/+$/, ""),
    apiKey: editKey.value,
  };

  // Remove any existing entry with the same URL (dedup)
  config.providers = config.providers.filter((p) => p.url !== updated.url);

  // Add the new/updated entry
  config.providers.push(updated);
  config.selectProvider(updated.url, updated.apiKey);
  isEditing.value = false;
  editing.value = null;
  toast.add("Provider saved", "success");
}

function removeProvider(p: Provider) {
  config.providers = config.providers.filter((pr) => pr.url !== p.url || pr.label !== p.label);
  if (config.serverUrl === p.url) {
    const first = config.providers[0];
    if (first) config.selectProvider(first.url, first.apiKey);
  }
  config.save();
  toast.add("Provider removed", "info");
}

async function testProvider(idx: number) {
  const p = config.providers[idx];
  testingIdx.value = idx;
  try {
    const ok = await testConnection(p.url, p.apiKey);
    if (ok) {
      const models = await fetchModels(p.url, p.apiKey);
      modelsCache.value[p.url] = models;
      toast.add(`${p.label}: connected (${models.length} models)`, "success");
    } else {
      toast.add(`${p.label}: connection failed`, "error");
    }
  } catch { toast.add(`${p.label}: connection error`, "error"); }
  testingIdx.value = null;
}
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Manage your LLM server connections and preferences.</p>
      </div>
      <button class="btn primary" @click="startAdd">+ Add Provider</button>
    </div>

    <!-- Provider editor -->
    <div v-if="isEditing" class="editor-panel">
      <h2 class="editor-title">{{ editing ? "Edit" : "New" }} Provider</h2>
      <div class="editor-fields">
        <div class="field">
          <label>Name</label>
          <input v-model="editLabel" class="input" placeholder="Ollama Local, vLLM Server…" />
        </div>
        <div class="field">
          <label>Server URL</label>
          <input v-model="editUrl" class="input mono" placeholder="http://localhost:11434" />
        </div>
        <div class="field">
          <label>API Key (optional)</label>
          <input v-model="editKey" class="input mono" placeholder="sk-…" type="password" />
        </div>
      </div>
      <div class="editor-actions">
        <button class="btn" @click="cancelEdit">Cancel</button>
        <button class="btn primary" @click="saveProvider">Save</button>
      </div>
    </div>

    <!-- Provider list -->
    <div class="section">
      <div class="section-h">
        <h2 class="section-title">Providers</h2>
        <button v-if="config.providers.length" class="btn sm" @click="startScan" :disabled="scanning">Scan local</button>
      </div>

      <!-- Empty state -->
      <div v-if="!config.providers.length" class="empty-state">
        <div class="empty-icon">⚙</div>
        <h3 class="empty-title">No providers yet</h3>
        <p class="empty-desc">Add your first LLM server to get started. TokRate works with any OpenAI-compatible API — Ollama, vLLM, llama.cpp, LM Studio, SGLang.</p>
        <div class="empty-actions">
          <button class="btn primary" @click="startAdd">+ Add Provider</button>
          <button class="btn" @click="startScan" :disabled="scanning">Scan for local servers</button>
        </div>
      </div>

      <!-- Scanner results (shown even when providers exist) -->
      <div v-if="scanning" class="scan-card">
        <span class="scan-title">Scanning local ports…</span>
        <div class="scan-bar"><div class="scan-fill" :style="{ width: (scanTotal > 0 ? (scanProgress / scanTotal) * 100 : 0) + '%' }"></div></div>
        <span class="scan-progress">Port {{ scanProgress + 1 }} of {{ scanTotal }}</span>
      </div>

      <div v-if="discovered.length && !scanning" class="scan-results">
        <div class="scan-h">
          <span class="scan-title">Found {{ discovered.length }} server{{ discovered.length > 1 ? "s" : "" }}</span>
          <button class="btn sm" @click="startScan">Rescan</button>
        </div>
        <div v-for="d in discovered" :key="d.port" class="discovered-card">
          <div class="disc-info">
            <span class="disc-name">{{ d.label }}</span>
            <span class="disc-models">{{ d.models.length }} model{{ d.models.length !== 1 ? "s" : "" }}</span>
          </div>
          <button class="btn primary sm" @click="addDiscovered(d)">Add</button>
        </div>
      </div>
      <div v-for="(p, i) in config.providers" :key="p.url + p.label" class="provider-card">
        <div class="provider-info">
          <span class="provider-name">{{ p.label }}</span>
          <span class="provider-url mono">{{ p.url }}</span>
          <span v-if="p.apiKey" class="provider-key">key set</span>
          <span v-if="modelsCache[p.url]?.length" class="provider-models">{{ modelsCache[p.url].length }} models</span>
        </div>
        <div class="provider-actions">
          <button class="btn sm" @click="testProvider(i)" :disabled="testingIdx === i" :title="testingIdx === i ? 'Testing…' : 'Test connection'">
            {{ testingIdx === i ? "…" : "⟳" }}
          </button>
          <button class="btn sm" @click="startEdit(p)" title="Edit">✎</button>
          <button class="btn sm danger" @click="removeProvider(p)" title="Remove">✕</button>
        </div>
      </div>
    </div>

    <!-- Preferences -->
    <div class="section">
      <h2 class="section-title">Preferences</h2>
      <div class="pref-row">
        <span class="pref-label">Theme</span>
        <button class="btn" @click="config.toggleTheme()">
          {{ config.theme === "dark" ? "☀ Light" : "☾ Dark" }}
        </button>
      </div>
      <div class="pref-row">
        <span class="pref-label">Request timeout</span>
        <input v-model.number="config.timeout" type="number" min="5000" max="120000" step="5000" class="input mono" style="width:100px" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%; overflow-y: auto; padding: var(--space-5) var(--space-6);
  max-width: 640px; display: flex; flex-direction: column; gap: var(--space-5);
}

.page-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4);
}
.page-title { font-size: 20px; font-weight: 600; }
.page-subtitle { font-size: 13px; color: var(--muted); margin-top: 2px; }

/* Editor panel */
.editor-panel {
  background: var(--surface); border: 1px solid var(--primary);
  border-radius: var(--radius-md); padding: var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.editor-title { font-size: 14px; font-weight: 600; }
.editor-fields { display: flex; flex-direction: column; gap: var(--space-3); }
.editor-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }

.input {
  padding: var(--space-2) var(--space-3); background: var(--bg);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  color: var(--ink); font-family: var(--font-ui); font-size: 13px;
}
.input:focus { outline: none; border-color: var(--primary); }
.input.mono { font-family: var(--font-mono); font-size: 12px; }

/* Section */
.section { display: flex; flex-direction: column; gap: var(--space-3); }
.section-title {
  font-size: 13px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--muted);
}
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: var(--space-10) var(--space-4); gap: var(--space-3);
  background: var(--surface); border: 1px dashed var(--border);
  border-radius: var(--radius-md); text-align: center;
}
.empty-icon { font-size: 32px; opacity: 0.5; }
.empty-title { font-size: 16px; font-weight: 600; }
.empty-desc { font-size: 13px; color: var(--muted); max-width: 400px; line-height: 1.5; }

.empty-actions { display: flex; gap: var(--space-2); margin-top: var(--space-1); }

/* Scanner */
.scan-card { padding: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-2); }
.scan-title { font-size: 13px; font-weight: 500; }
.scan-bar { height: 4px; background: var(--bg); border-radius: 2px; overflow: hidden; }
.scan-fill { height: 100%; background: var(--primary); border-radius: 2px; transition: width 300ms ease; }
.scan-progress { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }
.scan-h { display: flex; align-items: center; justify-content: space-between; }
.scan-results { display: flex; flex-direction: column; gap: var(--space-2); }
.discovered-card { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.disc-info { display: flex; flex-direction: column; gap: 1px; }
.disc-name { font-size: 13px; font-weight: 500; }
.disc-models { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }

.section-h { display: flex; align-items: center; justify-content: space-between; }

/* Provider card */
.provider-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-3); background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  gap: var(--space-3);
}
.provider-info {
  display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
}
.provider-name { font-weight: 600; font-size: 13px; }
.provider-url { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-key { font-size: 10px; color: var(--warning); font-family: var(--font-mono); }
.provider-models { font-size: 10px; color: var(--success); font-family: var(--font-mono); }
.mono { font-family: var(--font-mono); }

.provider-actions { display: flex; gap: var(--space-1); flex-shrink: 0; }

/* Preference row */
.pref-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-3); background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-md);
}
.pref-label { font-size: 13px; font-weight: 500; }

/* Shared buttons */
.btn {
  padding: var(--space-1) var(--space-3); border-radius: var(--radius-md);
  border: 1px solid var(--border); font-size: 12px; font-weight: 500;
  cursor: pointer; background: var(--surface); color: var(--ink);
  transition: background var(--transition-fast);
}
.btn:hover { background: var(--border); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.sm { padding: var(--space-1) var(--space-2); font-size: 11px; }
.btn.primary { background: var(--primary); color: white; border-color: transparent; }
.btn.primary:hover { opacity: 0.85; }
.btn.danger:hover { background: var(--danger); color: white; border-color: transparent; }
</style>
