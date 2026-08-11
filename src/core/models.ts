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
};
for (const known of KNOWN_AGENTS) {
  if (known.id === "opencode") continue;
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
  await Promise.all(
    Object.values(MODEL_SOURCES).map(async (src) => {
      try {
        out[src.cli] = await src.list(opts);
      } catch {
        out[src.cli] = { supported: src.supported, models: [], refreshable: src.supported };
      }
    }),
  );
  return out;
}
