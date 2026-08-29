import { basename, extname, resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { connect } from "node:net";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { STATUSES } from "../../core/types.js";
import { readBuildStamp } from "../../core/build.js";

export const UI_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

export function serveStaticUi(res: any, uiDir: string, urlPath: string): boolean {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (rel.includes("..")) return false;
  const abs = resolve(uiDir, rel || "index.html");
  if (!abs.startsWith(resolve(uiDir))) return false;
  if (!existsSync(abs) || !statSync(abs).isFile()) return false;
  const ext = extname(abs).toLowerCase();
  const noCache = rel === "sw.js" || rel === "manifest.webmanifest";
  res.writeHead(200, {
    "Content-Type": UI_MIME[ext] ?? "application/octet-stream",
    "Cache-Control": noCache ? "no-cache" : ext === ".html" ? "no-cache" : "max-age=86400",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(readFileSync(abs));
  return true;
}

export function safeRepoFile(root: string, urlPath: string): string | null {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, ""));
  if (rel.includes("..")) return null;
  const abs = resolve(root, rel);
  if (!abs.startsWith(resolve(root))) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  if (extname(abs) !== ".md") return null;
  return abs;
}

export function findUiDir(root: string): string | null {
  const candidates = [join(root, "dist", "ui")];
  const here = dirname(dirname(fileURLToPath(import.meta.url))); // src/server
  candidates.push(join(here, "ui"), join(here, "..", "..", "dist", "ui"));
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

export function findPackageRoot(): string | null {
  const here = dirname(dirname(dirname(fileURLToPath(import.meta.url)))); // project root
  if (existsSync(join(here, "package.json"))) return here;
  const parent = dirname(here);
  if (existsSync(join(parent, "package.json"))) return parent;
  return null;
}

export function loadBuildInfo(): { version: string | null; buildAt: string | null } {
  const root = findPackageRoot();
  if (!root) return { version: null, buildAt: null };
  let version: string | null = null;
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (typeof pkg?.version === "string") version = pkg.version;
  } catch {
    /* ignore */
  }
  // The timestamp lives in dist/.build-stamp.json (gitignored) so the hash
  // marker stays deterministic; readBuildStamp falls back to the legacy
  // inline field for installs built before the split.
  return { version, buildAt: readBuildStamp(root) };
}

export function skillField(text: string, field: string): string | null {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

export function listDocs(config: RepoOSConfig): { path: string; title: string }[] {
  const out: { path: string; title: string }[] = [];
  const seen = new Set<string>();
  const add = (abs: string, rel: string) => {
    if (seen.has(rel) || !existsSync(abs)) return;
    seen.add(rel);
    let title = rel;
    try {
      const m = readFileSync(abs, "utf8").match(/^\s*#\s+(.+)$/m);
      if (m) title = m[1].trim();
    } catch {
      /* ignore */
    }
    out.push({ path: rel, title });
  };
  for (const name of ["AGENTS.md", "CLAUDE.md", "README.md"]) {
    add(join(config.root, name), name);
  }
  const docsPath = join(config.root, config.docsDir);
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      if (e.startsWith(".")) continue;
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (extname(e) === ".md") {
        const rel = full
          .slice(config.root.length + 1)
          .split("\\")
          .join("/");
        add(full, rel);
      }
    }
  };
  walk(docsPath);
  return out;
}

export function listSkills(config: RepoOSConfig) {
  const out: Array<{ path: string; name: string; description: string }> = [];
  const skillsPath = join(config.root, config.skillsDir);
  if (!existsSync(skillsPath)) return out;
  for (const e of readdirSync(skillsPath)) {
    if (e.startsWith(".")) continue;
    const dir = join(skillsPath, e);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, "SKILL.md");
    if (!existsSync(file)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    out.push({
      path: `${config.skillsDir.split("\\").join("/")}/${e}/SKILL.md`,
      name: skillField(text, "name") ?? e,
      description: skillField(text, "description") ?? "",
    });
  }
  return out;
}

export function repoGuideContext(config: RepoOSConfig, tasks: Task[]): string {
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  const statusSummary = STATUSES.map((status) => `${status}: ${counts.get(status) ?? 0}`).join(
    ", ",
  );
  const taskSummary = tasks
    .map(
      (task) =>
        `- #${task.id} [${task.status}] ${task.title} (type: ${task.type}, priority: ${task.priority}, area: ${task.area || "unspecified"}, file: ${task.path})`,
    )
    .join("\n");
  const docs = listDocs(config)
    .map((doc) => `- ${doc.title} (${doc.path})`)
    .join("\n");
  return `Repository: ${basename(config.root)}\nRoot: ${config.root}\nTask counts: ${statusSummary}\n\nTasks:\n${taskSummary || "- none"}\n\nContext documents:\n${docs || "- none"}`;
}
