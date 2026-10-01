/**
 * Per-CLI model-source adapters — feeds the Agents page model dropdown from
 * what each coding agent can actually run. Today only opencode has a
 * machine-readable model list (`opencode models`); the other known CLIs are
 * registered as `{ supported: false }` placeholders so a future adapter is a
 * one-file change.
 *
 * Zero runtime deps: `node:child_process` only (binary resolution reuses
 * src/core/detect.ts). Everything is fail-soft: a missing binary, a hung
 * probe, or unparseable output must never throw — callers get a result with an
 * empty `models` list plus an `error` saying *why* (#0593), and degrade to the
 * static model list with the reason visible instead of a silent empty dropdown.
 *
 * `listModelSources` keeps a short per-CLI TTL cache so a page full of
 * dropdowns doesn't re-spawn every CLI on each request; `refresh: true`
 * (surfaced as `?refresh=1` on GET /api/models) bypasses it.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { resolveBinary, KNOWN_AGENTS } from "./detect.js";

/** Default ceiling on the `opencode models` probe, ms. A hung CLI is SIGKILLed. */
export const MODELS_TIMEOUT_MS = 12_000;
/** Codex app-server has a heavier cold start than a one-shot CLI command. */
export const CODEX_MODELS_TIMEOUT_MS = 15_000;
/** Hard cap on collected stdout so a runaway provider list can't balloon memory. */
export const MODELS_MAX_BYTES = 64 * 1024;
/** Longest accepted model id — keeps the dropdown readable. */
const MODEL_ID_MAX_LEN = 120;

/** Outcome of probing one model source. `models` is never null. */
export interface ModelSourceResult {
  supported: boolean;
  models: string[];
  /** True when the source supports a cache-refreshing re-probe. */
  refreshable: boolean;
  /**
   * Why the list is empty or incomplete, when the probe failed: binary not
   * found on PATH, timed out, spawn failed, non-zero exit (often "not signed
   * in"), or a JSON-RPC error from the CLI. Absent on success (#0593).
   */
  error?: string;
}

/** Options handed to an adapter's `list`. */
export interface ListModelsOptions {
  /** Re-probe with the source's refresh flag (e.g. `--refresh`). */
  refresh?: boolean;
  /** Working directory the probe runs in (repo root). */
  cwd?: string;
  /** Optional Agent.cli allowlist; avoids probing unrelated installed CLIs. */
  clis?: string[];
  /**
   * Override the per-probe timeout ceiling (ms). Defaults to the adapter's
   * own limit; tests use it to exercise the timed-out path without waiting
   * out the production 12–15s.
   */
  timeoutMs?: number;
}

/** A per-CLI model source. `list` never throws — failures resolve empty. */
export interface ModelSourceAdapter {
  /** Stable id, e.g. "opencode". */
  id: string;
  /** The `Agent.cli` value this adapter serves, e.g. "claude code". */
  cli: string;
  supported: boolean;
  list(opts: ListModelsOptions): Promise<ModelSourceResult>;
}

/**
 * Parse `opencode models` stdout into a sorted, unique list of model ids. The
 * command emits one `provider/model` id per line; anything else (headers, help
 * text, ANSI noise) is dropped.
 */
export function parseLiveModels(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const id = raw.trim();
    if (!id || id.length > MODEL_ID_MAX_LEN) continue;
    if (!id.includes("/")) continue;
    seen.add(id);
  }
  return [...seen].sort();
}

/**
 * Parse `pi --list-models` stdout into sorted, unique `provider/model` ids.
 * pi prints an aligned table (`provider model context max-out thinking images`)
 * rather than one id per line, so the first two whitespace-separated columns
 * are combined. The header line and any short/malformed rows are dropped.
 */
export function parsePiModels(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 2) continue;
    const [provider, model] = cols;
    if (!provider || !model) continue;
    if (/^provider$/i.test(provider)) continue; // table header
    const id = `${provider}/${model}`;
    if (id.length > MODEL_ID_MAX_LEN) continue;
    seen.add(id);
  }
  return [...seen].sort();
}

/**
 * Parse the documented `agy models` table. The first whitespace-delimited
 * token is the model slug; human-readable labels and headers are ignored.
 * This intentionally accepts only slug-shaped rows so login/help diagnostics
 * never become selectable models.
 */
export function parseAntigravityModels(text: string): string[] {
  const seen = new Set<string>();
  const clean = text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
  for (const raw of clean.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const slug = line.split(/\s+/)[0];
    if (!slug || slug.length > MODEL_ID_MAX_LEN) continue;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) continue;
    if (/^(available|models|model|usage|error|warning)$/i.test(slug)) continue;
    // A model row has a display label after the slug. Requiring it keeps a
    // lone diagnostic word from being presented as a model option.
    if (!/^\S+\s+\S/.test(line)) continue;
    // Real model ids carry a version or a hyphen (gemini-3.8-flash,
    // claude-sonnet-4-6); diagnostics like "Authentication required" or
    // "Failed to start" don't, and must never become selectable pins.
    if (!/[-\d]/.test(slug)) continue;
    seen.add(slug);
  }
  return [...seen];
}

/** Raw outcome of a spawned probe: stdout plus why it may be incomplete. */
interface SpawnOutcome {
  text: string;
  /** Bounded stderr — the human-readable reason behind a non-zero exit. */
  stderr: string;
  /** Process exit code; null when it never exited normally. */
  code: number | null;
  timedOut: boolean;
  spawnError: boolean;
}

/** Cap on collected stderr so a noisy failure can't balloon memory. */
const MODELS_STDERR_MAX_BYTES = 4 * 1024;

/**
 * The reason a spawn-based probe failed, or undefined when it ran cleanly.
 * The stderr first line is included because CLIs say "Not signed in" /
 * "Authentication required" there — exactly the reason the dropdown needs.
 */
function probeError(bin: string, out: SpawnOutcome, timeoutMs: number): string | undefined {
  if (out.spawnError) return `failed to run ${bin}`;
  if (out.timedOut) return `${bin} timed out after ${Math.round(timeoutMs / 1000)}s`;
  if (out.code !== null && out.code !== 0) {
    const detail = out.stderr
      .split("\n")
      .find((l) => l.trim())
      ?.trim();
    return detail
      ? `${bin} exited with code ${out.code}: ${detail}`
      : `${bin} exited with code ${out.code}`;
  }
  return undefined;
}

/** Spawn `<bin> <args>` and collect stdout up to MODELS_MAX_BYTES. */
function spawnModels(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string },
): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(bin, args, {
        cwd: opts.cwd ?? process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve({ text: "", stderr: "", code: null, timedOut: false, spawnError: true });
      return;
    }

    let out = "";
    let err = "";
    let settled = false;
    const done = (outcome: SpawnOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      done({ text: "", stderr: err, code: null, timedOut: true, spawnError: false });
    }, opts.timeoutMs);

    proc.stdout?.on("data", (c: Buffer) => {
      if (out.length < MODELS_MAX_BYTES) out += c.toString("utf8");
    });
    proc.stderr?.on("data", (c: Buffer) => {
      if (err.length < MODELS_STDERR_MAX_BYTES) err += c.toString("utf8");
    });
    proc.on("error", () => {
      clearTimeout(timer);
      done({ text: "", stderr: err, code: null, timedOut: false, spawnError: true });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      done({ text: out, stderr: err, code, timedOut: false, spawnError: false });
    });
  });
}

/** Raw outcome of the Codex app-server probe. */
interface CodexProbeOutcome {
  models: string[];
  /** Present when the probe failed (timeout, spawn, or JSON-RPC error). */
  error?: string;
}

/** Query Codex's account-aware picker catalog through its stdio app-server. */
function listCodexModels(bin: string, opts: ListModelsOptions): Promise<CodexProbeOutcome> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(bin, ["app-server", "--listen", "stdio://"], {
        cwd: opts.cwd ?? process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve({ models: [], error: `failed to run ${bin}` });
      return;
    }
    let pending = "";
    let settled = false;
    const timeoutMs = opts.timeoutMs ?? CODEX_MODELS_TIMEOUT_MS;
    const done = (outcome: CodexProbeOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        proc.kill("SIGTERM");
      } catch {
        /* already exited */
      }
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already exited */
      }
      done({
        models: [],
        error: `${bin} app-server timed out after ${Math.round(timeoutMs / 1000)}s`,
      });
    }, timeoutMs);
    proc.stdout?.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as {
            id?: number;
            result?: { data?: Array<{ model?: unknown }> };
            error?: { message?: unknown } | string;
          };
          if (message.id !== 2) continue;
          // A JSON-RPC error (not signed in, account probe refused, …) is the
          // reason the list is empty — surface it instead of a bare [].
          if (message.error) {
            const detail =
              typeof message.error === "string"
                ? message.error
                : typeof message.error.message === "string"
                  ? message.error.message
                  : "model/list failed";
            done({ models: [], error: `${bin}: ${detail}` });
            return;
          }
          if (!Array.isArray(message.result?.data)) continue;
          done({
            models: message.result.data
              .map((entry) => entry.model)
              .filter((model): model is string => typeof model === "string" && model.length > 0),
          });
          return;
        } catch {
          /* notifications and malformed lines are irrelevant */
        }
      }
    });
    proc.on("error", () => done({ models: [], error: `failed to run ${bin}` }));
    proc.on("close", () =>
      done({ models: [], error: `${bin} app-server closed before returning models` }),
    );
    proc.stdin?.write(
      [
        JSON.stringify({
          id: 1,
          method: "initialize",
          params: { clientInfo: { name: "repoos", version: "0.3.0" }, capabilities: {} },
        }),
        JSON.stringify({
          id: 2,
          method: "model/list",
          params: { limit: 100, includeHidden: false },
        }),
        "",
      ].join("\n"),
    );
  });
}

/** The opencode adapter: spawns `opencode models` and parses `provider/model`. */
const opencodeAdapter: ModelSourceAdapter = {
  id: "opencode",
  cli: "opencode",
  supported: true,
  async list(opts: ListModelsOptions = {}): Promise<ModelSourceResult> {
    // "default" (the coding agent's own default) is always offered first.
    const bin = resolveBinary("opencode", process.env.PATH ?? "");
    if (!bin)
      return {
        supported: true,
        models: ["default"],
        refreshable: true,
        error: "opencode not found on PATH",
      };
    const args = opts.refresh ? ["models", "--refresh"] : ["models"];
    const timeoutMs = opts.timeoutMs ?? MODELS_TIMEOUT_MS;
    const out = await spawnModels(bin, args, {
      timeoutMs,
      cwd: opts.cwd,
    });
    const error = probeError(bin, out, timeoutMs);
    return {
      supported: true,
      models: ["default", ...parseLiveModels(out.text)],
      refreshable: true,
      ...(error ? { error } : {}),
    };
  },
};

const codexAdapter: ModelSourceAdapter = {
  id: "codex",
  cli: "codex",
  supported: true,
  async list(opts: ListModelsOptions = {}): Promise<ModelSourceResult> {
    const bin = resolveBinary("codex", process.env.PATH ?? "");
    if (!bin)
      return {
        supported: true,
        models: ["default"],
        refreshable: true,
        error: "codex not found on PATH",
      };
    const probe = await listCodexModels(bin, opts);
    return {
      supported: true,
      models: ["default", ...new Set(probe.models)],
      refreshable: true,
      ...(probe.error ? { error: probe.error } : {}),
    };
  },
};

/**
 * Copilot's interactive picker has no stable machine-readable catalog, but
 * Auto tiers are stable CLI flags. The underlying model remains account- and
 * policy-dependent, so expose tiers rather than guessing which named models a
 * user can access.
 */
const copilotAdapter: ModelSourceAdapter = {
  id: "copilot",
  cli: "github copilot",
  supported: true,
  async list(): Promise<ModelSourceResult> {
    return {
      supported: true,
      models: ["default", "copilot-auto-balance", "copilot-auto-intelligence"],
      refreshable: false,
    };
  },
};

/**
 * Kiro adapter: parses `kiro-cli chat --list-models` plain-text output.
 * The CLI emits a human-readable table; we strip ANSI codes and take the
 * first whitespace-delimited token from each model row (e.g. "auto",
 * "claude-sonnet-4.5"). A leading "*" marks the default model and is
 * stripped before taking the token. Token counts are not reported by the
 * CLI; cost tracking uses the credits footer parsed by extractUsage.
 */
function parseKiroModels(text: string): string[] {
  const seen = new Set<string>();
  // Strip ANSI escape sequences
  const clean = text.replace(/\x1b\[[^m]*m/g, "").replace(/\x1b\[[?][0-9]*[a-zA-Z]/g, "");
  for (const raw of clean.split("\n")) {
    const line = raw.trim().replace(/^\*\s*/, ""); // strip leading "*"
    if (!line) continue;
    const token = line.split(/\s+/)[0];
    // Must look like a model id: alphanumeric, hyphens, dots — no spaces
    if (!token || token.length > MODEL_ID_MAX_LEN) continue;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(token)) continue;
    // Skip header lines like "Available" or "models"
    if (/^available$/i.test(token) || /^models$/i.test(token)) continue;
    seen.add(token);
  }
  return [...seen];
}

const kiroAdapter: ModelSourceAdapter = {
  id: "kiro",
  cli: "kiro",
  supported: true,
  async list(opts: ListModelsOptions = {}): Promise<ModelSourceResult> {
    const bin = resolveBinary("kiro-cli", process.env.PATH ?? "");
    if (!bin)
      return {
        supported: true,
        models: ["default"],
        refreshable: true,
        error: "kiro-cli not found on PATH",
      };
    const out = await spawnModels(bin, ["chat", "--list-models"], {
      timeoutMs: opts.timeoutMs ?? MODELS_TIMEOUT_MS,
      cwd: opts.cwd,
    });
    const error = probeError(bin, out, opts.timeoutMs ?? MODELS_TIMEOUT_MS);
    const models = parseKiroModels(out.text);
    return {
      supported: true,
      models: ["default", ...models],
      refreshable: true,
      ...(error ? { error } : {}),
    };
  },
};

/**
 * Cursor adapter: parses `cursor-agent --list-models` output. Each model row is
 * `<id> - <display name>` (e.g. `auto - Auto (current, default)`); the header
 * and any non-matching line are dropped. Cursor's model ids are stable enough
 * to offer in the dropdown, but the CLI default is always `default` here.
 */
export function parseCursorModels(text: string): string[] {
  const seen = new Set<string>();
  const clean = text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
  for (const raw of clean.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([a-zA-Z0-9][^\s]*)\s+-\s+\S/);
    if (!m) continue;
    const id = m[1];
    if (!id || id.length > MODEL_ID_MAX_LEN) continue;
    seen.add(id);
  }
  return [...seen];
}

const cursorAdapter: ModelSourceAdapter = {
  id: "cursor",
  cli: "cursor",
  supported: true,
  async list(opts: ListModelsOptions = {}): Promise<ModelSourceResult> {
    const bin = resolveBinary("cursor-agent", process.env.PATH ?? "");
    if (!bin)
      return {
        supported: true,
        models: ["default"],
        refreshable: true,
        error: "cursor-agent not found on PATH",
      };
    const out = await spawnModels(bin, ["--list-models"], {
      timeoutMs: opts.timeoutMs ?? MODELS_TIMEOUT_MS,
      cwd: opts.cwd,
    });
    const error = probeError(bin, out, opts.timeoutMs ?? MODELS_TIMEOUT_MS);
    return {
      supported: true,
      models: ["default", ...parseCursorModels(out.text)],
      refreshable: true,
      ...(error ? { error } : {}),
    };
  },
};

const antigravityAdapter: ModelSourceAdapter = {
  id: "antigravity",
  cli: "antigravity",
  supported: true,
  async list(opts: ListModelsOptions = {}): Promise<ModelSourceResult> {
    const bin = resolveBinary("agy", process.env.PATH ?? "");
    if (!bin)
      return {
        supported: true,
        models: ["default"],
        refreshable: false,
        error: "agy not found on PATH",
      };
    const out = await spawnModels(bin, ["models"], {
      timeoutMs: opts.timeoutMs ?? MODELS_TIMEOUT_MS,
      cwd: opts.cwd,
    });
    const error = probeError(bin, out, opts.timeoutMs ?? MODELS_TIMEOUT_MS);
    return {
      supported: true,
      models: ["default", ...parseAntigravityModels(out.text)],
      refreshable: false,
      ...(error ? { error } : {}),
    };
  },
};

/**
 * Crush adapter: parses `crush models`, which emits one `provider/model` id per
 * line when stdout is not a TTY (e.g. `aihubmix/DeepSeek-V3`), sorted by the
 * CLI. There is no `--json` and no refresh flag. The CLI lists models for
 * unconfigured providers too; the `(not configured)` annotation is TTY-only, so
 * a piped probe cannot filter it — the picker may therefore offer entries a
 * given account cannot run. That is acceptable for a pin selector (the run fails
 * with a clear CLI error) and avoids an extra provider-config probe here.
 */
const crushAdapter: ModelSourceAdapter = {
  id: "crush",
  cli: "crush",
  supported: true,
  async list(opts: ListModelsOptions = {}): Promise<ModelSourceResult> {
    const bin = resolveBinary("crush", process.env.PATH ?? "");
    if (!bin)
      return {
        supported: true,
        models: ["default"],
        refreshable: false,
        error: "crush not found on PATH",
      };
    const out = await spawnModels(bin, ["models"], {
      timeoutMs: opts.timeoutMs ?? MODELS_TIMEOUT_MS,
      cwd: opts.cwd,
    });
    const error = probeError(bin, out, opts.timeoutMs ?? MODELS_TIMEOUT_MS);
    return {
      supported: true,
      models: ["default", ...parseLiveModels(out.text)],
      refreshable: false,
      ...(error ? { error } : {}),
    };
  },
};

/**
 * pi adapter: parses `pi --list-models`, an aligned table whose first two
 * columns are the provider and model. There is no `--json` and no refresh
 * flag; the list is account/provider-wide, so the picker may offer models a
 * given key cannot run — acceptable for a pin selector (the run fails with a
 * clear CLI error).
 */
const piAdapter: ModelSourceAdapter = {
  id: "pi",
  cli: "pi",
  supported: true,
  async list(opts: ListModelsOptions = {}): Promise<ModelSourceResult> {
    const bin = resolveBinary("pi", process.env.PATH ?? "");
    if (!bin)
      return {
        supported: true,
        models: ["default"],
        refreshable: false,
        error: "pi not found on PATH",
      };
    const out = await spawnModels(bin, ["--list-models"], {
      timeoutMs: opts.timeoutMs ?? MODELS_TIMEOUT_MS,
      cwd: opts.cwd,
    });
    const error = probeError(bin, out, opts.timeoutMs ?? MODELS_TIMEOUT_MS);
    return {
      supported: true,
      models: ["default", ...parsePiModels(out.text)],
      refreshable: false,
      ...(error ? { error } : {}),
    };
  },
};

/** Placeholder adapter for CLIs with no machine-readable model list. */
function unsupported(id: string, cli: string): ModelSourceAdapter {
  return {
    id,
    cli,
    supported: false,
    async list(): Promise<ModelSourceResult> {
      return { supported: false, models: [], refreshable: false };
    },
  };
}

/** Registry keyed by `Agent.cli`. Only opencode lists models; the rest are stubs. */
export const MODEL_SOURCES: Record<string, ModelSourceAdapter> = {
  opencode: opencodeAdapter,
  codex: codexAdapter,
  "github copilot": copilotAdapter,
  kiro: kiroAdapter,
  cursor: cursorAdapter,
  antigravity: antigravityAdapter,
  crush: crushAdapter,
  pi: piAdapter,
};
for (const known of KNOWN_AGENTS) {
  if (
    known.id === "opencode" ||
    known.id === "codex" ||
    known.id === "copilot" ||
    known.id === "kiro" ||
    known.id === "cursor" ||
    known.id === "antigravity" ||
    known.id === "crush" ||
    known.id === "pi"
  )
    continue;
  MODEL_SOURCES[known.name] = unsupported(known.id, known.name);
}

/**
 * How long one CLI's probe result is served from the in-process cache (#0593).
 * Long enough that a page full of dropdowns (and repeated mounts of the Agents
 * page) doesn't re-spawn every CLI, short enough that a newly installed or
 * newly signed-in CLI shows up within a minute. `refresh: true` bypasses it.
 */
export const MODEL_CACHE_TTL_MS = 60_000;

interface CachedModelResult {
  at: number;
  result: ModelSourceResult;
}

/** Keyed by cwd + `Agent.cli` — a probe's answer depends on both. */
const modelResultCache = new Map<string, CachedModelResult>();
/** In-flight probes, so concurrent requests for one CLI spawn it once. */
const inflightModelProbes = new Map<string, Promise<ModelSourceResult>>();

/** Drop every cached/in-flight probe result (tests, and `--refresh` internals). */
export function clearModelSourceCache(): void {
  modelResultCache.clear();
  inflightModelProbes.clear();
}

function modelCacheKey(cli: string, cwd: string): string {
  return `${cwd}\u0000${cli}`;
}

/**
 * Probe every registered model source, fail-soft. Never throws and never
 * hangs: a bad PATH, missing binary, or timeout resolves an empty result with
 * an `error` reason (#0593). Returns results keyed by `Agent.cli` for
 * `GET /api/models`.
 *
 * Each CLI's result is cached for MODEL_CACHE_TTL_MS and probed at most once
 * concurrently; pass `refresh: true` to bypass the cache (the CLI's own
 * refresh flag is forwarded to the adapter, and the fresh result re-populates
 * the cache).
 */
export async function listModelSources(
  opts: ListModelsOptions = {},
): Promise<Record<string, ModelSourceResult>> {
  const out: Record<string, ModelSourceResult> = {};
  const cwd = opts.cwd ?? process.cwd();
  const selected = opts.clis?.length
    ? Object.values(MODEL_SOURCES).filter((source) => opts.clis!.includes(source.cli))
    : Object.values(MODEL_SOURCES);
  await Promise.all(
    selected.map(async (src) => {
      const key = modelCacheKey(src.cli, cwd);
      if (!opts.refresh) {
        const hit = modelResultCache.get(key);
        if (hit && Date.now() - hit.at < MODEL_CACHE_TTL_MS) {
          out[src.cli] = hit.result;
          return;
        }
      }
      // A refresh must not join a non-refresh probe already in flight: that
      // one ran without the CLI's `--refresh` flag, which is the opposite of
      // what the caller asked for.
      let probe = opts.refresh ? undefined : inflightModelProbes.get(key);
      if (!probe) {
        const started: Promise<ModelSourceResult> = src
          .list(opts)
          .then((result) => {
            modelResultCache.set(key, { at: Date.now(), result });
            return result;
          })
          .catch((err: unknown) => {
            // Adapters are contracted never to throw, but if one does the
            // caller still needs a reason, not a bare empty list. Failures
            // are cached too — re-probing a broken CLI on every request is
            // exactly the load this cache exists to prevent.
            const result: ModelSourceResult = {
              supported: src.supported,
              models: [],
              refreshable: src.supported,
              error: err instanceof Error ? err.message : String(err),
            };
            modelResultCache.set(key, { at: Date.now(), result });
            return result;
          });
        if (!opts.refresh) {
          inflightModelProbes.set(key, started);
          void started.then(() => {
            if (inflightModelProbes.get(key) === started) inflightModelProbes.delete(key);
          });
        }
        probe = started;
      }
      out[src.cli] = await probe;
    }),
  );
  return out;
}
