/** Periodically verify exhausted providers with a tiny prompt, then unpause. */
import type { Agent, AgentModelAllowRow, RepoOSConfig } from "../core/types.js";
import { applyReloadedConfig, patchTomlConfig } from "../core/config.js";
import {
  pairPauseInfo,
  pauseAllowlistEntry,
  resumeAllowlistEntry,
} from "../core/budget-allowlist.js";
import { detectProviderUsageLimit } from "../core/provider-usage-limit.js";
import { recordOneShotSession, runPrompt } from "./agents.js";
import type { Logger } from "../core/logger.js";
import { configTomlMutationPath, loadConfigAfterServerWrite } from "./preview-config-isolation.js";

export const PROVIDER_USAGE_PROBE_INTERVAL_MS = 10 * 60_000;

/** First gap after a due pause, then doubled on each still-limited probe. */
export const USAGE_PROBE_BACKOFF_START_MS = PROVIDER_USAGE_PROBE_INTERVAL_MS;

/** Ceiling for the doubled probe gap (6 hours). */
export const USAGE_PROBE_BACKOFF_CAP_MS = 6 * 60 * 60_000;

const AUTO_PAUSE_PREFIX = "out of usage since ";

/** What one availability probe found. A boolean is a probe with no CLI text. */
export type UsageProbeVerdict = boolean | { ok: boolean; output?: string };

/** Per-pair next-probe time. Shared across ticks by the scheduler. */
export type UsageProbeBackoff = Map<string, { notBefore: number; intervalMs: number }>;

interface ProbeTarget {
  cli: string;
  model: string;
  /** False resumes the whole agent row; true resumes only this model. */
  modelScoped: boolean;
  reason?: string;
}

function autoTargets(rows: AgentModelAllowRow[]): ProbeTarget[] {
  const targets: ProbeTarget[] = [];
  for (const row of rows) {
    if (row.pausedReason?.startsWith(AUTO_PAUSE_PREFIX) && row.paused) {
      const model = row.models[0];
      if (model)
        targets.push({ cli: row.cli, model, modelScoped: false, reason: row.pausedReason });
    }
    for (const pause of row.pausedModels ?? []) {
      if (!pause.pausedReason?.startsWith(AUTO_PAUSE_PREFIX)) continue;
      targets.push({
        cli: row.cli,
        model: pause.model,
        modelScoped: true,
        reason: pause.pausedReason,
      });
    }
  }
  return targets;
}

function verdictOf(value: UsageProbeVerdict): { ok: boolean; output: string } {
  if (typeof value === "boolean") return { ok: value, output: "" };
  return { ok: value.ok, output: value.output ?? "" };
}

/**
 * Probe each automatically exhausted pair that is due.
 *
 * An allowlist pause that is still active — `pausedUntil` in the future, or
 * a pause with no date — is not probed. After the reset time, probes are at
 * most one per backoff interval. A usage-limit reply stores that reset time
 * as `pausedUntil` so the pair is not probed again until then.
 */
export async function probeExhaustedUsageLimitPairs(
  config: RepoOSConfig,
  probe: (agent: Agent) => Promise<UsageProbeVerdict>,
  onResume: (cli: string, model: string) => void = () => {},
  now = Date.now(),
  backoff: UsageProbeBackoff = new Map(),
  onExtended: (cli: string, model: string) => void = () => {},
): Promise<string[]> {
  const resumed: string[] = [];
  for (const target of autoTargets(config.budget?.allowlist ?? [])) {
    const info = pairPauseInfo(config.budget?.allowlist ?? [], target.cli, target.model, now);
    if (info.paused && info.until && Date.parse(info.until) > now) continue;
    if (info.paused && !info.until) {
      const retryAt = target.reason ? detectProviderUsageLimit(target.reason)?.retryAt : undefined;
      if (retryAt && Date.parse(retryAt) > now) {
        const mutation = pauseAllowlistEntry(config.budget?.allowlist ?? [], {
          cli: target.cli,
          ...(target.modelScoped ? { model: target.model } : {}),
          until: retryAt,
          ...(target.reason ? { reason: target.reason } : {}),
        });
        if ("rows" in mutation) {
          config.budget = { ...config.budget, allowlist: mutation.rows };
          onExtended(target.cli, target.model);
        }
      }
      continue;
    }

    const key = `${target.cli}\0${target.model}`;
    const slot = backoff.get(key);
    if (slot && slot.notBefore > now) continue;

    const agent: Agent = {
      name: `${target.cli}-${target.model}`,
      cli: target.cli,
      model: target.model,
      enabled: true,
    };
    const verdict = verdictOf(await probe(agent));
    if (verdict.ok) {
      backoff.delete(key);
      const mutation = resumeAllowlistEntry(config.budget?.allowlist ?? [], {
        cli: target.cli,
        ...(target.modelScoped ? { model: target.model } : {}),
      });
      if (!("rows" in mutation)) continue;
      config.budget = { ...config.budget, allowlist: mutation.rows };
      resumed.push(`${target.cli} + ${target.model}`);
      onResume(target.cli, target.model);
      continue;
    }

    const interval = slot?.intervalMs ?? USAGE_PROBE_BACKOFF_START_MS;
    backoff.set(key, {
      notBefore: now + interval,
      intervalMs: Math.min(interval * 2, USAGE_PROBE_BACKOFF_CAP_MS),
    });
    const limit = verdict.output ? detectProviderUsageLimit(verdict.output) : null;
    if (!limit?.retryAt || Date.parse(limit.retryAt) <= now) continue;
    const mutation = pauseAllowlistEntry(config.budget?.allowlist ?? [], {
      cli: target.cli,
      ...(target.modelScoped ? { model: target.model } : {}),
      until: limit.retryAt,
      ...(target.reason ? { reason: target.reason } : {}),
    });
    if (!("rows" in mutation)) continue;
    config.budget = { ...config.budget, allowlist: mutation.rows };
    backoff.delete(key);
    onExtended(target.cli, target.model);
  }
  return resumed;
}

/** Start the unref'd provider probe; returns its shutdown function. */
export function startProviderUsageLimitProbes(
  config: RepoOSConfig,
  logger: Pick<Logger, "system">,
  opts: { intervalMs?: number; probe?: (agent: Agent) => Promise<UsageProbeVerdict> } = {},
): () => void {
  const probe =
    opts.probe ??
    (async (agent: Agent): Promise<UsageProbeVerdict> => {
      const result = await runPrompt(
        agent,
        "Reply with OK only. Do not use tools. This is a one-token availability probe.",
        { cwd: config.root, timeoutMs: 45_000 },
      );
      const output = [result.output, result.error].filter(Boolean).join("\n");
      recordOneShotSession(config.root, agent, result, {
        sessionType: "usage-limit-probe",
        taskId: null,
      });
      return { ok: result.ok, output };
    });
  const backoff: UsageProbeBackoff = new Map();
  let running = false;
  const tick = async (): Promise<void> => {
    if (running || config.watchdog?.autoPauseOnUsageLimit === false) return;
    running = true;
    try {
      const persist = (): void => {
        patchTomlConfig(configTomlMutationPath(config.root, config.cacheDir), {
          "budget.allowlist": config.budget?.allowlist ?? [],
        });
        applyReloadedConfig({ config }, loadConfigAfterServerWrite(config.root, config.cacheDir));
      };
      const resumed = await probeExhaustedUsageLimitPairs(
        config,
        probe,
        (cli, model) => {
          persist();
          logger.system("info", "provider usage-limit probe succeeded; model resumed", {
            cli,
            model,
          });
        },
        Date.now(),
        backoff,
        (cli, model) => {
          persist();
          logger.system("info", "provider usage-limit probe extended the pause", {
            cli,
            model,
          });
        },
      );
      if (resumed.length)
        logger.system("info", "provider usage-limit probes resumed models", { resumed });
    } catch (error) {
      logger.system("warn", "provider usage-limit probe failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), opts.intervalMs ?? PROVIDER_USAGE_PROBE_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
