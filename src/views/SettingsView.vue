<script setup lang="ts">
import { ref, watch } from "vue";
import { useConfigStore } from "@/stores/config";
import { testConnection, fetchModels } from "@/api/client";

const config = useConfigStore();
const connectionOk = ref<boolean | null>(null);
const testing = ref(false);
const models = ref<string[]>([]);
const loadingModels = ref(false);

async function testConn() {
  testing.value = true;
  connectionOk.value = await testConnection(config.serverUrl, config.apiKey);
  testing.value = false;
  if (connectionOk.value) {
    await loadModels();
  }
}

async function loadModels() {
  loadingModels.value = true;
  models.value = await fetchModels(config.serverUrl, config.apiKey);
  loadingModels.value = false;
}

watch(() => config.serverUrl, () => { connectionOk.value = null; });
</script>

<template>
  <div class="page">
    <h1 class="page-title">Settings</h1>
    <p class="page-subtitle">Configure your server connection and preferences.</p>

    <div class="settings-section">
      <h2 class="section-title">Server Connection</h2>

      <div class="field">
        <label class="field-label" for="serverUrl">Server URL</label>
        <input
          id="serverUrl"
          v-model="config.serverUrl"
          class="field-input"
          placeholder="http://localhost:11434"
          type="url"
        />
      </div>

      <div class="field">
        <label class="field-label" for="apiKey">API Key</label>
        <input
          id="apiKey"
          v-model="config.apiKey"
          class="field-input"
          placeholder="Optional"
          type="password"
        />
      </div>

      <div class="field">
        <label class="field-label" for="model">Default Model</label>
        <div class="field-with-action">
          <input
            id="model"
            v-model="config.defaultModel"
            class="field-input"
            placeholder="llama3.2"
            list="model-list"
          />
          <datalist id="model-list">
            <option v-for="m in models" :key="m" :value="m" />
          </datalist>
          <button
            class="btn btn-secondary"
            @click="loadModels"
            :disabled="loadingModels"
          >
            {{ loadingModels ? "Loading..." : "Refresh" }}
          </button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="timeout">Request Timeout (ms)</label>
        <input
          id="timeout"
          v-model.number="config.timeout"
          class="field-input"
          type="number"
          min="5000"
          max="120000"
          step="5000"
        />
      </div>

      <div class="field">
        <button class="btn btn-primary" @click="testConn" :disabled="testing">
          {{ testing ? "Testing..." : "Test Connection" }}
        </button>
        <span v-if="connectionOk === true" class="status-ok">Connected</span>
        <span v-else-if="connectionOk === false" class="status-err">Connection failed</span>
      </div>
    </div>

    <div class="settings-section">
      <h2 class="section-title">Preferences</h2>
      <div class="field">
        <label class="field-label">Theme</label>
        <button class="btn btn-secondary" @click="config.toggleTheme()">
          Switch to {{ config.theme === "dark" ? "Light" : "Dark" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.page-subtitle {
  color: var(--muted);
  margin-bottom: var(--space-6);
}

.settings-section {
  margin-bottom: var(--space-8);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.field {
  margin-bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
}

.field-input {
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 14px;
  max-width: 400px;
}

.field-input:focus {
  outline: none;
  border-color: var(--primary);
}

.field-with-action {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--surface);
  border-color: var(--border);
  color: var(--ink);
}

.btn-secondary:hover {
  background: var(--border);
}

.status-ok {
  color: var(--success);
  font-size: 13px;
  font-weight: 500;
}

.status-err {
  color: var(--danger);
  font-size: 13px;
  font-weight: 500;
}
</style>
