<script setup lang="ts">
import { onMounted } from "vue";
import { useConfigStore } from "@/stores/config";
import Sidebar from "@/components/Sidebar.vue";
import ConnectionStatus from "@/components/ConnectionStatus.vue";

const config = useConfigStore();

onMounted(async () => {
  await config.load();
  document.documentElement.setAttribute(
    "data-theme",
    config.theme
  );
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
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-6);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  min-height: 48px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}
</style>
