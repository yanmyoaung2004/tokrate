import { defineStore } from "pinia";
import { ref } from "vue";

export interface SavedTemplate {
  id: string;
  name: string;
  content: string;
  created: number;
}

const STORAGE_KEY = "tokrate-custom-templates";

export const useTemplatesStore = defineStore("templates", () => {
  const custom = ref<SavedTemplate[]>([]);

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      custom.value = raw ? JSON.parse(raw) : [];
    } catch {
      custom.value = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom.value));
  }

  function add(name: string, content: string) {
    custom.value.unshift({
      id: Date.now().toString(36),
      name,
      content,
      created: Date.now(),
    });
    save();
  }

  function remove(id: string) {
    custom.value = custom.value.filter((t) => t.id !== id);
    save();
  }

  load();

  return { custom, add, remove };
});
