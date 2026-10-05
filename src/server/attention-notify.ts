/**
 * Server hooks so session/release events can bump the unified attention feed
 * (#0687) without threading callbacks through every subsystem.
 */
import { getRepoOSDb } from "../core/db.js";
import { isProviderFailureReason } from "../core/attention.js";
import type { RepoOSConfig } from "../core/types.js";
import type { AttentionEventStore } from "./attention-events.js";

type BumpFn = () => void;

let attentionEvents: AttentionEventStore | null = null;
let bumpAttention: BumpFn | null = null;
/** Last provider-reported total seen while evaluating spend alerts (per process). */
let lastSpendTotal: number | null = null;

export function wireAttentionNotifications(store: AttentionEventStore, bump: BumpFn): void {
  attentionEvents = store;
  bumpAttention = bump;
}

export function notifyAttentionAgentStalled(taskId: string): void {
  bumpAttention?.();
}

/** After a session row is written — provider failures and spend-threshold crossings. */
export function notifyAttentionAfterSession(
  config: Pick<RepoOSConfig, "root" | "cacheDir" | "attention">,
  opts: {
    sessionId: string;
    taskId?: string | null;
    status: string;
    errorReason?: string | null;
    endedAt: string;
  },
): void {
  try {
    if (opts.status === "errored" && isProviderFailureReason(opts.errorReason) && attentionEvents) {
      attentionEvents.record({
        id: `providerFailure:${opts.sessionId}`,
        kind: "providerFailure",
        taskId: opts.taskId ?? null,
        message: opts.taskId ? `Provider error on #${opts.taskId}` : "Provider error",
        detail: (opts.errorReason ?? "").trim().slice(0, 160) || "Provider or credit failure.",
        at: opts.endedAt,
      });
      bumpAttention?.();
    }

    const threshold = config.attention?.spendAlertUsd ?? 0;
    if (threshold <= 0) {
      lastSpendTotal = null;
      return;
    }
    const total = getRepoOSDb(config.root)?.getBoardStats("all").totalCostUsd ?? null;
    if (total == null) return;
    const wasBelow = lastSpendTotal === null || lastSpendTotal < threshold;
    lastSpendTotal = total;
    if (wasBelow && total >= threshold) bumpAttention?.();
  } catch {
    /* attention must never break session recording */
  }
}

export function notifyAttentionReleaseNotesTerminal(): void {
  bumpAttention?.();
}
