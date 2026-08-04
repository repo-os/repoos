import type { Task, ConfigField, DocMeta } from "./types";

export type SearchResult =
  | { kind: "task"; title: string; subtitle: string; task: Task }
  | { kind: "doc"; title: string; subtitle: string; path: string }
  | { kind: "setting"; title: string; subtitle: string; key: string };

export interface SearchSource {
  tasks: Task[];
  docs: DocMeta[];
  fields: ConfigField[];
}

/** Per-kind cap so the dropdown stays bounded on large repos. */
export const RESULT_CAP = 8;

function includes(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle);
}

export function searchAll(query: string, src: SearchSource): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const taskHits: SearchResult[] = [];
  for (const t of src.tasks) {
    if (includes(t.id, q) || includes(t.title, q) || includes(t.body, q)) {
      taskHits.push({
        kind: "task",
        title: t.title,
        subtitle: `#${t.id} · ${t.status} · ${t.area}`,
        task: t,
      });
      if (taskHits.length >= RESULT_CAP) break;
    }
  }

  const docHits: SearchResult[] = [];
  for (const d of src.docs) {
    if (includes(d.title, q) || includes(d.path, q)) {
      docHits.push({ kind: "doc", title: d.title || d.path, subtitle: d.path, path: d.path });
      if (docHits.length >= RESULT_CAP) break;
    }
  }

  const settingHits: SearchResult[] = [];
  for (const f of src.fields) {
    if (includes(f.label, q) || includes(f.key, q)) {
      settingHits.push({ kind: "setting", title: f.label, subtitle: f.key, key: f.key });
      if (settingHits.length >= RESULT_CAP) break;
    }
  }

  return [...taskHits, ...docHits, ...settingHits];
}
