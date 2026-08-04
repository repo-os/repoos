import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "../api";
import type { DocMeta } from "../types";

export const useDocsStore = defineStore("docs", () => {
  const docs = ref<DocMeta[]>([]);
  const selDoc = ref<string | null>(null);
  const docContent = ref("");
  const docTitle = ref("");

  async function loadDocs(): Promise<void> {
    try {
      docs.value = await api<DocMeta[]>("/api/docs");
      if (docs.value.length && !selDoc.value) await loadDoc(docs.value[0].path);
    } catch {
      /* ignore */
    }
  }

  async function loadDoc(path: string): Promise<void> {
    selDoc.value = path;
    try {
      const r = await fetch(path);
      docContent.value = r.ok ? await r.text() : "(could not load)";
      const d = docs.value.find((x) => x.path === path);
      docTitle.value = d ? d.title : path;
    } catch {
      docContent.value = "(error loading)";
    }
  }

  return { docs, selDoc, docContent, docTitle, loadDocs, loadDoc };
});
