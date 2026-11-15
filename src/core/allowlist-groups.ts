/**
 * Allowlist groups (#1132).
 *
 * The budget allowlist (`[[budget.allowlist]]`) is per-repo, committed, and
 * edited by hand today. Projects that belong to the same company share the same
 * coding agents, model providers and quotas, so they need one allowlist and one
 * pause state. A project opts in with `budget.allowlistGroup = "<name>"`.
 *
 * The group's state lives OUTSIDE any repo — one small TOML file per group in
 * `~/.config/repoos/allowlist-groups/<name>.toml` (or
 * `$REPOOS_ALLOWLIST_GROUPS_DIR`) — because it is machine-local coordination
 * state, not project source. It is never committed, never pushed, and can never
 * hold a credential: the parser only keeps the same five allowlist fields and
 * drops everything else.
 *
 * Merge rule: group rows are the base; a project row for the same CLI layers on
 * top (model lists union, pause wins, per-model pauses merge with the project
 * value winning). Project-only rows are appended. A project without a group
 * keeps the exact project-only behaviour it had before groups existed.
 *
 * This module is pure/node-free where it matters for the browser: the merge and
 * drift helpers are shared by the server and the Budget Controls panel.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { agentModelAllowRows, normalizeAllowlistRows } from "./budget-allowlist.js";
import { stripTomlComment } from "./toml-line.js";
import type { AgentModelAllowRow, AgentModelPause } from "./types.js";

/** Current on-disk group schema. A future shape bumps this in a migration. */
export const ALLOWLIST_GROUP_VERSION = 1;

/** A machine-local allowlist group. */
export interface AllowlistGroup {
  /** Stable group name — the value of `budget.allowlistGroup`. */
  name: string;
  /** Monotonic write counter; newest `updatedAt` wins across machines. */
  version: number;
  /** ISO timestamp of the last write, used for last-writer-wins sync. */
  updatedAt: string;
  /** The group's base allowlist. Never holds secrets. */
  allowlist: AgentModelAllowRow[];
}

/** Where one effective entry came from. */
export type AllowlistEntrySource = "group" | "project";

/** Default machine-local directory for allowlist groups. */
export function allowlistGroupsDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.REPOOS_ALLOWLIST_GROUPS_DIR?.trim();
  if (override) return resolve(override);
  return join(homedir(), ".config", "repoos", "allowlist-groups");
}

/** Path for one group's TOML file. The name is validated, never interpolated raw. */
export function allowlistGroupPath(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const validated = normalizeAllowlistGroupName(name);
  if (!validated) throw new Error(`invalid allowlist group name: ${JSON.stringify(name)}`);
  return join(allowlistGroupsDir(env), `${validated}.toml`);
}

/**
 * Normalize a configured group name. Returns `undefined` for unset/blank so a
 * project without a group behaves exactly as it did before #1132.
 *
 * The name becomes a filename, so this rejects path separators and relative
 * components rather than trusting a hand-edited `repoos.toml`.
 */
export function normalizeAllowlistGroupName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (!name) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) return undefined;
  return name;
}

/** A new/empty group at `now`, used when a pause seeds a missing group file. */
export function emptyAllowlistGroup(
  name: string,
  allowlist: AgentModelAllowRow[] = [],
  now: Date = new Date(),
): AllowlistGroup {
  return {
    name,
    version: ALLOWLIST_GROUP_VERSION,
    updatedAt: now.toISOString(),
    allowlist,
  };
}

function pauseKey(pause: AgentModelPause): string {
  return pause.model;
}

function mergePausedModels(
  group: AgentModelPause[] | undefined,
  project: AgentModelPause[] | undefined,
): AgentModelPause[] | undefined {
  if (!group?.length) return project?.length ? project.map((p) => ({ ...p })) : undefined;
  if (!project?.length) return group.map((p) => ({ ...p }));
  const byModel = new Map<string, AgentModelPause>();
  for (const pause of group) byModel.set(pauseKey(pause), { ...pause });
  for (const pause of project) byModel.set(pauseKey(pause), { ...pause });
  return [...byModel.values()];
}

function mergeRow(group: AgentModelAllowRow, project: AgentModelAllowRow): AgentModelAllowRow {
  const models = [...group.models];
  for (const model of project.models) if (!models.includes(model)) models.push(model);
  const merged: AgentModelAllowRow = { cli: group.cli, models };
  // A pause on either side stays a pause. The project can add or shorten a
  // pause, but cannot silently un-pause an agent the group paused — that is
  // exactly the "a pause in any member updates every member" guarantee.
  if (group.paused || project.paused) {
    merged.paused = true;
    const until = project.pausedUntil ?? group.pausedUntil;
    const reason = project.pausedReason ?? group.pausedReason;
    if (until) merged.pausedUntil = until;
    if (reason) merged.pausedReason = reason;
  }
  const pausedModels = mergePausedModels(group.pausedModels, project.pausedModels);
  if (pausedModels?.length) merged.pausedModels = pausedModels;
  return merged;
}

/**
 * Merge a group's base allowlist with a project's own rows.
 *
 * Empty `groupRows` returns `projectRows` unchanged (same array contents), so a
 * project without a group — or a group that does not exist yet — behaves
 * exactly as today.
 */
export function mergeAllowlistRows(
  groupRows: AgentModelAllowRow[],
  projectRows: AgentModelAllowRow[],
): AgentModelAllowRow[] {
  if (!groupRows.length) return projectRows.map((row) => ({ ...row }));
  const byCli = new Map<string, AgentModelAllowRow>();
  for (const row of groupRows) byCli.set(row.cli, { ...row, models: [...row.models] });
  const merged: AgentModelAllowRow[] = [];
  for (const row of groupRows) {
    const project = projectRows.find((candidate) => candidate.cli === row.cli);
    merged.push(project ? mergeRow(row, project) : byCli.get(row.cli)!);
  }
  for (const row of projectRows) {
    if (!byCli.has(row.cli)) merged.push({ ...row, models: [...row.models] });
  }
  return merged;
}

/**
 * Provenance for each effective CLI: `project` when the project contributed a
 * row for that CLI (even if the group also lists it), else `group`.
 */
export function allowlistSources(
  groupRows: AgentModelAllowRow[],
  projectRows: AgentModelAllowRow[],
): Record<string, AllowlistEntrySource> {
  const projectClis = new Set(projectRows.map((row) => row.cli));
  const sources: Record<string, AllowlistEntrySource> = {};
  for (const row of groupRows) {
    sources[row.cli] = projectClis.has(row.cli) ? "project" : "group";
  }
  for (const row of projectRows) {
    if (!(row.cli in sources)) sources[row.cli] = "project";
  }
  return sources;
}

export interface AllowlistDriftEntry {
  cli: string;
  /** One-line explanation for the Settings warning. */
  detail: string;
}

function sameModels(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((model, i) => model === b[i]);
}

function samePause(a: AgentModelAllowRow, b: AgentModelAllowRow): boolean {
  return (
    (a.paused === true) === (b.paused === true) &&
    (a.pausedUntil ?? "") === (b.pausedUntil ?? "") &&
    (a.pausedReason ?? "") === (b.pausedReason ?? "") &&
    JSON.stringify(a.pausedModels ?? []) === JSON.stringify(b.pausedModels ?? [])
  );
}

/**
 * Compare the effective allowlist with the group base. Any project row that
 * changes a group entry, or adds a locally-only agent, is drift a reviewer can
 * see and clear with "Re-sync from group".
 */
export function allowlistDrift(
  groupRows: AgentModelAllowRow[],
  projectRows: AgentModelAllowRow[],
): AllowlistDriftEntry[] {
  if (!projectRows.length) return [];
  const groupByCli = new Map(groupRows.map((row) => [row.cli, row]));
  const effectiveByCli = new Map(
    mergeAllowlistRows(groupRows, projectRows).map((row) => [row.cli, row]),
  );
  const drift: AllowlistDriftEntry[] = [];
  for (const project of projectRows) {
    const group = groupByCli.get(project.cli);
    if (!group) {
      drift.push({
        cli: project.cli,
        detail: `${project.cli} is only in this project, not in the group`,
      });
      continue;
    }
    const effective = effectiveByCli.get(project.cli)!;
    const details: string[] = [];
    if (!sameModels(group.models, effective.models)) {
      const extra = effective.models.filter((model) => !group.models.includes(model));
      if (extra.length) details.push(`adds ${extra.join(", ")} locally`);
    }
    if (!samePause(group, effective)) details.push("has a local pause override");
    if (details.length)
      drift.push({ cli: project.cli, detail: `${project.cli} ${details.join("; ")}` });
  }
  return drift;
}

/**
 * Project rows that are safe to drop when re-syncing to the group: every row
 * whose CLI the group also defines. Project-only rows stay — they are additions
 * the human deliberately made and the group cannot recreate them.
 */
export function projectRowsAfterResync(
  groupRows: AgentModelAllowRow[],
  projectRows: AgentModelAllowRow[],
): AgentModelAllowRow[] {
  const groupClis = new Set(groupRows.map((row) => row.cli));
  return projectRows.filter((row) => !groupClis.has(row.cli));
}

// ── On-disk group store ─────────────────────────────────────────────────────

/** TOML string literal; JSON escaping is a valid TOML basic-string subset. */
function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    return `{ ${entries.map(([k, v]) => `${k} = ${tomlValue(v)}`).join(", ")} }`;
  }
  return tomlString(String(value));
}

/** Deterministic group-file serialization (stable key order, no secrets). */
export function serializeAllowlistGroup(group: AllowlistGroup): string {
  const lines = [
    `# RepoOS allowlist group ${JSON.stringify(group.name)} — machine-local state.`,
    `# Shared by every project whose repoos.toml sets budget.allowlistGroup = ${JSON.stringify(group.name)}.`,
    "# Never committed, never pushed, and it holds no credentials. Do not hand-edit.",
    `name = ${tomlString(group.name)}`,
    `version = ${group.version}`,
    `updatedAt = ${tomlString(group.updatedAt)}`,
  ];
  for (const row of group.allowlist) {
    const body: string[] = [`cli = ${tomlString(row.cli)}`, `models = ${tomlValue(row.models)}`];
    if (row.paused) body.push("paused = true");
    if (row.pausedUntil) body.push(`pausedUntil = ${tomlString(row.pausedUntil)}`);
    if (row.pausedReason) body.push(`pausedReason = ${tomlString(row.pausedReason)}`);
    if (row.pausedModels?.length) body.push(`pausedModels = ${tomlValue(row.pausedModels)}`);
    lines.push("", "[[allowlist]]", ...body);
  }
  return `${lines.join("\n")}\n`;
}

/** Split a TOML inline list on top-level commas, respecting quotes/braces. */
function splitInlineItems(text: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      current += ch;
      if (ch === "\\" && quote === '"') {
        i++;
        current += text[i] ?? "";
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function unquote(text: string): string {
  const value = text.trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineToml(text: string): unknown {
  const value = text.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitInlineItems(value.slice(1, -1)).map((item) => parseInlineToml(item));
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const out: Record<string, unknown> = {};
    for (const part of splitInlineItems(value.slice(1, -1))) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      out[part.slice(0, eq).trim()] = parseInlineToml(part.slice(eq + 1));
    }
    return out;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return unquote(value);
}

/**
 * Minimal reader for the one shape this module writes: root scalars plus
 * `[[allowlist]]` blocks. Kept local (not `parseFlatToml`) so the config loader
 * can import this module without a cycle; anything it cannot recognize is
 * ignored by `agentModelAllowRows`, and a missing `allowlist` is an empty group.
 */
function parseGroupToml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let row: Record<string, unknown> | null = null;
  const rows: Record<string, unknown>[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = stripTomlComment(raw).trim();
    if (!line) continue;
    if (/^\[\[allowlist\]\]$/.test(line)) {
      row = {};
      rows.push(row);
      continue;
    }
    if (/^\[[A-Za-z0-9_.-]+\]$/.test(line)) {
      row = null;
      continue;
    }
    // A line that is neither a known header nor `key = value` means the file
    // was hand-edited into something we cannot read. Treat it as invalid rather
    // than silently loading an empty group (which would un-pause everything).
    if (line.startsWith("[")) throw new Error(`unrecognized TOML header: ${line}`);
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!match) throw new Error(`unrecognized TOML line: ${line}`);
    const value = match[2]!.trim();
    if (
      (value.startsWith("[") && !value.endsWith("]")) ||
      (value.startsWith("{") && !value.endsWith("}"))
    ) {
      throw new Error(`unterminated TOML value for ${match[1]}`);
    }
    const target = row ?? root;
    target[match[1]!] = parseInlineToml(value);
  }
  if (rows.length || /\[\[allowlist\]\]/.test(text)) root.allowlist = rows;
  return root;
}

export type AllowlistGroupRead = AllowlistGroup | null | "invalid";

/**
 * Read one group file. A missing file is `null`; unreadable/corrupt content is
 * `"invalid"` so callers can warn and keep the project's own rows rather than
 * silently dropping a group pause.
 */
export function readAllowlistGroup(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): AllowlistGroupRead {
  let path: string;
  try {
    path = allowlistGroupPath(name, env);
  } catch {
    return "invalid";
  }
  if (!existsSync(path)) return null;
  try {
    const parsed = parseGroupToml(readFileSync(path, "utf8"));
    const parsedName = normalizeAllowlistGroupName(parsed.name);
    const normalizedName = normalizeAllowlistGroupName(name)!;
    if (parsedName && parsedName !== normalizedName) return "invalid";
    const version =
      typeof parsed.version === "number" && Number.isFinite(parsed.version)
        ? Math.max(0, Math.floor(parsed.version))
        : 0;
    const updatedAt =
      typeof parsed.updatedAt === "string" && Number.isFinite(Date.parse(parsed.updatedAt))
        ? parsed.updatedAt
        : new Date(0).toISOString();
    const allowlist = agentModelAllowRows(parsed.allowlist);
    return { name: normalizedName, version, updatedAt, allowlist };
  } catch {
    return "invalid";
  }
}

function writeGroupFile(path: string, group: AllowlistGroup): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, serializeAllowlistGroup(group), { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

/** Persist a group file (atomic write, private permissions). */
export function writeAllowlistGroup(
  group: AllowlistGroup,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const name = normalizeAllowlistGroupName(group.name);
  if (!name) throw new Error(`invalid allowlist group name: ${JSON.stringify(group.name)}`);
  writeGroupFile(allowlistGroupPath(name, env), { ...group, name });
}

/**
 * True when `incoming` is newer than `current`: later `updatedAt` wins, and a
 * higher version breaks an identical-timestamp tie. A missing local group
 * always accepts the incoming state.
 */
export function isNewerGroup(incoming: AllowlistGroup, current: AllowlistGroup | null): boolean {
  if (!current) return true;
  const incomingAt = Date.parse(incoming.updatedAt);
  const currentAt = Date.parse(current.updatedAt);
  if (Number.isFinite(incomingAt) && Number.isFinite(currentAt) && incomingAt !== currentAt) {
    return incomingAt > currentAt;
  }
  return incoming.version > current.version;
}

/** Apply a local mutation to a group, bumping version/updatedAt for last-writer-wins. */
export function withGroupMutation(
  group: AllowlistGroup,
  allowlist: AgentModelAllowRow[],
  now: Date = new Date(),
): AllowlistGroup {
  return {
    ...group,
    allowlist,
    version: Math.max(0, Math.floor(group.version)) + 1,
    updatedAt: now.toISOString(),
  };
}

/**
 * Load the group a project belongs to, if any, and its project-only rows. Used
 * by the config loader and the group API so both see the same base.
 */
export interface LoadedAllowlistGroup {
  name: string;
  group: AllowlistGroup | null;
  invalid: boolean;
}

export function loadAllowlistGroup(
  name: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): LoadedAllowlistGroup | null {
  const normalized = normalizeAllowlistGroupName(name);
  if (!normalized) return null;
  const read = readAllowlistGroup(normalized, env);
  if (read === "invalid") return { name: normalized, group: null, invalid: true };
  return { name: normalized, group: read, invalid: false };
}

/**
 * Validate an incoming group payload (from a peer or the API) without trusting
 * any extra field. Returns a readable error string instead of throwing so both
 * the HTTP receiver and the SSH-receiver CLI can answer with `refused`.
 */
export function normalizeAllowlistGroupPayload(
  input: unknown,
  expectedName?: string,
): AllowlistGroup | string {
  if (!input || typeof input !== "object") return "group payload must be an object";
  const raw = input as Record<string, unknown>;
  const groupRaw = (raw.group ?? input) as Record<string, unknown>;
  const name = normalizeAllowlistGroupName(groupRaw.name);
  if (!name) return "group payload needs a valid name";
  if (expectedName && name !== expectedName) {
    return `payload is for group "${name}", this project is in "${expectedName}"`;
  }
  const versionRaw = groupRaw.version;
  const version =
    typeof versionRaw === "number" && Number.isFinite(versionRaw)
      ? Math.max(0, Math.floor(versionRaw))
      : 0;
  const updatedAtRaw = groupRaw.updatedAt;
  if (typeof updatedAtRaw !== "string" || !Number.isFinite(Date.parse(updatedAtRaw))) {
    return "group payload needs an ISO updatedAt";
  }
  const parsed = normalizeAllowlistRows(groupRaw.allowlist);
  if ("error" in parsed) return parsed.error;
  return {
    name,
    version,
    updatedAt: new Date(Date.parse(updatedAtRaw)).toISOString(),
    allowlist: parsed.rows,
  };
}
