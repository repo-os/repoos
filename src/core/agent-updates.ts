import { realpathSync } from "node:fs";
import type { DetectedAgent } from "./detect.js";

export const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type UpdateStatus = "up_to_date" | "update_available" | "unavailable" | "manual";

export interface UpdateSource {
  kind: "npm" | "homebrew" | "github";
  label: string;
  url: string;
  packageName?: string;
  formula?: string;
  cask?: string;
  owner?: string;
  repo?: string;
  updateCommand?: string | null;
}

export interface AgentUpdate {
  status: UpdateStatus;
  installedVersion: string | null;
  latestVersion: string | null;
  source: string | null;
  sourceUrl: string | null;
  checkedAt: string | null;
  updateCommand: string | null;
  error?: string;
}

export interface UpdateFetch {
  json: unknown;
  status: number;
}

const NPM_PACKAGES: Record<string, string> = {
  opencode: "opencode-ai",
  "claude-code": "@anthropic-ai/claude-code",
  "qwen-code": "@qwen-code/qwen-code",
  codex: "@openai/codex",
  gemini: "@google/gemini-cli",
  copilot: "@github/copilot",
  kiro: "kiro-cli",
  antigravity: "@google/antigravity",
  pi: "@earendil-works/pi-coding-agent",
};

const HOMEBREW_FORMULAS: Record<string, string> = {
  aider: "aider",
  goose: "goose",
};

const GITHUB_RELEASES: Record<string, { owner: string; repo: string }> = {
  goose: { owner: "block", repo: "goose" },
};

/** Parse only ordinary numeric semantic versions. Opaque vendor versions stay incomparable. */
export function parseSemver(value: string | null): [number, number, number] | null {
  if (!value) return null;
  // A trailing sentence period is tolerated: `GitHub Copilot CLI 1.0.86.`
  const match = value
    .trim()
    .match(/(?:^|[^\d])v?(\d+)\.(\d+)\.(\d+)(?:\.\d+)*(?:[-+][0-9A-Za-z.-]+)?\.?(?:\s|$)/);
  if (!match) return null;
  const major = Number(match[1]);
  // Date-style vendor releases (for example 2026.09.18) are not ordered as semver.
  if (major >= 1000) return null;
  return [major, Number(match[2]), Number(match[3])];
}

export function compareSemver(a: string | null, b: string | null): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

function npmSource(agent: DetectedAgent, path: string): UpdateSource | null {
  const packageName = NPM_PACKAGES[agent.id];
  if (!packageName || !path.includes("node_modules")) return null;
  return {
    kind: "npm",
    label: `npm (${packageName})`,
    url: `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
    packageName,
    updateCommand: `npm install -g ${packageName}`,
  };
}

function homebrewSource(agent: DetectedAgent, path: string): UpdateSource | null {
  // The resolved install path names the package itself: Homebrew keeps casks
  // at .../Caskroom/<cask>/<version>/ and formulae at .../Cellar/<formula>/<version>/.
  const cask = /\/Caskroom\/([^/]+)\//.exec(path)?.[1];
  if (cask) {
    return {
      kind: "homebrew",
      label: `Homebrew cask (${cask})`,
      url: `https://formulae.brew.sh/api/cask/${encodeURIComponent(cask)}.json`,
      cask,
      updateCommand: `brew upgrade --cask ${cask}`,
    };
  }
  const formula = /\/Cellar\/([^/]+)\//.exec(path)?.[1] ?? HOMEBREW_FORMULAS[agent.id];
  if (!formula || !/(^|\/)(Cellar|homebrew|linuxbrew)(\/|$)/i.test(path)) return null;
  return {
    kind: "homebrew",
    label: `Homebrew (${formula})`,
    url: `https://formulae.brew.sh/api/formula/${encodeURIComponent(formula)}.json`,
    formula,
    updateCommand: `brew upgrade ${formula}`,
  };
}

function githubSource(agent: DetectedAgent, path: string): UpdateSource | null {
  const release = GITHUB_RELEASES[agent.id];
  if (!release || !/(^|\/)(\.local|goose\/(?:bin|current|target))(\/|$)/i.test(path)) {
    return null;
  }
  return {
    kind: "github",
    label: `GitHub (${release.owner}/${release.repo})`,
    url: `https://api.github.com/repos/${release.owner}/${release.repo}/releases/latest`,
    owner: release.owner,
    repo: release.repo,
    updateCommand: null,
  };
}

/** Resolve a source only from evidence in the installed binary's location. */
export function resolveUpdateSource(agent: DetectedAgent): UpdateSource | null {
  if (!agent.installed || !agent.path) return null;
  let path = agent.path;
  try {
    path = realpathSync(path);
  } catch {
    /* The original executable path is still useful evidence. */
  }
  return npmSource(agent, path) ?? homebrewSource(agent, path) ?? githubSource(agent, path);
}

function versionFromPayload(source: UpdateSource, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (source.kind === "npm" && typeof data.version === "string") return data.version;
  if (source.kind === "homebrew" && source.cask) {
    // Cask versions can carry a build suffix after a comma ("1.2.3,abc123").
    return typeof data.version === "string" ? (data.version.split(",")[0] ?? null) : null;
  }
  if (source.kind === "homebrew") {
    return typeof data.versions === "object" &&
      data.versions !== null &&
      typeof (data.versions as Record<string, unknown>).stable === "string"
      ? ((data.versions as Record<string, unknown>).stable as string)
      : null;
  }
  return typeof data.tag_name === "string" ? data.tag_name : null;
}

export function parseLatestVersion(source: UpdateSource, payload: unknown): string | null {
  return versionFromPayload(source, payload);
}

export function manualUpdate(agent: DetectedAgent, now = new Date().toISOString()): AgentUpdate {
  return {
    status: "manual",
    installedVersion: agent.version,
    latestVersion: null,
    source: null,
    sourceUrl: null,
    checkedAt: now,
    updateCommand: null,
  };
}

export async function checkAgentUpdate(
  agent: DetectedAgent,
  fetcher: (url: string) => Promise<UpdateFetch> = async (url) => {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "RepoOS update checker" },
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, json: await response.json() };
  },
  now = new Date().toISOString(),
): Promise<AgentUpdate> {
  const source = resolveUpdateSource(agent);
  if (!source || !agent.version) return manualUpdate(agent, now);
  try {
    const result = await fetcher(source.url);
    if (result.status < 200 || result.status >= 300) throw new Error(`HTTP ${result.status}`);
    const latestVersion = parseLatestVersion(source, result.json);
    const comparison = compareSemver(agent.version, latestVersion);
    if (!latestVersion || comparison === null) {
      return { ...manualUpdate(agent, now), source: source.label, sourceUrl: source.url };
    }
    return {
      status: comparison < 0 ? "update_available" : "up_to_date",
      installedVersion: agent.version,
      latestVersion,
      source: source.label,
      sourceUrl: source.url,
      checkedAt: now,
      updateCommand: comparison < 0 ? (source.updateCommand ?? null) : null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      installedVersion: agent.version,
      latestVersion: null,
      source: source.label,
      sourceUrl: source.url,
      checkedAt: now,
      updateCommand: null,
      error: error instanceof Error ? error.message : "Unable to check",
    };
  }
}

const cache = new Map<string, { expiresAt: number; value: AgentUpdate }>();

export async function checkAgentUpdates(
  agents: readonly DetectedAgent[],
  force = false,
  nowMs = Date.now(),
): Promise<Record<string, AgentUpdate>> {
  const results = await Promise.all(
    agents
      .filter((agent) => agent.installed)
      .map(async (agent) => {
        const key = `${agent.id}:${agent.path}:${agent.version}`;
        const cached = cache.get(key);
        if (!force && cached && cached.expiresAt > nowMs) return [agent.id, cached.value] as const;
        const value = await checkAgentUpdate(agent, undefined, new Date(nowMs).toISOString());
        cache.set(key, { expiresAt: nowMs + UPDATE_CACHE_TTL_MS, value });
        return [agent.id, value] as const;
      }),
  );
  return Object.fromEntries(results);
}

export function clearUpdateCache(): void {
  cache.clear();
}
