import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { RepoOSConfig } from "./types.js";

const API = "https://skills.sh/api/v1/skills";
const LOCKFILE = "skills.lock.json";

export interface RegistrySkill {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  sourceType: string;
  installUrl: string | null;
  url: string;
  isDuplicate?: boolean;
}

export interface RegistryDetail {
  id: string;
  source: string;
  slug: string;
  installs: number;
  hash: string | null;
  files: Array<{ path: string; contents: string }> | null;
}

export interface RegistryAudit {
  audits: Array<{ provider: string; status: "pass" | "warn" | "fail"; summary: string; riskLevel?: string }>;
}

function headers(): HeadersInit {
  const token = process.env.VERCEL_OIDC_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Skills.sh request failed (${response.status})`);
  return (await response.json()) as T;
}

export async function curatedRegistrySkills(): Promise<RegistrySkill[]> {
  const body = await request<{ data: Array<{ skills: RegistrySkill[] }> }>(`${API}/curated`);
  return body.data.flatMap((owner) => owner.skills).filter((skill) => !skill.isDuplicate);
}

export async function searchRegistrySkills(query: string): Promise<RegistrySkill[]> {
  const q = query.trim();
  if (q.length < 2) return curatedRegistrySkills();
  const body = await request<{ data: RegistrySkill[] }>(`${API}/search?q=${encodeURIComponent(q)}&limit=30`);
  return body.data.filter((skill) => !skill.isDuplicate);
}

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error("invalid skill registry id");
  }
  return id;
}

export async function registryDetail(id: string): Promise<RegistryDetail> {
  return request<RegistryDetail>(`${API}/${safeId(id)}`);
}

export async function registryAudit(id: string): Promise<RegistryAudit | null> {
  try {
    return await request<RegistryAudit>(`${API}/audit/${safeId(id)}`);
  } catch {
    return null;
  }
}

function safeRelativeFile(path: unknown): path is string {
  return typeof path === "string" && (path === "SKILL.md" || (/^[A-Za-z0-9._/-]+$/.test(path) && !path.includes("..") && !path.startsWith("/")));
}

function lockPath(config: RepoOSConfig): string {
  return join(config.root, LOCKFILE);
}

function readLock(config: RepoOSConfig): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(lockPath(config), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

/** Vendor inspected registry files into the project and retain immutable provenance. */
export function installRegistrySkill(config: RepoOSConfig, detail: RegistryDetail): { path: string } {
  const slug = typeof detail.slug === "string" ? detail.slug.toLowerCase() : "";
  const files = detail.files;
  if (
    !/^[a-z0-9][a-z0-9-]*$/.test(slug)
    || !Array.isArray(files)
    || !files.some((file) => file && file.path === "SKILL.md")
    || !files.every((file) => file && safeRelativeFile(file.path) && typeof file.contents === "string")
  ) {
    throw new Error("registry skill is missing a valid SKILL.md");
  }
  const target = join(config.root, config.skillsDir, slug);
  if (existsSync(target)) throw new Error(`skill ${slug} is already installed`);
  for (const file of files) {
    const destination = resolve(target, file.path);
    if (!destination.startsWith(resolve(target) + "/")) throw new Error("unsafe registry file path");
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.contents, "utf8");
  }
  const lock = readLock(config);
  lock[slug] = { id: detail.id, source: detail.source, hash: detail.hash, installedAt: new Date().toISOString() };
  writeFileSync(lockPath(config), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return { path: `${config.skillsDir}/${slug}/SKILL.md` };
}
