/**
 * Per-CLI model-source adapters — feeds the Agents page model dropdown from
 * what each coding agent can actually run. Today only opencode has a
 * machine-readable model list (`opencode models`); the other known CLIs are
 * registered as `{ supported: false }` placeholders so a future adapter is a
 * one-file change.
 *
 * Zero runtime deps: `node:child_process` only (binary resolution reuses
 * src/core/detect.ts). Everything is fail-soft: a missing binary, a hung
 * probe, or unparseable output must never throw — callers get
 * `{ models: [] }` and degrade to the static model list.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { resolveBinary, KNOWN_AGENTS } from "./detect.js";

/** Default ceiling on the `opencode models` probe, ms. A hung CLI is SIGKILLed. */
export const MODELS_TIMEOUT_MS = 5000;
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
}

/** Options handed to an adapter's `list`. */
export interface ListModelsOptions {
  /** Re-probe with the source's refresh flag (e.g. `--refresh`). */
  refresh?: boolean;
  /** Working directory the probe runs in (repo root). */
  cwd?: string;
  /** Optional Agent.cli allowlist; avoids probing unrelated installed CLIs. */
  clis?: string[];
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

/** Spawn `<bin> <args>` and collect stdout up to MODELS_MAX_BYTES. */
function spawnModels(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string },
): Promise<string> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(bin, args, {
        cwd: opts.cwd ?? process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve("");
      return;
    }

    let out = "";
    let settled = false;
    const done = (text: string): void => {
      if (settled) return;
      settled = true;
      resolve(text);
    };
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      done("");
    }, opts.timeoutMs);

    proc.stdout?.on("data", (c: Buffer) => {
      if (out.length < MODELS_MAX_BYTES) out += c.toString("utf8");
    });
    proc.on("error", () => {
      clearTimeout(timer);
      done("");
    });
    proc.on("exit", () => {
      clearTimeout(timer);
      done(out);
    });
  });
}

/** Query Codex's account-aware picker catalog through its stdio app-server. */
function listCodexModels(bin: string, opts: ListModelsOptions): Promise<string[]> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(bin, ["app-server", "--listen", "stdio://"], {
        cwd: opts.cwd ?? process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve([]);
      return;
    }
    let pending = "";
    let settled = false;
    const done = (models: string[]): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        proc.kill("SIGTERM");
      } catch {
        /* already exited */
      }
      resolve(models);
    };
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already exited */
      }
      done([]);
    }, CODEX_MODELS_TIMEOUT_MS);
    proc.stdout?.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as {
            id?: number;
            result?: { data?: Array<{ model?: unknown }> };
          };
          if (message.id !== 2 || !Array.isArray(message.result?.data)) continue;
          done(
            message.result.data
              .map((entry) => entry.model)
              .filter((model): model is string => typeof model === "string" && model.length > 0),
          );
        } catch {
          /* notifications and malformed lines are irrelevant */
        }
      }
    });
    proc.on("error", () => done([]));
    proc.on("close", () => done([]));
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
    if (!bin) return { supported: true, models: ["default"], refreshable: true };
    const args = opts.refresh ? ["models", "--refresh"] : ["models"];
    const out = await spawnModels(bin, args, {
      timeoutMs: MODELS_TIMEOUT_MS,
      cwd: opts.cwd,
    });
    return { supported: true, models: ["default", ...parseLiveModels(out)], refreshable: true };
  },
};

const codexAdapter: ModelSourceAdapter = {
  id: "codex",
  cli: "codex",
  supported: true,
  async list(opts: ListModelsOptions = {}): Promise<ModelSourceResult> {
    const bin = resolveBinary("codex", process.env.PATH ?? "");
    if (!bin) return { supported: true, models: ["default"], refreshable: true };
    const models = await listCodexModels(bin, opts);
    return { supported: true, models: ["default", ...new Set(models)], refreshable: true };
  },
};

/**
 * Copilot accepts a model with every prompt, but its CLI does not expose a
 * stable machine-readable model catalog. Offer the CLI default and let the
 * existing per-model compatibility probe validate any manually configured id.
 */
const copilotAdapter: ModelSourceAdapter = {
  id: "copilot",
  cli: "github copilot",
  supported: true,
  async list(): Promise<ModelSourceResult> {
    return { supported: true, models: ["default"], refreshable: false };
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
    if (!bin) return { supported: true, models: ["default"], refreshable: true };
    const out = await spawnModels(bin, ["chat", "--list-models"], {
      timeoutMs: MODELS_TIMEOUT_MS,
      cwd: opts.cwd,
    });
    const models = parseKiroModels(out);
    return { supported: true, models: ["default", ...models], refreshable: true };
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
};
for (const known of KNOWN_AGENTS) {
  if (
    known.id === "opencode" ||
    known.id === "codex" ||
    known.id === "copilot" ||
    known.id === "kiro"
  )
    continue;
  MODEL_SOURCES[known.name] = unsupported(known.id, known.name);
}

/**
 * Probe every registered model source, fail-soft. Never throws and never
 * hangs: a bad PATH, missing binary, or timeout resolves an empty result.
 * Returns results keyed by `Agent.cli` for `GET /api/models`.
 */
export async function listModelSources(
  opts: ListModelsOptions = {},
): Promise<Record<string, ModelSourceResult>> {
  const out: Record<string, ModelSourceResult> = {};
  const selected = opts.clis?.length
    ? Object.values(MODEL_SOURCES).filter((source) => opts.clis!.includes(source.cli))
    : Object.values(MODEL_SOURCES);
  await Promise.all(
    selected.map(async (src) => {
      try {
        out[src.cli] = await src.list(opts);
      } catch {
        out[src.cli] = { supported: src.supported, models: [], refreshable: src.supported };
      }
    }),
  );
  return out;
}
