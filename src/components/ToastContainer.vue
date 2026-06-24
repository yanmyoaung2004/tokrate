<script setup lang="ts">
import { useToastStore } from "@/stores/toast";

const toast = useToastStore();
</script>

<template>
  <div class="toast-container">
    <transition-group name="toast">
      <div
        v-for="t in toast.toasts"
        :key="t.id"
        class="toast"
        :class="t.type"
        @click="toast.remove(t.id)"
      >
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 200;
  pointer-events: none;
}

.toast {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  pointer-events: auto;
  max-width: 360px;
  box-shadow: var(--shadow-md);
}

.toast.success {
  background: var(--success);
  color: white;
}

.toast.error {
  background: var(--danger);
  color: white;
}

.toast.info {
  background: var(--primary);
  color: white;
}

.toast-enter-active {
  transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-leave-active {
  transition: all 150ms ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
