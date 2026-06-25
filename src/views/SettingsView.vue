<script setup lang="ts">
import { ref } from "vue";
import { useConfigStore, type Provider } from "@/stores/config";
import { useToastStore } from "@/stores/toast";
import { testConnection, fetchModels } from "@/api/client";

const config = useConfigStore();
const toast = useToastStore();

const editing = ref<Provider | null>(null);
const editLabel = ref("");
const editUrl = ref("");
const editKey = ref("");
const isEditing = ref(false);
const testingIdx = ref<number | null>(null);
const modelsCache = ref<Record<string, string[]>>({});

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

  const updated: Provider = { label: editLabel.value.trim(), url: editUrl.value.trim().replace(/\/+$/, ""), apiKey: editKey.value };

  // If editing and URL changed, remove old entry
  if (editing.value && editing.value.url !== updated.url) {
    config.providers = config.providers.filter((p) => p.url !== editing.value!.url || p.label !== editing.value!.label);
  }

  // Update by URL if exists, otherwise add
  const byUrl = config.providers.find((p) => p.url === updated.url);
  if (byUrl) {
    byUrl.label = updated.label;
    byUrl.apiKey = updated.apiKey;
  } else {
    config.providers.push(updated);
  }
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
      <h2 class="section-title">Providers</h2>
      <div v-if="!config.providers.length" class="empty">No providers configured. Click "+ Add Provider" to add one.</div>
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
.empty { font-size: 13px; color: var(--muted); padding: var(--space-4) 0; }

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
