import { c } from "../cli/colors.js";
import { loadConfig } from "../core/config.js";
import {
  inspectCrossProcessSlots,
  localCheckLockRoot,
  releaseLocalCheckSlot,
} from "../core/cross-process-slots.js";
import { readQueueMarkers } from "../core/local-queue-marker.js";
import { mainCheckoutRoot } from "../core/git.js";

export function cmdChecks(args: string[]): void {
  if (args[0] !== "slots") {
    console.error("Usage: repoos checks slots [--release SLOT --confirm PID]");
    process.exitCode = 2;
    return;
  }
  const config = loadConfig();
  let boardRoot = config.root;
  try {
    boardRoot = mainCheckoutRoot(config.root);
  } catch {
    /* standalone repository checkout */
  }
  const cacheDir = config.cacheDir ?? ".repoos";
  const root = localCheckLockRoot(boardRoot, cacheDir);
  const releaseAt = args.indexOf("--release");
  if (releaseAt >= 0) {
    const slot = Number(args[releaseAt + 1]);
    const confirmAt = args.indexOf("--confirm");
    const pid = Number(args[confirmAt + 1]);
    if (!Number.isInteger(slot) || slot < 0 || !Number.isInteger(pid) || pid <= 0) {
      console.error(
        "Release requires --release SLOT --confirm PID from the current holder listing.",
      );
      process.exitCode = 2;
      return;
    }
    try {
      const holder = inspectCrossProcessSlots(
        root,
        config.localChecks?.maxConcurrent ?? 2,
        config.localChecks?.staleAfterMs,
      ).find((item) => item.slot === slot);
      if (!holder?.pid) throw new Error(`slot ${slot} is free`);
      console.log(
        `Releasing slot ${slot}, held by task #${String(holder.meta?.taskId ?? "unknown")} check, PID ${holder.pid}${holder.dead ? ", dead" : holder.wedged ? ", wedged" : ", alive"}.`,
      );
      releaseLocalCheckSlot(root, slot, pid, config.localChecks?.staleAfterMs);
      console.log(c.green("  ✔ Slot released."));
    } catch (error) {
      console.error(c.red("  ✗ ") + (error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
    return;
  }
  const holders = inspectCrossProcessSlots(
    root,
    config.localChecks?.maxConcurrent ?? 2,
    config.localChecks?.staleAfterMs,
  );
  for (const holder of holders) {
    const task = holder.meta?.taskId
      ? `#${String(holder.meta.taskId)} check`
      : "unattributed check";
    console.log(
      holder.pid
        ? `slot ${holder.slot}: ${task}, pid ${holder.pid}, ${holder.dead ? "dead, reclaiming" : holder.wedged ? "wedged" : "alive"}, held ${Math.round(holder.ageMs / 1000)}s, heartbeat ${Math.round(holder.heartbeatAgeMs / 1000)}s ago`
        : `slot ${holder.slot}: free`,
    );
  }
  for (const marker of readQueueMarkers(boardRoot, cacheDir)
    .filter((entry) => entry.kind === "local-check")
    .sort((a, b) => a.position - b.position)) {
    const waitingMs = Math.max(0, Date.now() - Date.parse(marker.since));
    console.log(
      `queue position ${marker.position}: #${marker.taskId}, waiting ${Math.round(waitingMs / 1000)}s`,
    );
  }
}
