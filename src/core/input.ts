import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { parseDocument } from "./frontmatter.js";

export type InputStatus = "new" | "reviewing" | "processed";
/**
 * How a `processed` input was resolved: `task` means it became a task (the id
 * is in `resolvedTask`), `none` means the decision was to take no action. An
 * empty string means no resolution was recorded (e.g. an input moved to
 * `processed` by hand before this feature existed).
 */
export type InputResolution = "task" | "none";
export interface InputAttachment {
  name: string;
  mime: string;
  size: number;
  path: string;
}
export interface Input {
  id: string;
  /**
   * Stable, zero-padded 4-digit number (`"0001"`), the input's counterpart to
   * a task's `id`. Assigned once — at creation, or retroactively by
   * `ensureInputNumbers` — and never reused or renumbered. Empty string only
   * for an input written before this field existed and not yet migrated.
   */
  number: string;
  title: string;
  status: InputStatus;
  body: string;
  type: string;
  area: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  path: string;
  attachments: InputAttachment[];
  resolution: InputResolution | "";
  resolvedTask: string;
}
const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
/**
 * Set a frontmatter key in a file's raw content, adding it to the block if it
 * isn't there yet. Assumes the content's frontmatter is the first `---` block
 * (true for every input file `createInput` writes).
 */
function setField(content: string, key: string, value: string): string {
  const line = `${key}: ${q(value)}`;
  const re = new RegExp(`^${key}:.*$`, "m");
  return re.test(content) ? content.replace(re, line) : content.replace("---\n", `---\n${line}\n`);
}
const slug = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 55) || "input";
const inputRoot = (c: RepoOSConfig) => c.inputsDir ?? "inputs";
const dir = (c: RepoOSConfig) => join(c.root, inputRoot(c));
const attDir = (c: RepoOSConfig, id: string) => join(dir(c), ".attachments", id);

/**
 * Normalize a raw frontmatter `number` to the canonical zero-padded form.
 * Returns `""` for anything that isn't a plain integer (missing, empty, or
 * garbage), which callers treat as "needs a number".
 */
function normalizeNumber(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v)).padStart(4, "0");
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return v.trim().padStart(4, "0");
  return "";
}

/** Next free 4-digit input number: highest existing number + 1, else `"0001"`. */
function nextInputNumber(c: RepoOSConfig): string {
  let max = 0;
  for (const i of listInputs(c)) {
    const n = parseInt(i.number, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, "0");
}

/**
 * Retroactively assign a stable number to every input that lacks one, in
 * place. Idempotent: numbers already present are never touched, renumbered, or
 * reused, so a restart (or a repeated call) is a no-op. Existing inputs are
 * numbered oldest-first (by `created_at`, then path) so the assignment is
 * deterministic. Returns the inputs that were changed, for callers that want
 * to commit them; an empty array means everything already had a number.
 * See AGENTS.md — this touches the repo's own `inputs/*.md` data.
 */
export function ensureInputNumbers(c: RepoOSConfig): Input[] {
  const items = listInputs(c);
  const missing = items
    .filter((i) => !i.number)
    .sort(
      (a, b) =>
        (a.createdAt || "").localeCompare(b.createdAt || "") || a.path.localeCompare(b.path),
    );
  if (!missing.length) return [];
  const used = new Set(items.map((i) => i.number).filter(Boolean));
  let max = 0;
  for (const n of used) max = Math.max(max, parseInt(n, 10));
  const changed: Input[] = [];
  for (const item of missing) {
    let number = String(max + 1).padStart(4, "0");
    while (used.has(number)) number = String(++max).padStart(4, "0");
    used.add(number);
    max = parseInt(number, 10);
    const file = join(c.root, item.path);
    writeFileSync(file, setField(readFileSync(file, "utf8"), "number", number));
    changed.push({ ...item, number });
  }
  return changed;
}

export function listInputs(c: RepoOSConfig): Input[] {
  if (!existsSync(dir(c))) return [];
  return readdirSync(dir(c))
    .filter((n) => n.endsWith(".md"))
    .flatMap((name) => {
      const path = join(inputRoot(c), name),
        parsed = parseDocument(readFileSync(join(dir(c), name), "utf8")),
        d = parsed.data;
      if (typeof d.id !== "string") return [];
      const ad = attDir(c, d.id),
        attachments = existsSync(ad)
          ? readdirSync(ad).map((n) => ({
              name: n,
              mime: mimeForName(n),
              size: statSync(join(ad, n)).size,
              path: join(inputRoot(c), ".attachments", d.id as string, n),
            }))
          : [];
      return [
        {
          id: d.id,
          number: normalizeNumber(d.number),
          title: String(d.title ?? "Untitled input"),
          status: (d.status === "reviewing" || d.status === "processed"
            ? d.status
            : "new") as InputStatus,
          type: String(d.type ?? "other"),
          area: String(d.area ?? ""),
          createdBy: String(d.created_by ?? ""),
          createdAt: String(d.created_at ?? ""),
          updatedAt: String(d.updated_at ?? ""),
          path,
          body: parsed.body.trim(),
          attachments,
          resolution: (d.resolution === "task" || d.resolution === "none" ? d.resolution : "") as
            | InputResolution
            | "",
          resolvedTask: typeof d.resolved_task === "string" ? d.resolved_task : "",
        },
      ];
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function createInput(c: RepoOSConfig, body: string, type = "other", createdBy = ""): Input {
  const now = new Date().toISOString(),
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    number = nextInputNumber(c),
    title = body.trim().split(/\n/)[0].replace(/^#\s*/, "").slice(0, 100) || "Untitled input",
    name = `${id}-${slug(title)}.md`;
  mkdirSync(dir(c), { recursive: true });
  writeFileSync(
    join(dir(c), name),
    [
      "---",
      `id: ${q(id)}`,
      `number: ${q(number)}`,
      `title: ${q(title)}`,
      "status: new",
      `type: ${q(type)}`,
      `created_by: ${q(createdBy)}`,
      `created_at: ${q(now)}`,
      `updated_at: ${q(now)}`,
      "---",
      "",
      body.trim(),
      "",
    ].join("\n"),
  );
  return listInputs(c).find((i) => i.id === id)!;
}
export function updateInput(c: RepoOSConfig, id: string, status: InputStatus): Input {
  const item = listInputs(c).find((i) => i.id === id);
  if (!item) throw new Error("input not found");
  const file = join(c.root, item.path);
  let content = readFileSync(file, "utf8")
    .replace(/^status:.*$/m, `status: ${status}`)
    .replace(/^updated_at:.*$/m, `updated_at: ${q(new Date().toISOString())}`);
  // A manual move out of `processed` invalidates any recorded resolution —
  // leaving it behind would re-display a stale outcome if the input is later
  // marked processed again without a real resolve action.
  if (status !== "processed") {
    content = setField(content, "resolution", "");
    content = setField(content, "resolved_task", "");
  }
  writeFileSync(file, content);
  return listInputs(c).find((i) => i.id === id)!;
}
/**
 * Record how an input was resolved and move it to `processed`. `task` stores
 * the created task's id in `resolved_task`; `none` clears it. Both keys are
 * persisted in the input file so the outcome survives a reload.
 */
export function resolveInput(
  c: RepoOSConfig,
  id: string,
  resolution: InputResolution,
  taskId = "",
): Input {
  const item = listInputs(c).find((i) => i.id === id);
  if (!item) throw new Error("input not found");
  const file = join(c.root, item.path);
  let content = readFileSync(file, "utf8");
  content = setField(content, "status", "processed");
  content = setField(content, "resolution", resolution);
  content = setField(content, "resolved_task", resolution === "task" ? taskId : "");
  content = content.replace(/^updated_at:.*$/m, `updated_at: ${q(new Date().toISOString())}`);
  writeFileSync(file, content);
  return listInputs(c).find((i) => i.id === id)!;
}
export function enrichInput(
  c: RepoOSConfig,
  id: string,
  fields: { title?: string; type?: string; area?: string },
): Input {
  const item = listInputs(c).find((i) => i.id === id);
  if (!item) throw new Error("input not found");
  const file = join(c.root, item.path);
  let content = readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(fields))
    if (typeof value === "string" && value.trim()) {
      content = setField(content, key, value.trim());
    }
  content = content.replace(/^updated_at:.*$/m, `updated_at: ${q(new Date().toISOString())}`);
  writeFileSync(file, content);
  return listInputs(c).find((i) => i.id === id)!;
}
export function saveInputAttachment(
  c: RepoOSConfig,
  id: string,
  name: string,
  data: string,
): InputAttachment {
  if (!listInputs(c).some((i) => i.id === id)) throw new Error("input not found");
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "-") || "attachment",
    target = join(attDir(c, id), safe);
  mkdirSync(attDir(c, id), { recursive: true });
  writeFileSync(target, Buffer.from(data, "base64"));
  return {
    name: safe,
    mime: mimeForName(safe),
    size: Buffer.byteLength(data, "base64"),
    path: join(inputRoot(c), ".attachments", id, safe),
  };
}

function mimeForName(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        pdf: "application/pdf",
        txt: "text/plain",
        md: "text/markdown",
      } as Record<string, string>
    )[ext ?? ""] ?? "application/octet-stream"
  );
}
export function readInputAttachment(
  c: RepoOSConfig,
  id: string,
  name: string,
): { data: Buffer; mime: string } {
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || !listInputs(c).some((i) => i.id === id))
    throw new Error("attachment not found");
  const base = resolve(attDir(c, id)),
    file = resolve(join(base, name));
  if (!file.startsWith(`${base}/`) || !existsSync(file)) throw new Error("attachment not found");
  return { data: readFileSync(file), mime: mimeForName(name) };
}
