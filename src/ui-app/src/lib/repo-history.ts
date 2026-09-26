import type { RepoCommit } from "../../../core/repo-log.js";

export type HistoryCommit = RepoCommit & {
  check?: { passed: boolean };
};

export interface HistoryDayGroup {
  key: string;
  label: string;
  commits: HistoryCommit[];
}

/** Calendar day in local time, used as a sticky-header grouping key. */
export function dayKey(iso: string, now = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "unknown";
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  void now;
  return `${y}-${m}-${d}`;
}

export function dayLabel(key: string, now = new Date()): string {
  if (key === "unknown") return "Unknown date";
  const [ys, ms, ds] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!y || !m || !d) return key;
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function groupCommitsByDay(commits: HistoryCommit[], now = new Date()): HistoryDayGroup[] {
  const groups: HistoryDayGroup[] = [];
  const index = new Map<string, HistoryDayGroup>();
  for (const commit of commits) {
    const key = dayKey(commit.date, now);
    let group = index.get(key);
    if (!group) {
      group = { key, label: dayLabel(key, now), commits: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.commits.push(commit);
  }
  return groups;
}

export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export interface SubjectParts {
  type: string | null;
  taskId: string | null;
  rest: string;
  raw: string;
}

export function splitTaskSubject(subject: string): SubjectParts {
  const m = subject.match(/^([A-Za-z][\w-]*)\((\d{4,})\):\s*(.*)$/);
  if (!m) return { type: null, taskId: null, rest: subject, raw: subject };
  return { type: m[1]!, taskId: m[2]!, rest: m[3] ?? "", raw: subject };
}
