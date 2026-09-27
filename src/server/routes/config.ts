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
  getConfigSchema,
  patchTomlConfig,
  loadConfig,
  parseFlatToml,
  sanitizeBuiltInAgents,
  saveBuiltInAgentsConfig,
  resolveColumnLabels,
} from "../../core/config.js";
import { resolveRemoteHosts } from "../../core/remote-hosts.js";
import { formatTomlError, validateToml } from "../../core/toml-validate.js";
import { stripTomlComment } from "../../core/toml-line.js";
import { readTunnelConfig, writeTunnelConfig } from "../../core/tunnel.js";
import { listSkills } from "./helpers.js";

/**
 * Config as the browser may see it: `whisper.apiKey` is stripped entirely and
 * the whisper state is exposed through the flat schema keys
 * (`whisper.provider`) plus a `whisperEnabled` boolean. The secret never
 * crosses the HTTP boundary. Auth secrets (sessionSecret, emailProvider.apiKey,
 * google.clientSecret) are also stripped.
 */
function safeConfigForBrowser(config: Record<string, unknown>): Record<string, unknown> {
  const whisper = (config.whisper ?? { provider: "none", apiKey: "" }) as {
    provider?: string;
    apiKey?: string;
  };
  const whisperEnabled = whisper.provider !== "none" && !!whisper.apiKey;
  const {
    whisper: _ignoredWhisper,
    theme: _ignoredTheme,
    uiTheme: _ignoredUiTheme,
    ...rest
  } = config;
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
  return {
    ...rest,
    auth: safeAuth,
    "whisper.provider": whisper.provider ?? "none",
    whisperEnabled,
    board: {
      ...((rest as Record<string, unknown>).board as Record<string, unknown> | undefined),
      columns: resolveColumnLabels(rest.boardColumns as Record<string, string> | undefined),
    },
  };
}

export const readConfig: RouteHandler = (ctx, _req, res) => {
  const { repoos } = ctx;
  const agents = agentsForConfig(repoos.config);
  const safeConfig = safeConfigForBrowser({ ...repoos.config, agents });
  return json(res, 200, {
    config: safeConfig,
    schema: getConfigSchema(),
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
    const val = body[field.key];

    if (field.type === "string") {
      if (field.key === "dev.inspector.editorCommand") {
        patch[field.key] = typeof val === "string" ? val.trim() : "";
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
    } else if (field.type === "select") {
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
      if (field.key === "remoteValidation.tailscaleHosts" && Array.isArray(val)) {
        // The host pool (#0521) round-trips through the Settings form as host
        // names. An empty list means "nothing to change" (the file may still
        // carry the tailscaleHost shorthand or [[…]] rows), and a list that
        // matches what config already resolves to is a no-op — never
        // materialise the folded shorthand into a written key.
        const list = (val as unknown[]).map((s) => (typeof s === "string" ? s.trim() : ""));
        if (list.some((s) => !s)) {
          return json(res, 400, { error: `${field.label} entries must be non-empty strings` });
        }
        if (list.length === 0) continue;
        const onDisk = loadConfig(config.root);
        const current = resolveRemoteHosts(onDisk.remoteValidation).map((h) => h.host);
        const unchanged = current.length === list.length && current.every((h, i) => h === list[i]);
        if (unchanged) continue;
        patch[field.key] = list;
        // A removed shorthand host would otherwise be re-added by its own line:
        // repoint `tailscaleHost` at the first surviving host (parse folds it
        // back in). Absent shorthand is left absent — no key is invented.
        const shorthand = onDisk.remoteValidation?.tailscaleHost;
        if (shorthand && !list.includes(shorthand)) {
          patch["remoteValidation.tailscaleHost"] = list[0]!;
        }
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
        const keptRows = rows.filter(
          (r) => typeof r.host === "string" && list.includes(r.host.trim()),
        );
        if (keptRows.length) {
          patchRows = keptRows;
        } else if (rows.length) {
          // Every row's host was removed — delete the [[…]] blocks outright
          // (patchTomlConfig only rewrites a table array it is *given*, and an
          // empty value would serialise as a bogus `key = []` line). Applied
          // with the rest of the patch below, never mid-validation.
          dropRows = true;
        }
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
    !onlyEmptyWhisperKey
  ) {
    return json(res, 400, { error: "No valid fields to update" });
  }

  if (Object.keys(patch).length > 0) {
    patchTomlConfig(join(config.root, "repoos.toml"), patch);
  }
  if (dropRows) {
    dropTomlTableArray(join(config.root, "repoos.toml"), "remoteValidation.tailscaleHosts");
  }
  if (patchRows?.length) {
    // Second pass: replace the [[remoteValidation.tailscaleHosts]] blocks with
    // the surviving rows (same key, table-array form — see patchTomlConfig).
    patchTomlConfig(join(config.root, "repoos.toml"), {
      "remoteValidation.tailscaleHosts": patchRows,
    });
  }
  if (tunnelEnabled !== undefined) {
    const tunnel = readTunnelConfig(config.root);
    tunnel.enabled = tunnelEnabled;
    writeTunnelConfig(config.root, tunnel);
  }

  Object.assign(repoos.config, loadConfig(config.root));

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
  const kept: string[] = [];
  let removed = false;
  let i = 0;
  while (i < lines.length) {
    if (stripTomlComment(lines[i] ?? "").trim() === `[[${key}]]`) {
      removed = true;
      i++;
      while (i < lines.length) {
        if (
          stripTomlComment(lines[i] ?? "")
            .trim()
            .startsWith("[")
        )
          break;
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
function readRawToml(root: string): string {
  const path = join(root, "repoos.toml");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * The raw `repoos.toml`, for the Settings page's escape-hatch editor (#0375).
 * Unlike GET /api/config this is deliberately unredacted: the file IS the
 * content the user edits, so hiding values would make a raw save write them
 * back. The endpoint is behind the same auth as every other API route.
 */
export const readRawConfig: RouteHandler = (ctx, _req, res) => {
  const content = readRawToml(ctx.config.root);
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

  const path = join(config.root, "repoos.toml");
  const current = readRawToml(config.root);
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

  // Apply immediately, exactly like a PATCH /api/config save: refresh the
  // in-memory config and reconcile the index (the raw file can change
  // workDir/cacheDir/taskExtensions, which a curated save would also refresh).
  Object.assign(repoos.config, loadConfig(config.root));
  index.refreshAll();

  return json(res, 200, {
    ok: true,
    content: body.content,
    hash: hashConfigContent(body.content),
  });
};
