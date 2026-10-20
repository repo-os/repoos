/**
 * Settings import/export (#0779): serialize a selection of transferable
 * settings to TOML, parse such a file back, and build the PATCH body an
 * import applies to the current project.
 *
 * Pure (no Vue, no localStorage, no network) so it is unit-testable directly.
 * The five transferable categories are the Agent+Model allowlist, Agent+Model
 * favorites, starred coding agents, starred themes, and remote validation.
 * The first and last live in `repoos.toml` (applied via PATCH /api/config);
 * the middle three are browser-local favorites (applied via localStorage).
 *
 * The TOML dialect here is deliberately small — comments, `[table]`,
 * `[[array-of-tables]]`, and single-line scalars / string arrays — mirroring
 * how `parseFlatToml` / `serializeTomlVal` treat values server-side
 * (`JSON.stringify` for strings), so an export round-trips byte-clean.
 */

/** The five categories the Import/Export tab can transfer. */
export type ExportSectionId =
  | "budgetAllowlist"
  | "agentModelFavorites"
  | "starredAgents"
  | "starredThemes"
  | "remoteValidation";

export const EXPORT_SECTIONS: { id: ExportSectionId; label: string; description: string }[] = [
  {
    id: "budgetAllowlist",
    label: "Agent+Model allowlist",
    description: "The [[budget.allowlist]] rows that restrict which models each agent may use.",
  },
  {
    id: "agentModelFavorites",
    label: "Agent+Model favorites",
    description: "Your saved agent + model combinations from the model picker.",
  },
  {
    id: "starredAgents",
    label: "Starred coding agents",
    description: "The agent CLIs starred on the Agents page.",
  },
  {
    id: "starredThemes",
    label: "Starred themes",
    description: "The design themes starred in Settings → General.",
  },
  {
    id: "remoteValidation",
    label: "Remote validation",
    description:
      "The [remoteValidation] runner config. Per-host OS, labels and concurrency " +
      "([[remoteValidation.tailscaleHosts]] row attrs) stay in repoos.toml — only the host list transfers.",
  },
];

/** localStorage keys backing the three browser-local favorite lists. */
export const AGENT_MODEL_FAVORITES_KEY = "agent-model-favorites";
export const AGENT_FAVORITES_KEY = "agent-cli-favorites";
export const FAVORITE_THEMES_KEY = "repoos.favoriteThemes";

export interface BudgetAllowlistPause {
  model: string;
  pausedUntil?: string;
  pausedReason?: string;
}

export interface BudgetAllowlistRow {
  cli: string;
  models: string[];
  paused?: boolean;
  pausedUntil?: string;
  pausedReason?: string;
  pausedModels?: BudgetAllowlistPause[];
}

export interface AgentModelFavorite {
  cli: string;
  model: string;
  addedAt?: number;
  recentlyUsedAt?: number;
}

/**
 * Remote validation as a flat map (`enabled`, `provider`, `tailscaleHost`,
 * `tailscaleHosts` as a `user@host` string list, …). Only keys the server's
 * PATCH accepts are kept — see REMOTE_VALIDATION_RULES.
 */
export type RemoteValidationExport = Record<string, unknown>;

export interface SettingsExportData {
  budgetAllowlist?: BudgetAllowlistRow[];
  agentModelFavorites?: AgentModelFavorite[];
  starredAgents?: string[];
  starredThemes?: string[];
  remoteValidation?: RemoteValidationExport;
}

/** Which sections an export file (or an import apply) covers. */
export type ExportSelection = Record<ExportSectionId, boolean>;

export const ALL_SECTIONS_SELECTED: ExportSelection = {
  budgetAllowlist: true,
  agentModelFavorites: true,
  starredAgents: true,
  starredThemes: true,
  remoteValidation: true,
};

/** Format version written into `[meta]`; a newer version only warns on import. */
export const SETTINGS_EXPORT_VERSION = 1;

// ── Sanitizers (shared by export collection and import validation) ───────────

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Validate `[[budget.allowlist]]`-shaped rows; invalid rows are dropped. */
export function sanitizeBudgetAllowlist(value: unknown): BudgetAllowlistRow[] {
  if (!Array.isArray(value)) return [];
  const out: BudgetAllowlistRow[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const cli = nonEmptyString(r.cli);
    if (!cli) continue;
    const models = (Array.isArray(r.models) ? r.models : [])
      .map((m) => (typeof m === "string" ? m.trim() : ""))
      .filter(Boolean);
    if (!models.length) continue;
    const row: BudgetAllowlistRow = { cli, models };
    if (r.paused === true) row.paused = true;
    const pausedUntil = nonEmptyString(r.pausedUntil);
    if (pausedUntil) row.pausedUntil = pausedUntil;
    const pausedReason = nonEmptyString(r.pausedReason);
    if (pausedReason) row.pausedReason = pausedReason;
    if (Array.isArray(r.pausedModels)) {
      const pauses: BudgetAllowlistPause[] = [];
      for (const item of r.pausedModels) {
        let model: string | null = null;
        let until: string | null = null;
        let reason: string | null = null;
        if (typeof item === "string") model = nonEmptyString(item);
        else if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const p = item as Record<string, unknown>;
          model = nonEmptyString(p.model);
          until = nonEmptyString(p.pausedUntil);
          reason = nonEmptyString(p.pausedReason);
        }
        if (!model) continue;
        pauses.push({
          model,
          ...(until ? { pausedUntil: until } : {}),
          ...(reason ? { pausedReason: reason } : {}),
        });
      }
      if (pauses.length) row.pausedModels = pauses;
    }
    out.push(row);
  }
  return out;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Validate agent+model favorite rows; invalid rows are dropped. */
export function sanitizeAgentModelFavorites(value: unknown): AgentModelFavorite[] {
  if (!Array.isArray(value)) return [];
  const out: AgentModelFavorite[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const cli = nonEmptyString(r.cli);
    const model = nonEmptyString(r.model);
    if (!cli || !model) continue;
    const fav: AgentModelFavorite = { cli, model };
    const addedAt = finiteNumber(r.addedAt);
    if (addedAt !== null && addedAt >= 0) fav.addedAt = addedAt;
    const recentlyUsedAt = finiteNumber(r.recentlyUsedAt);
    if (recentlyUsedAt !== null && recentlyUsedAt >= 0) fav.recentlyUsedAt = recentlyUsedAt;
    out.push(fav);
  }
  return out;
}

/** Validate a plain id list (starred agents / themes); deduped, order kept. */
export function sanitizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (id && !seen.has(id)) seen.add(id);
  }
  return [...seen];
}

/**
 * One `tailscaleHosts` pool entry (a flat `"user@host"` string or a
 * `{ host, user }` row object from the loaded config) to its flat string form.
 */
export function hostEntryToString(entry: unknown): string | null {
  if (typeof entry === "string") return entry.trim() || null;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const r = entry as Record<string, unknown>;
  const host = nonEmptyString(r.host);
  if (!host) return null;
  const user = nonEmptyString(r.user);
  return user ? `${user}@${host}` : host;
}

/** Normalize a host pool of any shape to a deduped flat string list. */
export function normalizeHostList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const s = hostEntryToString(entry);
    if (s && !seen.has(s)) seen.add(s);
  }
  return [...seen];
}

type RemoteValidationRule =
  | { kind: "boolean" }
  | { kind: "string"; allowEmpty?: boolean }
  | { kind: "provider" }
  | { kind: "selectInt"; min: number; max: number }
  | { kind: "int"; min: number }
  | { kind: "hosts" };

/**
 * How each `[remoteValidation]` key maps onto what PATCH /api/config accepts.
 * Mirrors the server's generic string/boolean/number/select branches plus the
 * dedicated tailscaleHosts branch — `buildImportPatch` drops anything that
 * would 400 the save and reports it as a warning instead.
 */
const REMOTE_VALIDATION_RULES: Record<string, RemoteValidationRule> = {
  enabled: { kind: "boolean" },
  provider: { kind: "provider" },
  tailscaleHost: { kind: "string" },
  tailscaleHosts: { kind: "hosts" },
  tailscaleUser: { kind: "string" },
  containerImage: { kind: "string" },
  serverType: { kind: "string" },
  location: { kind: "string" },
  snapshotId: { kind: "string" },
  sshKeyName: { kind: "string" },
  idleShutdownMinutes: { kind: "int", min: 0 },
  maxServerLifetimeMinutes: { kind: "int", min: 10 },
  maxConcurrent: { kind: "selectInt", min: 1, max: 8 },
  hangIdleMinutes: { kind: "int", min: 0 },
  fallbackToLocal: { kind: "boolean" },
  retryOtherHosts: { kind: "boolean" },
  engineerSelfCheckRemote: { kind: "boolean" },
  useForReleases: { kind: "boolean" },
  offloadBrowserSteps: { kind: "boolean" },
  browserCaptureMode: { kind: "string" },
  localFallback: { kind: "string" },
};

/** The `[remoteValidation]` keys an export file may carry. */
export const REMOTE_VALIDATION_KEYS = Object.keys(REMOTE_VALIDATION_RULES);

/**
 * Remote-validation keys with no Settings rows: the Hetzner provider details.
 * They are transferred by the Import/Export tab and edited in raw TOML.
 * SettingsView's buildBody skips them (the `budget.allowlist` precedent) so
 * an unrelated save never materialises their defaults into `repoos.toml`.
 */
export const TOML_ONLY_REMOTE_VALIDATION_KEYS: readonly string[] = [
  "remoteValidation.serverType",
  "remoteValidation.location",
  "remoteValidation.snapshotId",
  "remoteValidation.sshKeyName",
  "remoteValidation.idleShutdownMinutes",
  "remoteValidation.maxServerLifetimeMinutes",
];

/**
 * Pick the transferable remote-validation keys out of a loaded-config
 * `remoteValidation` object (or a parsed file's `[remoteValidation]` table).
 * Unknown keys are reported, wrong-typed values are dropped.
 */
export function sanitizeRemoteValidation(value: unknown): {
  config: RemoteValidationExport;
  unknownKeys: string[];
  droppedKeys: string[];
} {
  const unknownKeys: string[] = [];
  const droppedKeys: string[] = [];
  const config: RemoteValidationExport = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { config, unknownKeys, droppedKeys };
  }
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const rule = REMOTE_VALIDATION_RULES[key];
    if (!rule) {
      unknownKeys.push(key);
      continue;
    }
    switch (rule.kind) {
      case "boolean":
        if (typeof raw === "boolean") config[key] = raw;
        else droppedKeys.push(key);
        break;
      case "string": {
        const s = nonEmptyString(raw);
        // An empty/unset string means "not configured in the source" — leave
        // the target's value alone rather than 400ing the save.
        if (s !== null) config[key] = s;
        else if (raw !== undefined && raw !== null && raw !== "") droppedKeys.push(key);
        break;
      }
      case "provider":
        if (raw === "hetzner" || raw === "tailscale") config[key] = raw;
        else droppedKeys.push(key);
        break;
      case "selectInt":
      case "int": {
        const n =
          typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
        if (Number.isInteger(n) && n >= rule.min && (rule.kind === "int" || n <= rule.max)) {
          config[key] = n;
        } else {
          droppedKeys.push(key);
        }
        break;
      }
      case "hosts": {
        const list = normalizeHostList(raw);
        // An empty pool is a no-op on the server (it means "nothing to
        // change"), so only carry a non-empty list.
        if (list.length) config[key] = list;
        break;
      }
    }
  }
  return { config, unknownKeys, droppedKeys };
}

// ── Serialization ───────────────────────────────────────────────────────────

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlStringArray(values: string[]): string {
  return `[${values.map((v) => JSON.stringify(v)).join(", ")}]`;
}

function tomlInlineTable(entries: Record<string, string>): string {
  return `{ ${Object.entries(entries)
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ")} }`;
}

function tomlScalar(value: unknown): string {
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return tomlStringArray(value.map((v) => String(v)));
  return tomlString(String(value));
}

/**
 * Serialize the selected sections to a TOML settings-export file. Sections
 * whose data is `undefined` are omitted (not selected); sections present but
 * empty are written with a note so an import can distinguish "not exported"
 * from "exported empty" (the latter clears the target list).
 */
export function serializeSettingsExport(
  data: SettingsExportData,
  meta: { repo: string; exportedAt: string },
): string {
  const lines: string[] = [
    `# RepoOS settings export from "${meta.repo}" — ${meta.exportedAt}`,
    "# Import it via Settings → Import/Export. Only the sections selected",
    "# during export are present below.",
    "",
    "[meta]",
    `repo = ${tomlString(meta.repo)}`,
    `exportedAt = ${tomlString(meta.exportedAt)}`,
    `version = ${SETTINGS_EXPORT_VERSION}`,
    "",
  ];

  if (data.budgetAllowlist !== undefined) {
    if (!data.budgetAllowlist.length) {
      // A bare header with no rows: the parser reads it as "present but
      // empty" (distinct from the section being absent from the file).
      lines.push("# [budget.allowlist] — exported empty (no rows configured).");
      lines.push("[[budget.allowlist]]");
    }
    for (const row of data.budgetAllowlist) {
      lines.push("[[budget.allowlist]]");
      lines.push(`cli = ${tomlString(row.cli)}`);
      lines.push(`models = ${tomlStringArray(row.models)}`);
      if (row.paused) lines.push("paused = true");
      if (row.pausedUntil) lines.push(`pausedUntil = ${tomlString(row.pausedUntil)}`);
      if (row.pausedReason) lines.push(`pausedReason = ${tomlString(row.pausedReason)}`);
      if (row.pausedModels?.length) {
        const pauses = row.pausedModels.map((pause) => {
          const fields: Record<string, string> = { model: tomlString(pause.model) };
          if (pause.pausedUntil) fields.pausedUntil = tomlString(pause.pausedUntil);
          if (pause.pausedReason) fields.pausedReason = tomlString(pause.pausedReason);
          return tomlInlineTable(fields);
        });
        lines.push(`pausedModels = [${pauses.join(", ")}]`);
      }
    }
    lines.push("");
  }

  if (data.remoteValidation !== undefined) {
    const entries = Object.entries(data.remoteValidation);
    lines.push("[remoteValidation]");
    if (!entries.length) {
      lines.push("# exported empty (no remote-validation keys configured).");
    }
    for (const [key, value] of entries) {
      lines.push(`${key} = ${tomlScalar(value)}`);
    }
    lines.push("");
  }

  if (data.agentModelFavorites !== undefined) {
    if (!data.agentModelFavorites.length) {
      lines.push("# [agentModelFavorites] — exported empty (no favorites saved).");
      lines.push("[[agentModelFavorites]]");
    }
    for (const fav of data.agentModelFavorites) {
      lines.push("[[agentModelFavorites]]");
      lines.push(`cli = ${tomlString(fav.cli)}`);
      lines.push(`model = ${tomlString(fav.model)}`);
      if (fav.addedAt !== undefined) lines.push(`addedAt = ${fav.addedAt}`);
      if (fav.recentlyUsedAt !== undefined) lines.push(`recentlyUsedAt = ${fav.recentlyUsedAt}`);
    }
    lines.push("");
  }

  if (data.starredAgents !== undefined) {
    lines.push("[starredAgents]");
    if (!data.starredAgents.length) {
      lines.push("# exported empty (no starred agents).");
    } else {
      lines.push(`ids = ${tomlStringArray(data.starredAgents)}`);
    }
    lines.push("");
  }

  if (data.starredThemes !== undefined) {
    lines.push("[starredThemes]");
    if (!data.starredThemes.length) {
      lines.push("# exported empty (no starred themes).");
    } else {
      lines.push(`ids = ${tomlStringArray(data.starredThemes)}`);
    }
    lines.push("");
  }

  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  return `${lines.join("\n")}\n`;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/** Drop a trailing `# comment`, ignoring `#` inside quoted strings. */
function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (quote === '"' && ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquoteScalar(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(s);
      if (typeof decoded === "string") return decoded;
    } catch {
      /* not JSON-compatible: fall through */
    }
  }
  return s.replace(/^["']|["']$/g, "");
}

/** Split a `[...]` body on top-level commas (quote- and brace-aware). */
function splitArrayItems(body: string): string[] {
  const items: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      cur += ch;
      if (quote === '"' && ch === "\\" && i + 1 < body.length) {
        cur += body[i + 1];
        i++;
        continue;
      }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "{") {
      depth++;
      cur += ch;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
      cur += ch;
    } else if (ch === "," && depth === 0) {
      items.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

/** Parse one `{ key = value, … }` inline table (used by `pausedModels`). */
function parseInlineTable(raw: string): Record<string, unknown> | null {
  const s = raw.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return null;
  const out: Record<string, unknown> = {};
  for (const part of splitArrayItems(s.slice(1, -1))) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    out[key] = parseValue(part.slice(eq + 1));
  }
  return out;
}

function parseValue(raw: string): unknown {
  const s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    return splitArrayItems(s.slice(1, -1))
      .map((item) => {
        const trimmed = item.trim();
        if (trimmed.startsWith("{")) return parseInlineTable(trimmed) ?? trimmed;
        return unquoteScalar(trimmed);
      })
      .filter((item) => item !== "");
  }
  if (s.startsWith("{") && s.endsWith("}")) return parseInlineTable(s);
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s === "true" || s === "false") return s === "true";
  return unquoteScalar(s);
}

const KNOWN_TABLES = new Set(["meta", "remoteValidation", "starredAgents", "starredThemes"]);
const KNOWN_TABLE_ARRAYS = new Set(["budget.allowlist", "agentModelFavorites"]);

export interface ParsedSettingsExport {
  data: SettingsExportData;
  /** Sections the file actually contained (present headers, even when empty). */
  present: ExportSectionId[];
  warnings: string[];
}

export type ParseSettingsExportResult =
  | { ok: true; parsed: ParsedSettingsExport }
  | { ok: false; error: string };

/**
 * Parse a settings-export file. Unknown sections/keys become warnings, never
 * errors; a file with no recognizable export content is rejected so a stray
 * repoos.toml paste cannot silently "import nothing".
 */
export function parseSettingsExport(text: string): ParseSettingsExportResult {
  const data: SettingsExportData = {};
  const warnings: string[] = [];
  const seenTables = new Set<string>();
  const seenArrays = new Set<string>();
  const unknownSections: string[] = [];
  const flat: Record<string, unknown> = {};
  const tableRows: Record<string, Record<string, unknown>[]> = {};
  let section = "";
  let arrayTable: Record<string, unknown> | null = null;
  let arrayTableKey = "";

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const arrSec = line.match(/^\[\[([^\]]+)\]\]$/);
    if (arrSec) {
      section = "";
      arrayTableKey = arrSec[1].trim();
      if (KNOWN_TABLE_ARRAYS.has(arrayTableKey)) {
        seenArrays.add(arrayTableKey);
        arrayTable = {};
        (tableRows[arrayTableKey] ??= []).push(arrayTable);
      } else {
        arrayTable = null;
        if (!unknownSections.includes(arrayTableKey)) unknownSections.push(arrayTableKey);
      }
      continue;
    }
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1].trim();
      arrayTable = null;
      if (KNOWN_TABLES.has(section)) {
        seenTables.add(section);
      } else if (!unknownSections.includes(section)) {
        unknownSections.push(section);
      }
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const val = parseValue(kv[2]);
    if (arrayTable && arrayTableKey) {
      arrayTable[kv[1]] = val;
    } else if (section) {
      flat[`${section}.${kv[1]}`] = val;
    }
  }

  let version: unknown;
  if (seenTables.has("meta")) {
    version = flat["meta.version"];
    if (typeof version === "number" && version !== SETTINGS_EXPORT_VERSION) {
      warnings.push(
        `This file was exported by a newer RepoOS (version ${version}); unknown sections may be skipped.`,
      );
    }
  }

  const present: ExportSectionId[] = [];

  if (seenArrays.has("budget.allowlist")) {
    present.push("budgetAllowlist");
    // A bare header with no key lines parses as one empty row — that is the
    // serializer's "exported empty" marker, not a row, so drop it before
    // validation (a row with keys but no valid content still errors below).
    const rows = (tableRows["budget.allowlist"] ?? []).filter((r) => Object.keys(r).length > 0);
    const valid = sanitizeBudgetAllowlist(rows);
    if (rows.length && !valid.length) {
      return {
        ok: false,
        error: "The [budget.allowlist] section has no valid rows (each needs cli + models).",
      };
    }
    data.budgetAllowlist = valid;
  }

  if (seenTables.has("remoteValidation")) {
    present.push("remoteValidation");
    const table: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(flat)) {
      if (key.startsWith("remoteValidation.")) table[key.slice("remoteValidation.".length)] = val;
    }
    const { config, unknownKeys, droppedKeys } = sanitizeRemoteValidation(table);
    data.remoteValidation = config;
    for (const k of unknownKeys) warnings.push(`Ignoring unknown [remoteValidation] key "${k}".`);
    for (const k of droppedKeys) {
      warnings.push(`Skipping [remoteValidation] key "${k}" (wrong type for this setting).`);
    }
  }

  if (seenArrays.has("agentModelFavorites")) {
    present.push("agentModelFavorites");
    const rows = (tableRows["agentModelFavorites"] ?? []).filter((r) => Object.keys(r).length > 0);
    const valid = sanitizeAgentModelFavorites(rows);
    if (rows.length && !valid.length) {
      return {
        ok: false,
        error: "The [[agentModelFavorites]] section has no valid rows (each needs cli + model).",
      };
    }
    data.agentModelFavorites = valid;
  }

  if (seenTables.has("starredAgents")) {
    present.push("starredAgents");
    data.starredAgents = sanitizeIdList(flat["starredAgents.ids"]);
  }

  if (seenTables.has("starredThemes")) {
    present.push("starredThemes");
    data.starredThemes = sanitizeIdList(flat["starredThemes.ids"]);
  }

  for (const name of unknownSections) warnings.push(`Ignoring unrecognized section "[${name}]".`);

  if (!present.length) {
    return {
      ok: false,
      error:
        "No importable settings found — this doesn't look like a RepoOS settings export. " +
        "Export one from Settings → Import/Export on the source project.",
    };
  }

  return { ok: true, parsed: { data, present, warnings } };
}

// ── Import application ──────────────────────────────────────────────────────

/**
 * Build the PATCH /api/config body that applies the parsed file's server-side
 * settings (allowlist + remote validation). `maxConcurrent` goes over the
 * wire as a string (the schema declares it a select); everything else keeps
 * its parsed type. Values that would fail server validation are skipped with
 * a warning rather than failing the whole save.
 */
export function buildImportPatch(data: SettingsExportData): {
  patch: Record<string, unknown>;
  warnings: string[];
} {
  const patch: Record<string, unknown> = {};
  const warnings: string[] = [];

  if (data.budgetAllowlist !== undefined) {
    const rows = sanitizeBudgetAllowlist(data.budgetAllowlist);
    patch["budget.allowlist"] = rows;
  }

  if (data.remoteValidation !== undefined) {
    const { config, unknownKeys, droppedKeys } = sanitizeRemoteValidation(data.remoteValidation);
    for (const [key, value] of Object.entries(config)) {
      // `maxConcurrent` is a select over the wire (like the Settings form sends
      // it); everything else keeps its parsed type.
      patch[`remoteValidation.${key}`] = key === "maxConcurrent" ? String(value) : value;
    }
    for (const k of unknownKeys) warnings.push(`Ignoring unknown [remoteValidation] key "${k}".`);
    for (const k of droppedKeys) {
      warnings.push(`Skipping [remoteValidation] key "${k}" (wrong type for this setting).`);
    }
  }

  return { patch, warnings };
}

/** Human-readable per-section summary for the import review step. */
export function summarizeSettingsExport(
  data: SettingsExportData,
  present: ExportSectionId[],
): { id: ExportSectionId; label: string; detail: string }[] {
  const labelOf = (id: ExportSectionId): string =>
    EXPORT_SECTIONS.find((s) => s.id === id)?.label ?? id;
  return present.map((id) => {
    switch (id) {
      case "budgetAllowlist": {
        const n = data.budgetAllowlist?.length ?? 0;
        return {
          id,
          label: labelOf(id),
          detail: n ? `${n} row${n === 1 ? "" : "s"}` : "empty — clears the allowlist",
        };
      }
      case "agentModelFavorites": {
        const n = data.agentModelFavorites?.length ?? 0;
        return {
          id,
          label: labelOf(id),
          detail: n ? `${n} favorite${n === 1 ? "" : "s"}` : "empty — clears favorites",
        };
      }
      case "starredAgents": {
        const n = data.starredAgents?.length ?? 0;
        return {
          id,
          label: labelOf(id),
          detail: n ? `${n} starred agent${n === 1 ? "" : "s"}` : "empty — clears starred agents",
        };
      }
      case "starredThemes": {
        const n = data.starredThemes?.length ?? 0;
        return {
          id,
          label: labelOf(id),
          detail: n ? `${n} starred theme${n === 1 ? "" : "s"}` : "empty — clears starred themes",
        };
      }
      case "remoteValidation": {
        const entries = Object.entries(data.remoteValidation ?? {});
        const hosts = Array.isArray(data.remoteValidation?.tailscaleHosts)
          ? (data.remoteValidation?.tailscaleHosts as unknown[]).length
          : 0;
        return {
          id,
          label: labelOf(id),
          detail: entries.length
            ? `${entries.length} key${entries.length === 1 ? "" : "s"}${hosts ? `, ${hosts} host${hosts === 1 ? "" : "s"}` : ""}`
            : "no keys — nothing to apply",
        };
      }
    }
  });
}

/**
 * `repoos_<repo>_export_<timestamp>.toml`, with the repo name sanitized for
 * every filesystem and the timestamp in compact UTC (`20261014-080000`).
 * The browser downloads it to the user's default Downloads folder on its own —
 * an `<a download>` click never picks a location.
 */
export function exportFilename(repoName: string, now: Date = new Date()): string {
  const repo =
    (repoName || "")
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "repo";
  const p = (n: number): string => String(n).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-` +
    `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  return `repoos_${repo}_export_${stamp}.toml`;
}
