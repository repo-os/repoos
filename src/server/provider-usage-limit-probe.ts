/** Periodically verify exhausted providers with a tiny prompt, then unpause. */
import type { Agent, RepoOSConfig } from "../core/types.js";
import { applyReloadedConfig, patchTomlConfig } from "../core/config.js";
import { pairPauseInfo, resumeAllowlistEntry } from "../core/budget-allowlist.js";
import { recordOneShotSession, runPrompt } from "./agents.js";
import type { Logger } from "../core/logger.js";
import { configTomlMutationPath, loadConfigAfterServerWrite } from "./preview-config-isolation.js";

export const PROVIDER_USAGE_PROBE_INTERVAL_MS = 10 * 60_000;

/** Probe each automatically exhausted pair once; manual pauses are untouched. */
export async function probeExhaustedUsageLimitPairs(
  config: RepoOSConfig,
  probe: (agent: Agent) => Promise<boolean>,
  onResume: (cli: string, model: string) => void = () => {},
  now = Date.now(),
): Promise<string[]> {
  const rows = config.budget?.allowlist ?? [];
  const resumed: string[] = [];
  for (const row of rows) {
    for (const pause of row.pausedModels ?? []) {
      if (!pause.pausedReason?.startsWith("out of usage since ")) continue;
      const pauseInfo = pairPauseInfo(rows, row.cli, pause.model, now);
      if (pauseInfo.until && Date.parse(pauseInfo.until) > now) continue;
      if (!pauseInfo.paused) continue;
      const agent: Agent = {
        name: `${row.cli}-${pause.model}`,
        cli: row.cli,
        model: pause.model,
        enabled: true,
      };
      if (!(await probe(agent))) continue;
      const mutation = resumeAllowlistEntry(config.budget?.allowlist ?? [], {
        cli: row.cli,
        model: pause.model,
      });
      if (!("rows" in mutation)) continue;
      config.budget = { ...config.budget, allowlist: mutation.rows };
      resumed.push(`${row.cli} + ${pause.model}`);
      onResume(row.cli, pause.model);
    }
  }
  return resumed;
}

/** Start the unref'd 10-minute provider probe; returns its shutdown function. */
export function startProviderUsageLimitProbes(
  config: RepoOSConfig,
  logger: Pick<Logger, "system">,
  opts: { intervalMs?: number; probe?: (agent: Agent) => Promise<boolean> } = {},
): () => void {
  const probe =
    opts.probe ??
    (async (agent: Agent): Promise<boolean> => {
      const result = await runPrompt(
        agent,
        "Reply with OK only. Do not use tools. This is a one-token availability probe.",
        { cwd: config.root, timeoutMs: 45_000 },
      );
      recordOneShotSession(config.root, agent, result, {
        sessionType: "usage-limit-probe",
        taskId: null,
      });
      return result.ok;
    });
  let running = false;
  const tick = async (): Promise<void> => {
    if (running || config.watchdog?.autoPauseOnUsageLimit === false) return;
    running = true;
    try {
      const resumed = await probeExhaustedUsageLimitPairs(config, probe, (cli, model) => {
        patchTomlConfig(configTomlMutationPath(config.root, config.cacheDir), {
          "budget.allowlist": config.budget?.allowlist ?? [],
        });
        applyReloadedConfig({ config }, loadConfigAfterServerWrite(config.root, config.cacheDir));
        logger.system("info", "provider usage-limit probe succeeded; model resumed", {
          cli,
          model,
        });
      });
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
