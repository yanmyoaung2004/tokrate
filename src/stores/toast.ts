import { defineStore } from "pinia";
import { ref } from "vue";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export const useToastStore = defineStore("toast", () => {
  const toasts = ref<Toast[]>([]);

  function add(message: string, type: Toast["type"] = "info") {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    toasts.value.push({ id, message, type });
    setTimeout(() => remove(id), 4000);
  }

  function remove(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, add, remove };
});
