import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "../api";
import type { DocMeta, SkillMeta } from "../types";

export const useDocsStore = defineStore("docs", () => {
  const docs = ref<DocMeta[]>([]);
  const selDoc = ref<string | null>(null);
  const docContent = ref("");
  const docTitle = ref("");
  const skills = ref<SkillMeta[]>([]);
  const selSkill = ref<string | null>(null);
  const skillContent = ref("");
  const skillName = ref("");
  const skillDesc = ref("");

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
    selDoc,
    docContent,
    docTitle,
    skills,
    selSkill,
    skillContent,
    skillName,
    skillDesc,
    loadDocs,
    loadDoc,
    loadSkills,
    loadSkill,
  };
});
