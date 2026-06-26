<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useConfigStore } from "@/stores/config";
import { useProxyStore } from "@/stores/proxy";
import { useHistoryStore } from "@/stores/history";
import { useToastStore } from "@/stores/toast";
import Sidebar from "@/components/Sidebar.vue";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import ToastContainer from "@/components/ToastContainer.vue";

const config = useConfigStore();
const proxy = useProxyStore();
const history = useHistoryStore();
const toast = useToastStore();

let pollTimer: ReturnType<typeof setInterval> | null = null;

// Set theme immediately (defaults to dark, overridden after config loads)
document.documentElement.setAttribute("data-theme", "dark");

onMounted(async () => {
  await config.load();
  document.documentElement.setAttribute("data-theme", config.theme);

  // Poll proxy runs every 5 seconds when proxy is running
  pollTimer = setInterval(async () => {
    if (!proxy.running) return;
    const runs = await proxy.drainRuns();
    for (const run of runs) {
      await history.addRun(run);
      toast.add(`Proxy: ${run.model} — ${run.tps.toFixed(1)} tok/s`, "info");
    }
  }, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <div class="main-area">
      <header class="top-bar">
        <ConnectionStatus />
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100%;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-6);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  min-height: 48px;
  flex-shrink: 0;
}

.content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
