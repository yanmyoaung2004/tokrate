<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useConfigStore } from "@/stores/config";
import { testConnection } from "@/api/client";

const config = useConfigStore();
const status = ref<"unknown" | "connected" | "disconnected">("unknown");
const checking = ref(false);

async function check() {
  checking.value = true;
  try {
    const ok = await testConnection(config.serverUrl, config.apiKey);
    status.value = ok ? "connected" : "disconnected";
  } catch {
    status.value = "disconnected";
  } finally {
    checking.value = false;
  }
}

onMounted(() => {
  if (config.loaded) check();
  else {
    const unwatch = config.$subscribe(() => {
      if (config.loaded) {
        check();
        unwatch();
      }
    });
  }
});
</script>

<template>
  <div class="connection-status" :class="status">
    <span class="dot"></span>
    <span class="label">
      {{ status === "connected" ? "Connected" : status === "disconnected" ? "Disconnected" : "Checking..." }}
    </span>
    <button v-if="status !== 'connected'" class="retry-btn" @click="check" :disabled="checking">
      retry
    </button>
  </div>
</template>

<style scoped>
.connection-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: var(--muted);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
}

.connected .dot {
  background: var(--success);
}

.disconnected .dot {
  background: var(--danger);
}

.label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 11px;
}

.retry-btn {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.retry-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
