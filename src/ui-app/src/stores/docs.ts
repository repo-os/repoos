import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "../api";
import { useSearchBodyCache } from "../composables/use-search-body-cache";
import type { DocMeta, SkillMeta } from "../types";

export const useDocsStore = defineStore("docs", () => {
  const docs = ref<DocMeta[]>([]);
  const docsLoading = ref(false);
  const docsLoadError = ref("");
  const selDoc = ref<string | null>(null);
  const docContent = ref("");
  const docTitle = ref("");
  const skills = ref<SkillMeta[]>([]);
  const selSkill = ref<string | null>(null);
  const skillContent = ref("");
  const skillName = ref("");
  const skillDesc = ref("");
  let docsLoadVersion = 0;

  async function loadDocs(): Promise<boolean> {
    const version = ++docsLoadVersion;
    docsLoading.value = true;
    docsLoadError.value = "";
    try {
      const nextDocs = await api<DocMeta[]>("/api/docs");
      // App startup and the Context refresh button can overlap. Only the most
      // recently requested listing may update shared data or request state.
      if (version !== docsLoadVersion) return true;
      docs.value = nextDocs;
      if (nextDocs.length && !selDoc.value) await loadDoc(nextDocs[0].path);
      return true;
    } catch {
      if (version !== docsLoadVersion) return true;
      docsLoadError.value = "Could not load docs. Try again.";
      return false;
    } finally {
      if (version === docsLoadVersion) docsLoading.value = false;
    }
  }

  /**
   * After creating a doc, reload the listing and ensure the new path is indexed
   * for search even if the API listing is briefly stale.
   */
  async function syncDocAfterCreate(path: string): Promise<void> {
    await loadDocs();
    if (docs.value.some((d) => d.path === path)) return;
    let title = path;
    try {
      const r = await fetch(path);
      if (r.ok) {
        const text = await r.text();
        const m = text.match(/^\s*#\s+(.+)$/m);
        if (m) title = m[1].trim();
      }
    } catch {
      /* title falls back to path */
    }
    docs.value = [...docs.value, { path, title, mtimeMs: Date.now() }].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    useSearchBodyCache().prefetchPath(path);
  }

  async function loadDoc(path: string): Promise<void> {
    selDoc.value = path;
    try {
      const r = await fetch(path);
      const text = r.ok ? await r.text() : "(could not load)";
      docContent.value = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
      const d = docs.value.find((x) => x.path === path);
      docTitle.value = d ? d.title : path;
    } catch {
      docContent.value = "(error loading)";
    }
  }

  async function loadSkills(): Promise<void> {
    try {
      skills.value = await api<SkillMeta[]>("/api/skills");
    } catch {
      /* ignore */
    }
  }

  async function loadSkill(path: string): Promise<void> {
    selSkill.value = path;
    const s = skills.value.find((x) => x.path === path);
    skillName.value = s?.name ?? path;
    skillDesc.value = s?.description ?? "";
    try {
      const r = await fetch(path);
      const text = r.ok ? await r.text() : "(could not load)";
      skillContent.value = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
    } catch {
      skillContent.value = "(error loading)";
    }
  }

  return {
    docs,
    docsLoading,
    docsLoadError,
    selDoc,
    docContent,
    docTitle,
    skills,
    selSkill,
    skillContent,
    skillName,
    skillDesc,
    loadDocs,
    syncDocAfterCreate,
    loadDoc,
    loadSkills,
    loadSkill,
  };
});
