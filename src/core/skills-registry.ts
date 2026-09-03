import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { RepoOSConfig } from "./types.js";

const SEARCH_API = "https://skills.sh/api/search";
const AUDIT_API = "https://add-skill.vercel.sh/audit";
const GITHUB_API = "https://api.github.com";
const LOCKFILE = "skills.lock.json";
const STARTER_QUERIES = ["frontend", "testing", "security", "database", "release", "documentation"];

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
  audits: Array<{
    provider: string;
    status: "pass" | "warn" | "fail";
    summary: string;
    riskLevel?: string;
  }>;
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "RepoOS skills discovery" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Skill source request failed (${response.status})`);
  return (await response.json()) as T;
}

export async function curatedRegistrySkills(): Promise<RegistrySkill[]> {
  const results = await Promise.all(STARTER_QUERIES.map((query) => searchRegistrySkills(query)));
  const seen = new Set<string>();
  return results
    .flat()
    .filter((skill) => !seen.has(skill.id) && (seen.add(skill.id), true))
    .slice(0, 30);
}

export async function searchRegistrySkills(query: string): Promise<RegistrySkill[]> {
  const q = query.trim();
  if (q.length < 2) return curatedRegistrySkills();
  const body = await request<{
    skills: Array<{ id: string; skillId?: string; name: string; installs: number; source: string }>;
  }>(`${SEARCH_API}?q=${encodeURIComponent(q)}&limit=30`);
  return body.skills.map((skill) => ({
    id: skill.id,
    slug: skill.skillId ?? skill.name,
    name: skill.name,
    source: skill.source,
    installs: skill.installs,
    sourceType: "github",
    installUrl: null,
    url: `https://skills.sh/${skill.id}`,
  }));
}

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error("invalid skill registry id");
  }
  return id;
}

export async function registryDetail(id: string): Promise<RegistryDetail> {
  const [owner, repo, slug] = safeId(id).split("/");
  const source = `${owner}/${repo}`;
  const commit = await request<{ sha: string }>(`${GITHUB_API}/repos/${source}/commits/HEAD`);
  const tree = await request<{ tree: Array<{ path: string; type: string }> }>(
    `${GITHUB_API}/repos/${source}/git/trees/${commit.sha}?recursive=1`,
  );
  const skillMd =
    tree.tree.find((entry) => entry.type === "blob" && entry.path === `skills/${slug}/SKILL.md`) ??
    tree.tree.find((entry) => entry.type === "blob" && entry.path.endsWith(`/${slug}/SKILL.md`));
  if (!skillMd) throw new Error("Skill files are not available from its public source repository");
  const directory = skillMd.path.slice(0, -"SKILL.md".length);
  const paths = tree.tree
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(directory))
    .map((entry) => entry.path);
  const files = await Promise.all(
    paths.map(async (path) => ({
      path: path.slice(directory.length),
      contents: await fetchText(
        `https://raw.githubusercontent.com/${source}/${commit.sha}/${path}`,
      ),
    })),
  );
  const hash = createHash("sha256")
    .update(files.map((file) => `${file.path}\0${file.contents}`).join("\0"))
    .digest("hex");
  return { id, source, slug, installs: 0, hash, files };
}

export async function registryAudit(id: string): Promise<RegistryAudit | null> {
  try {
    const [, , slug] = safeId(id).split("/");
    const source = id.split("/").slice(0, 2).join("/");
    const data = await request<Record<string, Record<string, { risk?: string; alerts?: number }>>>(
      `${AUDIT_API}?source=${encodeURIComponent(source)}&skills=${encodeURIComponent(slug)}`,
    );
    return {
      audits: Object.entries(data[slug] ?? {}).map(([provider, result]) => ({
        provider,
        status:
          result.risk === "safe"
            ? "pass"
            : result.risk === "high" || result.risk === "critical"
              ? "fail"
              : "warn",
        summary: `${result.risk ?? "unknown"} risk${result.alerts === undefined ? "" : ` · ${result.alerts} alerts`}`,
      })),
    };
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "RepoOS skills discovery" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Skill source request failed (${response.status})`);
  return response.text();
}

function safeRelativeFile(path: unknown): path is string {
  return (
    typeof path === "string" &&
    (path === "SKILL.md" ||
      (/^[A-Za-z0-9._/-]+$/.test(path) && !path.includes("..") && !path.startsWith("/")))
  );
}

function lockPath(config: RepoOSConfig): string {
  return join(config.root, LOCKFILE);
}

function readLock(config: RepoOSConfig): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(lockPath(config), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Vendor inspected registry files into the project and retain immutable provenance. */
export function installRegistrySkill(
  config: RepoOSConfig,
  detail: RegistryDetail,
): { path: string } {
  const slug = typeof detail.slug === "string" ? detail.slug.toLowerCase() : "";
  const files = detail.files;
  if (
    !/^[a-z0-9][a-z0-9-]*$/.test(slug) ||
    !Array.isArray(files) ||
    !files.some((file) => file && file.path === "SKILL.md") ||
    !files.every((file) => file && safeRelativeFile(file.path) && typeof file.contents === "string")
  ) {
    throw new Error("registry skill is missing a valid SKILL.md");
  }
  const target = join(config.root, config.skillsDir, slug);
  if (existsSync(target)) throw new Error(`skill ${slug} is already installed`);
  for (const file of files) {
    const destination = resolve(target, file.path);
    if (!destination.startsWith(resolve(target) + "/"))
      throw new Error("unsafe registry file path");
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.contents, "utf8");
  }
  const lock = readLock(config);
  lock[slug] = {
    id: detail.id,
    source: detail.source,
    hash: detail.hash,
    installedAt: new Date().toISOString(),
  };
  writeFileSync(lockPath(config), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return { path: `${config.skillsDir}/${slug}/SKILL.md` };
}
