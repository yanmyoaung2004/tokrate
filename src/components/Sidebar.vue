<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { useConfigStore } from "@/stores/config";

const router = useRouter();
const route = useRoute();
const config = useConfigStore();

const navItems = [
  { path: "/", label: "Playground", icon: ">" },
  { path: "/compare", label: "Compare", icon: "=" },
  { path: "/history", label: "History", icon: "*" },
  { path: "/leaderboard", label: "Leaderboard", icon: "#" },
  { path: "/settings", label: "Settings", icon: "@" },
];
</script>

<template>
  <nav class="sidebar">
    <div class="logo" @click="router.push('/')">
      <span class="logo-icon">T</span>
      <span class="logo-text">TokRate</span>
    </div>
    <ul class="nav-list">
      <li v-for="item in navItems" :key="item.path">
        <router-link
          :to="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </li>
    </ul>
    <div class="sidebar-footer">
      <button class="theme-toggle" @click="config.toggleTheme()" :title="config.theme === 'dark' ? 'Switch to light' : 'Switch to dark'">
        {{ config.theme === 'dark' ? '☀' : '☾' }}
      </button>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  width: 200px;
  min-width: 200px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-5) var(--space-4);
  cursor: pointer;
  user-select: none;
}

.logo-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: white;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 14px;
  border-radius: var(--radius-sm);
}

.logo-text {
  font-weight: 600;
  font-size: 16px;
  color: var(--ink);
}

.nav-list {
  list-style: none;
  flex: 1;
  padding: var(--space-2);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--muted);
  text-decoration: none;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.nav-item:hover {
  background: color-mix(in oklch, var(--primary) 10%, transparent);
  color: var(--ink);
  text-decoration: none;
}

.nav-item.active {
  background: color-mix(in oklch, var(--primary) 15%, transparent);
  color: var(--primary);
}

.nav-icon {
  font-family: var(--font-mono);
  width: 20px;
  text-align: center;
  font-size: 12px;
  opacity: 0.6;
}

.nav-label {
  font-size: 14px;
}

.sidebar-footer {
  padding: var(--space-3);
  border-top: 1px solid var(--border);
}

.theme-toggle {
  width: 100%;
  padding: var(--space-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.theme-toggle:hover {
  background: var(--border);
  color: var(--ink);
}
</style>
