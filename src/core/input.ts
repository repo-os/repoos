import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { parseDocument } from "./frontmatter.js";

export type InputStatus = "new" | "reviewing" | "processed";
export interface InputAttachment { name: string; size: number; path: string }
export interface Input { id: string; title: string; status: InputStatus; body: string; type: string; createdBy: string; createdAt: string; updatedAt: string; path: string; attachments: InputAttachment[] }
const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55) || "input";
const inputRoot = (c: RepoOSConfig) => c.inputsDir ?? "inputs";
const dir = (c: RepoOSConfig) => join(c.root, inputRoot(c));
const attDir = (c: RepoOSConfig, id: string) => join(dir(c), ".attachments", id);

export function listInputs(c: RepoOSConfig): Input[] {
  if (!existsSync(dir(c))) return [];
  return readdirSync(dir(c)).filter((n) => n.endsWith(".md")).flatMap((name) => {
    const path = join(inputRoot(c), name), parsed = parseDocument(readFileSync(join(dir(c), name), "utf8")), d = parsed.data;
    if (typeof d.id !== "string") return [];
    const ad = attDir(c, d.id), attachments = existsSync(ad) ? readdirSync(ad).map((n) => ({ name: n, size: 0, path: join(inputRoot(c), ".attachments", d.id as string, n) })) : [];
    return [{ id: d.id, title: String(d.title ?? "Untitled input"), status: (d.status === "reviewing" || d.status === "processed" ? d.status : "new") as InputStatus, type: String(d.type ?? "other"), createdBy: String(d.created_by ?? ""), createdAt: String(d.created_at ?? ""), updatedAt: String(d.updated_at ?? ""), path, body: parsed.body.trim(), attachments }];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function createInput(c: RepoOSConfig, body: string, type = "other", createdBy = ""): Input {
  const now = new Date().toISOString(), id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title = body.trim().split(/\n/)[0].replace(/^#\s*/, "").slice(0, 100) || "Untitled input", name = `${id}-${slug(title)}.md`;
  mkdirSync(dir(c), { recursive: true });
  writeFileSync(join(dir(c), name), ["---", `id: ${q(id)}`, `title: ${q(title)}`, "status: new", `type: ${q(type)}`, `created_by: ${q(createdBy)}`, `created_at: ${q(now)}`, `updated_at: ${q(now)}`, "---", "", body.trim(), ""].join("\n"));
  return listInputs(c).find((i) => i.id === id)!;
}
export function updateInput(c: RepoOSConfig, id: string, status: InputStatus): Input {
  const item = listInputs(c).find((i) => i.id === id); if (!item) throw new Error("input not found");
  const file = join(c.root, item.path), content = readFileSync(file, "utf8").replace(/^status:.*$/m, `status: ${status}`).replace(/^updated_at:.*$/m, `updated_at: ${q(new Date().toISOString())}`);
  writeFileSync(file, content); return listInputs(c).find((i) => i.id === id)!;
}
export function saveInputAttachment(c: RepoOSConfig, id: string, name: string, data: string): InputAttachment {
  if (!listInputs(c).some((i) => i.id === id)) throw new Error("input not found");
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "-") || "attachment", target = join(attDir(c, id), safe); mkdirSync(attDir(c, id), { recursive: true }); writeFileSync(target, Buffer.from(data, "base64"));
  return { name: safe, size: Buffer.byteLength(data, "base64"), path: join(inputRoot(c), ".attachments", id, safe) };
}
