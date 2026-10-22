import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  AGENT_CLIS,
  AGENT_MODELS,
  DEFAULT_AGENTS,
  agentsForConfig,
  applyReloadedConfig,
  getConfigSchema,
  patchTomlConfig,
  loadConfig,
  parseDevTargets,
  parseFlatToml,
  sanitizeBuiltInAgents,
  saveBuiltInAgentsConfig,
  resolveColumnLabels,
} from "../../core/config.js";
import { effectiveAreaVocabulary } from "../../core/areas.js";
import { hasConfiguredProjectEnvironmentSecrets } from "../../core/project-environments.js";
import { effectiveAreaNames, unresolvedAreaReport } from "../../core/areas.js";
import { normalizeStringList } from "../../core/config.js";
import {
  DEV_TARGET_PASSTHROUGH_FIELDS,
  devTargetServiceErrors,
  redactDevEnv,
} from "../../core/dev-targets.js";
import { normalizeAllowlistRows } from "../../core/budget-allowlist.js";
import {
  MAX_ROUTING_TIMEOUT_MS,
  MIN_ROUTING_TIMEOUT_MS,
  ROUTING_ROLES,
} from "../../core/model-routing/config.js";
import { configuredCtoActions, isCtoSafeActionId } from "../../core/cto-actions.js";
import { describeStorage } from "../../core/storage/index.js";
import type { RepoOSConfig } from "../../core/types.js";
import type { Logger } from "../../core/logger.js";
import { resolveRemoteHosts } from "../../core/remote-hosts.js";
import { formatTomlError, validateToml } from "../../core/toml-validate.js";
import { stripTomlComment, tomlContinuationLines } from "../../core/toml-line.js";
import { readTunnelConfig, writeTunnelConfig } from "../../core/tunnel.js";
import { listSkills } from "./helpers.js";
import {
  configTomlMutationPath,
  configTomlReadPath,
  loadConfigAfterServerWrite,
} from "../preview-config-isolation.js";

/**
 * Config as the browser may see it: `whisper.apiKey` is stripped entirely and
 * the whisper state is exposed through the flat schema keys
 * (`whisper.provider`) plus a `whisperEnabled` boolean. The secret never
 * crosses the HTTP boundary. Auth secrets (sessionSecret, emailProvider.apiKey,
 * google.clientSecret) are also stripped.
 */
/** Exported for tests: the credential-free browser config contract. */
export function safeConfigForBrowser(config: Record<string, unknown>): Record<string, unknown> {
  const whisper = (config.whisper ?? { provider: "none", apiKey: "" }) as {
    provider?: string;
    apiKey?: string;
  };
  const whisperEnabled = whisper.provider !== "none" && !!whisper.apiKey;
  const {
    whisper: _ignoredWhisper,
    theme: _ignoredTheme,
    uiTheme: _ignoredUiTheme,
    areas: _rawAreas,
    budget: _rawBudget,
    modelRouting: _rawModelRouting,
    ...rest
  } = config;
  // The declared area vocabulary (#0583) is exposed to the browser as plain
  // names (the Settings form edits names; descriptions stay TOML-only) plus a
  // computed `areaVocabulary` that merges the preview targets in.
  const declaredNames = Array.isArray(config.areas)
    ? config.areas
        .map((a) => (typeof a === "string" ? a : (a as { name?: unknown }).name))
        .filter((n): n is string => typeof n === "string" && !!n.trim())
    : [];
  // Strip auth secrets
  const authRaw = rest.auth as Record<string, unknown> | undefined;
  let safeAuth: Record<string, unknown> | undefined;
  if (authRaw && typeof authRaw === "object") {
    safeAuth = { ...authRaw };
    delete safeAuth.sessionSecret;
    if (safeAuth.emailProvider && typeof safeAuth.emailProvider === "object") {
      safeAuth.emailProvider = {
        ...(safeAuth.emailProvider as Record<string, unknown>),
        apiKey: "***",
      };
    }
    if (safeAuth.google && typeof safeAuth.google === "object") {
      safeAuth.google = {
        ...(safeAuth.google as Record<string, unknown>),
        clientSecret: "***",
      };
    }
  }
  // Env values (dev targets and services) may be credentials: they never reach
  // the browser. Settings saves restore them from disk (#0843 review round 25).
  const safeDev = rest.dev ? redactDevEnv(rest.dev as never) : rest.dev;
  return {
    ...rest,
    ...(safeDev !== undefined ? { dev: safeDev } : {}),
    auth: safeAuth,
    "whisper.provider": whisper.provider ?? "none",
    whisperEnabled,
    areas: declaredNames,
    /**
     * Agent-driver budget allowlist (#0764). Exposed flat under its schema key
     * so the Budget Controls tab round-trips exactly what the parser accepted.
     */
    "budget.allowlist": (_rawBudget as { allowlist?: unknown } | undefined)?.allowlist ?? [],
    "model_routing.mode": (_rawModelRouting as { mode?: string } | undefined)?.mode,
    "model_routing.provider": (_rawModelRouting as { provider?: string } | undefined)?.provider,
    "model_routing.model": (_rawModelRouting as { model?: string } | undefined)?.model,
    "model_routing.baseUrl": (_rawModelRouting as { baseUrl?: string } | undefined)?.baseUrl,
    "model_routing.roles": (_rawModelRouting as { roles?: unknown } | undefined)?.roles,
    "model_routing.timeoutMs": (_rawModelRouting as { timeoutMs?: number } | undefined)?.timeoutMs,
    "model_routing.humanStepCheck": (_rawModelRouting as { humanStepCheck?: boolean } | undefined)
      ?.humanStepCheck,
    /**
     * Declared dev targets (#0749): the Settings control edits this
     * `[[dev.targets]]` list. Exposed as the parsed objects (never the raw
     * TOML) so the form round-trips exactly what the parser accepted, plus the
     * loud validation errors `loadConfig` recorded for rows it had to drop —
     * the form shows them inline rather than silently losing a target.
     */
    devTargets: (safeDev as { targets?: unknown } | undefined)?.targets ?? [],
    devTargetErrors: config.devTargetErrors ?? [],
    board: {
      ...((rest as Record<string, unknown>).board as Record<string, unknown> | undefined),
      columns: resolveColumnLabels(rest.boardColumns as Record<string, string> | undefined),
    },
    /**
     * The effective area vocabulary (#0583): `[areas]` declarations merged
     * with every `[[preview.targets]].areas` value. Consumed by the task
     * drawer's and New task's area multi-select. Computed here rather than
     * storing the merged list, so editing either source updates it live.
     */
    areaVocabulary: effectiveAreaVocabulary(config as Pick<RepoOSConfig, "areas" | "preview">),
  };
}

/**
 * Advisory drift log (#0583/#0587): when a config reload changes the effective
 * area vocabulary, log the tasks whose areas no longer resolve. Warning only —
 * free text is always allowed, this is cleanup guidance, not a hard error.
 *
 * Called from BOTH config write paths: the curated Settings PATCH and the raw
 * `repoos.toml` PUT (the escape-hatch editor, which is a direct file edit). A
 * before/after name comparison is what gates it, so an unrelated save that
 * leaves the vocabulary alone stays quiet.
 */
function logAreaVocabularyDrift(
  repoos: { config: RepoOSConfig },
  index: { getTasks?: () => readonly { id: string; area?: string; areas?: string[] }[] },
  logger: Pick<Logger, "system">,
  before: readonly string[],
): void {
  const after = effectiveAreaNames(repoos.config);
  if (sameNames(before, after)) return;
  if (typeof index.getTasks !== "function") return;
  for (const u of unresolvedAreaReport(index.getTasks(), after)) {
    logger.system(
      "warn",
      `area "${u.area}" no longer resolves to the declared vocabulary (#0583)`,
      {
        tasks: u.taskIds.join(", "),
      },
    );
  }
}

/** Case-insensitive, order-insensitive equality for two name lists. */
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a.map((s) => s.trim().toLowerCase()));
  return b.every((s) => left.has(s.trim().toLowerCase()));
}

/**
 * Adopt a freshly loaded config in place. `Object.assign` alone cannot REMOVE a
 * key, and BOTH vocabulary sources can vanish: clearing the declared list
 * re-parses to `undefined` (`parseAreasConfig` returns undefined for zero usable
 * rows) and deleting `[preview]` entirely omits `cfg.preview`. Left stale, the
 * old key survives every write until a restart — serving the picker/PM prompt
 * areas the file no longer declares, and (for the drift advisory) comparing a
 * stale list to itself so clearing NEVER warns. Reconcile the removable
 * vocabulary keys explicitly (#0587 review). Delegates to the shared
 * `applyReloadedConfig` (#0681) so the Settings path and the on-disk
 * `repoos.toml` watcher reconcile identically.
 */
function applyLoadedConfig(repoos: { config: RepoOSConfig }, fresh: RepoOSConfig): void {
  applyReloadedConfig(repoos, fresh);
}

export const readConfig: RouteHandler = (ctx, _req, res) => {
  const { repoos } = ctx;
  const agents = agentsForConfig(repoos.config);
  const safeConfig = safeConfigForBrowser({ ...repoos.config, agents });
  return json(res, 200, {
    config: {
      ...safeConfig,
      projectSecretsEnabled: hasConfiguredProjectEnvironmentSecrets(repoos.config.root),
    },
    schema: getConfigSchema(),
    /**
     * Attachment-storage status (#0659). The UI must never guess whether the
     * configured provider is actually in effect: `describeStorage` reports the
     * configured id, the effective id (local when the choice is unavailable),
     * and a human-readable reason, using the same registry fallback a real
     * upload takes.
     */
    storageStatus: describeStorage(
      repoos.config.storage?.provider,
      join(repoos.config.root, repoos.config.workDir),
    ),
    agentsMeta: {
      clis: AGENT_CLIS,
      models: AGENT_MODELS,
      defaults: DEFAULT_AGENTS,
      skills: listSkills(repoos.config),
    },
  });
};

export const patchConfig: RouteHandler = async (ctx, req, res) => {
  const { config, repoos, index } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  // Host-pool [[…]] rows to rewrite alongside a flat `tailscaleHosts` patch
  // (#0521) — written with a second, table-array patch of the same key.
  let patchRows: Record<string, unknown>[] | undefined;
  /** Set when a pool edit removed every row host: the blocks get deleted. */
  let dropRows = false;

  if (body.agents !== undefined) {
    if (!Array.isArray(body.agents)) {
      return json(res, 400, { error: "agents must be an array" });
    }
    const list: {
      name: string;
      cli: string;
      model: string;
      enabled: boolean;
      instructions?: string;
      skills?: string[];
    }[] = [];
    for (const agent of body.agents) {
      const a = agent as Record<string, unknown>;
      if (typeof a?.name !== "string" || !a.name.trim()) {
        return json(res, 400, { error: "each agent needs a non-empty name" });
      }
      const preservesLegacyGemini =
        a.cli === "gemini" &&
        (repoos.config.agents ?? []).some(
          (existing) =>
            existing.name.toLowerCase() === String(a.name).trim().toLowerCase() &&
            existing.cli === "gemini",
        );
      if (!AGENT_CLIS.includes(a.cli as (typeof AGENT_CLIS)[number]) && !preservesLegacyGemini) {
        return json(res, 400, { error: `cli must be one of: ${AGENT_CLIS.join(", ")}` });
      }
      if (typeof a.model !== "string" || !a.model.trim()) {
        return json(res, 400, {
          error: `agent "${a.name}" model must be a non-empty string`,
        });
      }
      if (typeof a.enabled !== "boolean") {
        return json(res, 400, { error: `agent "${a.name}" enabled must be true or false` });
      }
      if (a.instructions !== undefined && typeof a.instructions !== "string") {
        return json(res, 400, { error: `agent "${a.name}" instructions must be a string` });
      }
      if (
        a.skills !== undefined &&
        (!Array.isArray(a.skills) || a.skills.some((skill) => typeof skill !== "string"))
      ) {
        return json(res, 400, { error: `agent "${a.name}" skills must be an array of strings` });
      }
      const entry: {
        name: string;
        cli: string;
        model: string;
        enabled: boolean;
        instructions?: string;
        skills?: string[];
      } = {
        name: a.name.trim(),
        cli: a.cli as string,
        model: a.model as string,
        enabled: a.enabled,
      };
      if (typeof a.instructions === "string" && a.instructions.trim()) {
        entry.instructions = a.instructions.trim();
      }
      if (Array.isArray(a.skills)) {
        entry.skills = [...new Set(a.skills.map((skill) => skill.trim()).filter(Boolean))];
      }
      list.push(entry);
    }
    patch.agents = list;
  }

  // builtInAgents toggles (e.g. enabling the Debugger or Tech Debt Agent) are
  // persisted to the sidecar, NOT repoos.toml — mirroring how built-in agent
  // state is stored and read (see config.ts:saveBuiltInAgentsConfig).
  let builtInAgentsChanged = false;
  /**
   * Set when an `areas` PATCH hit the #0583 no-op guard: the submitted list
   * already says what's on disk, so nothing is written — but a solo no-op
   * save should still answer 200 ("handled, nothing to change"), not the
   * generic 400 that an empty patch would otherwise produce.
   */
  let areasUnchanged = false;
  // Set when an `areas` PATCH clears a vocabulary declared as `[[areas]]` rows.
  let dropAreaRows = false;
  /** Set when a dev-targets PATCH clears the last target row. */
  let dropDevTargetRows = false;
  /**
   * Set when a `devTargets` PATCH already matches what's on disk: nothing to
   * write, but a solo no-op save still answers 200 ("handled, nothing to
   * change"), mirroring the `areas` no-op guard.
   */
  let devTargetsUnchanged = false;
  /** Set when a budget-allowlist PATCH already matches what's on disk. */
  let budgetAllowlistUnchanged = false;
  /** Set when a budget-allowlist PATCH clears the last `[[budget.allowlist]]` row. */
  let dropBudgetAllowlistRows = false;
  if (body.builtInAgents !== undefined) {
    if (
      typeof body.builtInAgents !== "object" ||
      body.builtInAgents === null ||
      Array.isArray(body.builtInAgents)
    ) {
      return json(res, 400, { error: "builtInAgents must be an object" });
    }
    const state = sanitizeBuiltInAgents(body.builtInAgents);
    const base = repoos.config.builtInAgents ?? {};
    const merged = { ...base, ...state };
    saveBuiltInAgentsConfig(config.root, merged, config.cacheDir);
    repoos.config.builtInAgents = merged;
    builtInAgentsChanged = true;
  }

  // Dev targets (#0749) — the Settings control edits the `[[dev.targets]]`
  // list. The submitted rows are re-parsed through the SAME `parseDevTargets`
  // the loader uses, so validation is never duplicated here: a bad row gets the
  // exact message the config parser would give, and an unchanged list is a
  // no-op that never churns repoos.toml on an unrelated save.
  if (body.devTargets !== undefined) {
    if (!Array.isArray(body.devTargets)) {
      return json(res, 400, {
        error: "devTargets must be an array of targets",
        errors: ["devTargets must be an array of targets"],
      });
    }
    // Rebuild each submitted row into the shape `parseDevTargets` understands:
    // the health check is flattened to its dotted keys (the flat TOML parser's
    // own form) so validation and serialization share one representation.
    const onDiskTargets = loadConfig(config.root).dev?.targets ?? [];
    const rawRows = (body.devTargets as unknown[]).map((entry) => {
      const r = (entry ?? {}) as Record<string, unknown>;
      const row: Record<string, unknown> = {
        name: r.name,
        kind: r.kind,
        command: r.command,
        url: r.url,
        artifactPath: r.artifactPath,
        label: r.label,
      };
      // #0843 review rounds 24-25: fields the Settings form does not edit
      // (`cwd`, `env`: TOML-only; env may hold credentials) are NEVER accepted
      // from or sent to the browser. A save restores them from the on-disk row
      // the browser says it started from (`sourceName`, so a rename keeps
      // them), falling back to the same name for older clients.
      const sourceName =
        typeof r.sourceName === "string" && r.sourceName.trim()
          ? r.sourceName.trim()
          : typeof r.name === "string"
            ? r.name.trim()
            : "";
      const source = onDiskTargets.find((t) => t.name === sourceName);
      for (const field of DEV_TARGET_PASSTHROUGH_FIELDS) {
        if (source?.[field] !== undefined) row[field] = source[field];
      }
      if (typeof r.autoPort === "boolean") row.autoPort = r.autoPort;
      if (r.port !== undefined && r.port !== "") row.port = r.port;
      // #0843: the companion-service name list round-trips like any other
      // field; rows are validated against the declared [[dev.services]] after
      // the shape pass below.
      const rowServices = normalizeStringList(r.services);
      if (rowServices.length) row.services = rowServices;
      if (typeof r.healthCheckUrl === "string" && r.healthCheckUrl.trim()) {
        row["healthCheck.url"] = r.healthCheckUrl.trim();
      }
      if (typeof r.healthCheckFile === "string" && r.healthCheckFile.trim()) {
        row["healthCheck.file"] = r.healthCheckFile.trim();
      }
      return row;
    });
    const parsed = parseDevTargets({ "dev.targets": rawRows });
    if (!parsed.errors.length) {
      // #0843: a target naming a service no [[dev.services]] block defines —
      // or listing one twice — is rejected here with the loader's exact
      // message, so the server stays the authority and the UI cannot drift.
      const declared = loadConfig(config.root).dev?.services;
      parsed.errors.push(...devTargetServiceErrors(parsed.targets, declared));
    }
    if (parsed.errors.length) {
      // Inline validation lives in the client too; the server stays the
      // authority and echoes the parser's messages so the two can't drift.
      return json(res, 400, { error: parsed.errors[0], errors: parsed.errors });
    }
    // Serialize the validated targets back to `[[dev.targets]]` rows. The
    // health check is re-flattened so `serializeTomlVal` (which has no
    // inline-table support) emits plain `healthCheck.url = "…"` lines the
    // parser reads back correctly.
    const rows = parsed.targets.map((t) => {
      const row: Record<string, unknown> = { name: t.name, kind: t.kind, command: t.command };
      if (t.url) row.url = t.url;
      if (t.artifactPath) row.artifactPath = t.artifactPath;
      if (t.label) row.label = t.label;
      for (const field of DEV_TARGET_PASSTHROUGH_FIELDS) {
        if (t[field] !== undefined) row[field] = t[field];
      }
      // #0843: write the companion-service name list when set, so an edited
      // target keeps its services and one without them gains no line.
      if (t.services?.length) row.services = t.services;
      // #0802: write the auto-pick opt-OUT only (the default is on), so a row
      // that never touched the setting gains no line. `port` is written
      // whenever set — it is the preferred port even while auto-pick is on.
      if (t.autoPort === false) row.autoPort = false;
      if (t.port !== undefined) row.port = t.port;
      if (t.healthCheck?.url) row["healthCheck.url"] = t.healthCheck.url;
      if (t.healthCheck?.file) row["healthCheck.file"] = t.healthCheck.file;
      return row;
    });
    // No-op guard (mirrors `areas`): the Settings form repeats its current list
    // on every save, so a list that already matches disk must not rewrite the
    // file. Compare the normalized name/kind/command/url/artifactPath/label/
    // health fields, order included (order is meaningful — the form can reorder).
    const onDisk = onDiskTargets;
    const norm = (t: (typeof onDisk)[number]) => ({
      cwd: t.cwd ?? "",
      env: JSON.stringify(Object.entries(t.env ?? {}).sort(([a], [b]) => a.localeCompare(b))),
      name: t.name,
      kind: t.kind,
      command: t.command,
      url: t.url ?? "",
      artifactPath: t.artifactPath ?? "",
      label: t.label ?? "",
      services: (t.services ?? []).join(","),
      autoPort: t.autoPort !== false,
      port: t.port ?? 0,
      hcUrl: t.healthCheck?.url ?? "",
      hcFile: t.healthCheck?.file ?? "",
    });
    const unchanged =
      onDisk.length === parsed.targets.length &&
      onDisk.every((t, i) => JSON.stringify(norm(t)) === JSON.stringify(norm(parsed.targets[i]!)));
    if (!unchanged) {
      if (rows.length === 0) {
        // Clearing every target: `patchTomlConfig` only strips `[[dev.targets]]`
        // blocks for a NON-empty row list, so drop them explicitly — an empty
        // array would serialize as a bogus key line.
        dropDevTargetRows = true;
      } else {
        patch["dev.targets"] = rows;
      }
    } else {
      devTargetsUnchanged = true;
    }
  }

  // Agent-driver budget allowlist (#0764) — the Agents page's Budget Controls
  // tab edits the `[[budget.allowlist]]` list. Rows are normalized through the
  // same helper `loadConfig` uses, so validation and serialization can't drift;
  // an unchanged list is a no-op that never churns repoos.toml.
  if (body["budget.allowlist"] !== undefined) {
    const parsed = normalizeAllowlistRows(body["budget.allowlist"]);
    if ("error" in parsed) {
      return json(res, 400, { error: parsed.error });
    }
    const onDisk = loadConfig(config.root).budget?.allowlist ?? [];
    const unchanged = JSON.stringify(onDisk) === JSON.stringify(parsed.rows);
    if (unchanged) {
      budgetAllowlistUnchanged = true;
    } else if (parsed.rows.length === 0) {
      // Clearing every row: `patchTomlConfig` only strips `[[…]]` blocks for a
      // non-empty row list, so drop them explicitly.
      dropBudgetAllowlistRows = true;
    } else {
      patch["budget.allowlist"] = parsed.rows;
    }
  }

  // Auth config patching — handle auth-specific fields that live in [auth]
  // section of repoos.toml. Secrets (sessionSecret, emailProvider.apiKey,
  // google.clientSecret) are never written to repoos.toml — that file is
  // git-tracked. They're rejected here even if a client sends them, and must
  // be set via REPOOS_RESEND_API_KEY / REPOOS_GOOGLE_CLIENT_SECRET in .env
  // instead (see docs/native-auth.md and the tracked .env.example).
  if (
    body["auth.emailProvider.apiKey"] !== undefined ||
    body["auth.google.clientSecret"] !== undefined
  ) {
    return json(res, 400, {
      error:
        "auth.emailProvider.apiKey and auth.google.clientSecret can't be set here — repoos.toml is git-tracked. " +
        "Set REPOOS_RESEND_API_KEY / REPOOS_GOOGLE_CLIENT_SECRET in .env instead (see .env.example).",
    });
  }

  let authEnabledChanged = false;
  if (body["auth.enabled"] !== undefined) {
    const val = body["auth.enabled"];
    if (typeof val !== "boolean") {
      return json(res, 400, { error: "auth.enabled must be true or false" });
    }
    patch["auth.enabled"] = val;
    authEnabledChanged = true;
  }
  if (body["auth.sessionMaxAge"] !== undefined) {
    const val = body["auth.sessionMaxAge"];
    if (typeof val === "string" || typeof val === "number") {
      const num = Number(val);
      if (Number.isInteger(num) && num > 0) {
        // Accept values in days (<300) or seconds (>=300). Assume values <300 are days.
        const ageInSeconds = num < 300 ? num * 86400 : num;
        if (ageInSeconds >= 300) {
          patch["auth.sessionMaxAge"] = ageInSeconds;
        }
      }
    }
  }
  if (body["auth.emailProvider.type"] !== undefined) {
    patch["auth.emailProvider.type"] = "resend";
  }
  if (body["auth.emailProvider.fromAddress"] !== undefined) {
    const val =
      typeof body["auth.emailProvider.fromAddress"] === "string"
        ? body["auth.emailProvider.fromAddress"].trim()
        : "";
    if (val) patch["auth.emailProvider.fromAddress"] = val;
  }
  if (body["auth.google.clientId"] !== undefined) {
    const val =
      typeof body["auth.google.clientId"] === "string" ? body["auth.google.clientId"].trim() : "";
    if (val) patch["auth.google.clientId"] = val;
  }

  // Guard: enabling auth requires a login provider to be configured. Secrets
  // only ever come from config (env-var-sourced), never from the request body
  // — see the rejection above.
  //
  // Validate against the config as it exists on disk RIGHT NOW (a fresh
  // loadConfig re-reads repoos.toml + .env), not the in-memory `repoos.config`:
  // that copy is only refreshed at the END of this handler, so a server that
  // booted before the provider was set (empty `auth` block) would otherwise
  // reject every attempt to turn auth on from Settings — permanently, until a
  // restart. `patch` values are honored too, since fromAddress / clientId can
  // arrive in this same save (written just below).
  const enablingAuth = patch["auth.enabled"] === true;
  if (enablingAuth) {
    const onDisk = loadConfig(config.root);
    const fromAddress =
      patch["auth.emailProvider.fromAddress"] ?? onDisk.auth?.emailProvider?.fromAddress;
    const clientId = patch["auth.google.clientId"] ?? onDisk.auth?.google?.clientId;
    const hasEmailProvider = !!(
      (onDisk.auth?.emailProvider?.apiKey || process.env.REPOOS_RESEND_API_KEY) &&
      fromAddress
    );
    const hasGoogle = !!(clientId && onDisk.auth?.google?.clientSecret);
    if (!hasEmailProvider && !hasGoogle) {
      return json(res, 400, {
        error:
          "Cannot enable auth: configure at least one login provider (email OTP or Google OAuth) first",
      });
    }
  }

  const schema = getConfigSchema();
  for (const field of schema) {
    if (body[field.key] === undefined) continue;
    // `dev.targets` is a structured list handled by the dedicated `devTargets`
    // branch above (#0749); its schema entry is search/focus metadata only, so
    // the generic array branch must not treat it as a comma-joined string list.
    if (field.key === "dev.targets") continue;
    // The budget allowlist has its own dedicated branch above (#0764); its
    // schema entry is search/focus metadata only.
    if (field.key === "budget.allowlist") continue;
    const val = body[field.key];

    if (field.type === "string") {
      if (field.key === "dev.inspector.editorCommand" || field.key === "editor.command") {
        patch[field.key] = typeof val === "string" ? val.trim() : "";
        continue;
      }
      if (field.key === "model_routing.baseUrl") {
        // Retained but not rendered (#0809): only change it when the body
        // actually carries a value, so an unrelated Settings save can't clear it.
        if (typeof val === "string") patch[field.key] = val.trim();
        continue;
      }
      if (field.key === "whisper.apiKey") {
        // The form always carries this field (default ""). An empty value means
        // "leave the existing key untouched" — never wipe a TOML/env key, and
        // never reject an unrelated settings save over it.
        const trimmed = typeof val === "string" ? val.trim() : "";
        if (trimmed) patch[field.key] = trimmed;
        continue;
      }
      if (field.key === "remoteValidation.tailscaleHost") {
        // Optional by design (a pool-only config sets no shorthand, and most
        // repos set none at all): empty means "leave it as-is", so one empty
        // field can't reject an entire Settings save with a 400.
        const trimmed = typeof val === "string" ? val.trim() : "";
        if (trimmed) patch[field.key] = trimmed;
        continue;
      }
      if (typeof val !== "string" || (!val.toString().trim() && field.key !== "ntfyTopic")) {
        return json(res, 400, { error: `${field.label} must be a non-empty string` });
      }
      patch[field.key] = val.toString().trim();
    } else if (field.type === "boolean") {
      if (typeof val !== "boolean") {
        return json(res, 400, { error: `${field.label} must be true or false` });
      }
      patch[field.key] = val;
    } else if (field.type === "number") {
      const num = Number(val);
      const min = field.min ?? 0;
      // If step is defined and not an integer (e.g., 0.1), decimals are allowed.
      // Otherwise, only whole numbers are allowed.
      const allowDecimals = field.step !== undefined && !Number.isInteger(field.step);
      const isValidNumber = allowDecimals ? Number.isFinite(num) : Number.isInteger(num);

      if (!isValidNumber || num < min) {
        const msg = allowDecimals
          ? `${field.label} must be a number ${min > 0 ? `greater than ${min}` : `at least ${min}`}`
          : `${field.label} must be a whole number`;
        return json(res, 400, { error: msg });
      }
      if (field.key === "model_routing.timeoutMs") {
        if (num < MIN_ROUTING_TIMEOUT_MS || num > MAX_ROUTING_TIMEOUT_MS) {
          return json(res, 400, {
            error: `${field.label} must be between ${MIN_ROUTING_TIMEOUT_MS} and ${MAX_ROUTING_TIMEOUT_MS}`,
          });
        }
      }
      patch[field.key] = num;
    } else if (field.type === "select") {
      // Numeric budget selects accept ANY whole non-negative number, not just
      // the preset option labels — a hand-written repoos.toml value (e.g.
      // `closeOut.timeoutMs = 450000`) must survive an unrelated Settings
      // save instead of failing it with "must be one of: …".
      if (field.key === "closeOut.timeoutMs") {
        const num = Number(val);
        if (!Number.isInteger(num) || num < 0) {
          return json(res, 400, {
            error: `${field.label} must be 0 (disabled) or a whole number of milliseconds`,
          });
        }
        patch[field.key] = num;
        continue;
      }
      const valid = field.options?.map((o) => o.value) ?? [];
      if (!valid.includes(val as string)) {
        return json(res, 400, {
          error: `${field.label} must be one of: ${valid.join(", ")}`,
        });
      }
      // Native/select components submit strings. These settings are numbers
      // in the runtime config, so persist them as TOML numeric syntax rather
      // than `maxActiveTasks = "5"`, which loadConfig intentionally rejects.
      patch[field.key] =
        field.key === "maxActiveTasks" ||
        field.key === "maxConcurrentAgents" ||
        field.key === "remoteValidation.maxConcurrent" ||
        field.key === "worktreeWarnThreshold"
          ? Number(val)
          : val;
    } else if (field.type === "array") {
      // The area vocabulary (#0583) tolerates an EMPTY list: clearing it is the
      // deliberate "free text only" state, not a validation failure. Entries
      // still must be non-empty strings when present.
      if (field.key === "areas") {
        if (!Array.isArray(val)) {
          return json(res, 400, { error: `${field.label} must be an array of names` });
        }
        if (val.some((item) => typeof item !== "string" || !item.trim())) {
          return json(res, 400, { error: `${field.label} entries must be non-empty strings` });
        }
        // The Settings form edits names only. Carry a previously-declared
        // area's description forward untouched so a rename-free save never
        // erases hand-written documentation in repoos.toml rows.
        const descriptions = new Map(
          (repoos.config.areas ?? []).map((a) => [a.name.toLowerCase(), a.description] as const),
        );
        const rows = (val as string[]).map((s) => {
          const name = s.trim();
          const description = descriptions.get(name.toLowerCase());
          return description ? { name, description } : { name };
        });
        // NO-OP guard (#0583 review round 1): `areas` is a visible schema
        // field, so EVERY unrelated Settings save repeats its current value
        // back. Writing it when the on-disk list already says the same thing
        // would churn repoos.toml on unrelated saves — read the file's actual
        // state and short-circuit, like the tailscale pool branch below.
        const onDisk = loadConfig(config.root).areas ?? [];
        const unchanged =
          onDisk.length === rows.length &&
          rows.every((r, i) => onDisk[i]!.name.toLowerCase() === r.name.toLowerCase());
        if (unchanged) {
          areasUnchanged = true;
          continue;
        }
        if (rows.length === 0) {
          // Clearing the vocabulary (#0583 review round 3). `patchTomlConfig`
          // only strips `[[areas]]` blocks for a NON-empty row list, so an
          // empty `patch.areas` would insert a root `areas = []` ahead of the
          // still-present blocks (duplicate key; the rows survive). Drop the
          // blocks explicitly, like the tailscale pool, and only write a flat
          // `areas = []` when a flat line is what is being cleared.
          dropAreaRows = true;
          if (/^areas\s*=/m.test(readRawToml(config.root))) patch[field.key] = rows;
          continue;
        }
        patch[field.key] = rows;
        continue;
      }
      if (
        field.key === "remoteValidation.tailscaleHosts" &&
        (Array.isArray(val) || typeof val === "string")
      ) {
        // The host pool (#0521) round-trips through the Settings form as host
        // names (a comma-separated string is tolerated for hand callers). An
        // empty list means "nothing to change" (the file may still carry the
        // tailscaleHost shorthand or [[…]] rows), and a list that matches what
        // config already resolves to is a no-op — never materialise the folded
        // shorthand into a written key.
        const list = (Array.isArray(val) ? val : String(val).split(",")).map((s) =>
          typeof s === "string" ? s.trim() : "",
        );
        if (list.some((s) => !s)) {
          return json(res, 400, { error: `${field.label} entries must be non-empty strings` });
        }
        if (list.length === 0) continue;
        const hostNames = list.map((entry) => {
          const at = entry.indexOf("@");
          return at > 0 ? entry.slice(at + 1).trim() : entry;
        });
        const onDisk = loadConfig(config.root);
        const current = resolveRemoteHosts(onDisk.remoteValidation).map((h) => h.host);
        const unchanged =
          current.length === hostNames.length && current.every((h, i) => h === hostNames[i]);
        if (unchanged) continue;
        // Rewrite the [[…]] rows too: keep a surviving host's per-host attrs
        // (user/os/labels/maxConcurrent), drop rows for hosts the user removed
        // — otherwise a row would silently re-add a deleted host on reload.
        const rows = (
          (parseFlatToml(readRawToml(config.root))[
            "remoteValidation.tailscaleHosts"
          ] as unknown[]) ?? []
        ).filter(
          (r): r is Record<string, unknown> =>
            typeof r === "object" && r !== null && !Array.isArray(r),
        );
        // Map every host in the new `list` (order preserved) to its existing
        // row when there is one — carrying its attrs forward — or a fresh
        // bare `{ host }` when there isn't (just added, or no rows existed
        // at all). Filtering existing rows down to `list` alone would
        // silently drop a newly-added host once the flat-array write is
        // skipped below for a rows-based pool.
        const rowByHost = new Map(
          rows
            .filter((r) => typeof r.host === "string")
            .map((r) => [(r.host as string).trim(), r] as const),
        );
        const mappedRows = hostNames.map((h) => rowByHost.get(h) ?? { host: h });
        // Only keep the pool in [[…]] row form when at least one entry
        // actually carries an attr beyond `host` — otherwise every host is
        // now a bare name and the clean flat-array form is strictly better
        // (no per-host attrs to lose). A pool that used to need rows but no
        // longer does collapses back to flat and the stale [[…]] blocks are
        // dropped, not left behind as bogus attr-less rows.
        const needsRowForm = mappedRows.some((r) => Object.keys(r).length > 1);
        if (needsRowForm) {
          // Also writing patch[field.key] here would additionally emit a
          // flat `tailscaleHosts = [...]` line for the same key: two writes,
          // two TOML forms, one key — patchTomlConfig applies both in
          // sequence and the file ends up with duplicate keys (#0521 review).
          patchRows = mappedRows;
        } else {
          patch[field.key] = list;
          if (rows.length) dropRows = true;
        }
        // A removed shorthand host would otherwise be re-added by its own
        // line: repoint `tailscaleHost` at the first surviving host (parse
        // folds it back in). Absent shorthand is left absent — no key is
        // invented. Independent of the rows/flat choice above — shorthand is
        // its own key either way.
        const shorthand = onDisk.remoteValidation?.tailscaleHost;
        const shorthandHost = shorthand?.includes("@") ? shorthand.split("@").pop() : shorthand;
        if (shorthand && shorthandHost && !hostNames.includes(shorthandHost)) {
          patch["remoteValidation.tailscaleHost"] = list[0]!;
        }
        continue;
      }
      if (field.key === "model_routing.roles") {
        if (!Array.isArray(val)) {
          return json(res, 400, { error: `${field.label} must be an array of role names` });
        }
        const normalized: string[] = [];
        for (const item of val) {
          if (typeof item !== "string" || !item.trim()) {
            return json(res, 400, {
              error: `${field.label} entries must be non-empty strings`,
            });
          }
          const role = item.trim();
          if (!(ROUTING_ROLES as readonly string[]).includes(role)) {
            return json(res, 400, { error: `Unknown routing role: ${role}` });
          }
          if (!normalized.includes(role)) normalized.push(role);
        }
        if (normalized.length === 0) {
          return json(res, 400, { error: "Select at least one role for the router." });
        }
        patch[field.key] = normalized;
        continue;
      }
      if (field.key === "cto.actions") {
        if (!Array.isArray(val)) {
          return json(res, 400, { error: `${field.label} must be an array of action names` });
        }
        const normalized: string[] = [];
        for (const item of val) {
          if (typeof item !== "string" || !item.trim()) {
            return json(res, 400, {
              error: `${field.label} entries must be non-empty strings`,
            });
          }
          const id = item.trim();
          if (!isCtoSafeActionId(id)) {
            return json(res, 400, { error: `Unknown CTO safe action: ${id}` });
          }
          if (!normalized.includes(id)) normalized.push(id);
        }
        const onDisk = configuredCtoActions(loadConfig(config.root));
        const unchanged =
          onDisk.length === normalized.length && onDisk.every((id, i) => id === normalized[i]);
        if (!unchanged) patch[field.key] = normalized;
        continue;
      }
      if (!Array.isArray(val) || !val.length) {
        return json(res, 400, { error: `${field.label} must be a non-empty array` });
      }
      for (const item of val) {
        if (typeof item !== "string" || !item.trim()) {
          return json(res, 400, {
            error: `${field.label} entries must be non-empty strings`,
          });
        }
      }
      patch[field.key] = (val as string[]).map((s) => s.trim());
    }
  }

  const tunnelEnabled = typeof patch.tunnelEnabled === "boolean" ? patch.tunnelEnabled : undefined;
  delete patch.tunnelEnabled;

  // An empty `whisper.apiKey` alone means "leave the key as-is" — a no-op
  // (e.g. the user cleared the field in Settings), not "nothing to update".
  const bodyKeys = Object.keys(body);
  const onlyEmptyWhisperKey =
    bodyKeys.length === 1 &&
    bodyKeys[0] === "whisper.apiKey" &&
    (typeof body["whisper.apiKey"] !== "string" || !body["whisper.apiKey"].trim());

  if (
    Object.keys(patch).length === 0 &&
    tunnelEnabled === undefined &&
    !builtInAgentsChanged &&
    !authEnabledChanged &&
    !areasUnchanged &&
    !dropAreaRows &&
    !devTargetsUnchanged &&
    !dropDevTargetRows &&
    !budgetAllowlistUnchanged &&
    !dropBudgetAllowlistRows &&
    !onlyEmptyWhisperKey
  ) {
    return json(res, 400, { error: "No valid fields to update" });
  }

  const mutationPath = configTomlMutationPath(config.root, config.cacheDir);
  if (Object.keys(patch).length > 0) {
    patchTomlConfig(mutationPath, patch);
  }
  if (dropAreaRows) dropTomlTableArray(mutationPath, "areas");
  if (dropDevTargetRows) dropTomlTableArray(mutationPath, "dev.targets");
  if (dropBudgetAllowlistRows) dropTomlTableArray(mutationPath, "budget.allowlist");
  if (dropRows) {
    dropTomlTableArray(mutationPath, "remoteValidation.tailscaleHosts");
  }
  if (patchRows?.length) {
    // Second pass: replace the [[remoteValidation.tailscaleHosts]] blocks with
    // the surviving rows (same key, table-array form — see patchTomlConfig).
    patchTomlConfig(mutationPath, {
      "remoteValidation.tailscaleHosts": patchRows,
    });
  }
  if (tunnelEnabled !== undefined) {
    const tunnel = readTunnelConfig(config.root);
    tunnel.enabled = tunnelEnabled;
    writeTunnelConfig(config.root, tunnel);
  }

  // #0819: a Settings save writes `repoos.toml` to disk only — it no longer
  // commits to main. The #0682 auto-commit ran on every slider step, and each
  // commit could restart an in-flight close-out. An uncommitted `repoos.toml`
  // is now surfaced (and optionally committed) by the Move-to-done dirty-main
  // prompt, which is where that decision belongs.

  const vocabularyBefore = effectiveAreaNames(repoos.config);
  applyLoadedConfig(repoos, loadConfigAfterServerWrite(config.root, config.cacheDir));
  ctx.remoteValidator?.applyConfig?.();

  // Advisory drift warning (#0583/#0587): any config write that changes the
  // effective area vocabulary is surfaced here. Comparing before/after makes
  // it fire on a preview-target edit as well as an `areas` change, and keeps
  // unrelated saves quiet.
  logAreaVocabularyDrift(repoos, index, ctx.logger, vocabularyBefore);

  if (patch.workDir || patch.cacheDir || patch.taskExtensions) {
    index.refreshAll();
  }

  return json(res, 200, { ok: true, config: safeConfigForBrowser({ ...repoos.config }) });
};

/** Content hash used to detect concurrent edits to repoos.toml. */
function hashConfigContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Remove every `[[key]]` block (header plus its lines, up to the next header)
 * from repoos.toml. Used when a host-pool edit drops the last
 * `[[remoteValidation.tailscaleHosts]]` row (#0521) — `patchTomlConfig` can
 * replace a table array it is given, but an empty array would serialise as a
 * bogus `key = []` line instead of removing the blocks.
 */
function dropTomlTableArray(tomlPath: string, key: string): void {
  if (!existsSync(tomlPath)) return;
  const lines = readFileSync(tomlPath, "utf8").replace(/\r\n/g, "\n").split("\n");
  // Lines inside a `'''`/`"""` string are content: a `[[key]]`-shaped (or
  // header-shaped) line there must not be mistaken for a block boundary.
  const continuation = tomlContinuationLines(lines);
  const kept: string[] = [];
  let removed = false;
  let i = 0;
  while (i < lines.length) {
    const stripped = continuation[i] ? "" : stripTomlComment(lines[i] ?? "").trim();
    if (stripped === `[[${key}]]`) {
      removed = true;
      i++;
      while (i < lines.length) {
        const s = continuation[i] ? "" : stripTomlComment(lines[i] ?? "").trim();
        if (s.startsWith("[")) break;
        i++;
      }
      continue;
    }
    kept.push(lines[i] ?? "");
    i++;
  }
  if (!removed) return;
  while (kept.length && !kept[kept.length - 1]!.trim()) kept.pop();
  writeFileSync(tomlPath, `${kept.join("\n")}\n`, "utf8");
}

/** Read repoos.toml, tolerating its absence (a repo may have no config file). */
function readRawToml(root: string, cacheDir?: string): string {
  const path =
    cacheDir !== undefined ? configTomlReadPath(root, cacheDir) : join(root, "repoos.toml");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * The raw `repoos.toml`, for the Settings page's escape-hatch editor (#0375).
 * Unlike GET /api/config this is deliberately unredacted: the file IS the
 * content the user edits, so hiding values would make a raw save write them
 * back. The endpoint is behind the same auth as every other API route.
 */
export const readRawConfig: RouteHandler = (ctx, _req, res) => {
  const content = readRawToml(ctx.config.root, ctx.config.cacheDir);
  return json(res, 200, { content, hash: hashConfigContent(content) });
};

/**
 * Replace repoos.toml with the posted content (#0375).
 *
 * The body is `{ content, baseHash? }`. `baseHash` is the hash from the last
 * GET/PUT; when it no longer matches the file on disk another writer (a
 * curated-field auto-save, another tab, the CLI) changed it, and the write is
 * refused with 409 so the raw editor can never silently stomp that change.
 * Invalid TOML is rejected with 400 before anything touches disk.
 */
export const writeRawConfig: RouteHandler = async (ctx, req, res) => {
  const { config, repoos, index } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  if (typeof body.content !== "string") {
    return json(res, 400, { error: "content must be a string" });
  }

  const result = validateToml(body.content);
  if (!result.ok) {
    return json(res, 400, { error: formatTomlError(result), line: result.line });
  }

  const path = configTomlMutationPath(config.root, config.cacheDir);
  const current = readRawToml(config.root, config.cacheDir);
  const currentHash = hashConfigContent(current);
  if (typeof body.baseHash === "string" && body.baseHash !== currentHash) {
    return json(res, 409, {
      error:
        "repoos.toml changed on disk since this editor loaded it — reload to see the current " +
        "content before saving, so the other change isn't overwritten.",
      content: current,
      hash: currentHash,
    });
  }

  writeFileSync(path, body.content, "utf8");
  // #0819: like the curated PATCH save, a raw repoos.toml edit writes the file
  // only. Leaving it uncommitted is deliberate — the Move-to-done dirty-main
  // prompt owns the commit decision.

  // Apply immediately, exactly like a PATCH /api/config save: refresh the
  // in-memory config and reconcile the index (the raw file can change
  // workDir/cacheDir/taskExtensions, which a curated save would also refresh).
  const vocabularyBefore = effectiveAreaNames(repoos.config);
  applyLoadedConfig(repoos, loadConfigAfterServerWrite(config.root, config.cacheDir));
  ctx.remoteValidator?.applyConfig?.();
  index.refreshAll();

  // A raw edit is a direct repoos.toml edit, so it is exactly where an area
  // vocabulary can shrink without the curated PATCH path noticing — run the
  // same advisory drift log here (#0587).
  logAreaVocabularyDrift(repoos, index, ctx.logger, vocabularyBefore);

  return json(res, 200, {
    ok: true,
    content: body.content,
    hash: hashConfigContent(body.content),
  });
};
