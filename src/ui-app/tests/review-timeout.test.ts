import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { reviewPassActivitySummary } from "../../core/review-passes.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { REVIEW_RUN_TRIGGERS } from "../../server/review-automation.js";
import {
  DEFAULT_REVIEW_TIMEOUT_MINUTES,
  MAX_REVIEW_TIMEOUT_MINUTES,
  ReviewManager,
  classifyReviewRunFailure,
  formatReviewTimeout,
  reviewTimeoutMinutes,
  reviewTimeoutRetryAllowed,
  reviewTimeoutRetryAttempts,
} from "../../server/review.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function withToml(contents: string): RepoOSConfig {
  const root = mkdtempSync(join(tmpdir(), "repoos-review-timeout-"));
  tempDirs.push(root);
  writeFileSync(join(root, "repoos.toml"), contents);
  return loadConfig(root);
}

const task = (extra: Record<string, unknown> = {}): Task => ({ id: "0001", extra }) as Task;

describe("review timeout config (#1019)", () => {
  it("defaults to 15 minutes and clamps configured values", () => {
    expect(reviewTimeoutMinutes({} as RepoOSConfig)).toBe(DEFAULT_REVIEW_TIMEOUT_MINUTES);
    expect(reviewTimeoutMinutes({ review: {} } as RepoOSConfig)).toBe(15);
    expect(reviewTimeoutMinutes({ review: { timeoutMinutes: 45 } } as RepoOSConfig)).toBe(45);
    expect(reviewTimeoutMinutes({ review: { timeoutMinutes: 999 } } as RepoOSConfig)).toBe(
      MAX_REVIEW_TIMEOUT_MINUTES,
    );
    expect(reviewTimeoutMinutes({ review: { timeoutMinutes: 0 } } as RepoOSConfig)).toBe(15);
  });

  it("loads review.timeoutMinutes from repoos.toml", () => {
    expect(withToml("[review]\ntimeoutMinutes = 45\n").review?.timeoutMinutes).toBe(45);
    // Invalid values keep the safe default rather than failing config load.
    expect(withToml("[review]\ntimeoutMinutes = 0\n").review?.timeoutMinutes).toBe(15);
  });

  it("is a live Settings field and a supported TOML key", () => {
    const field = getConfigSchema().find((f) => f.key === "review.timeoutMinutes");
    expect(field).toMatchObject({
      type: "number",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_REVIEW_TIMEOUT_MINUTES,
      min: 1,
      step: 1,
    });
    expect(SUPPORTED_TOML_KEYS).toContain("review.timeoutMinutes");
  });
});

describe("review timeout classification (#1019)", () => {
  it("distinguishes a timeout from a silent exit", () => {
    expect(classifyReviewRunFailure(true, false)).toBe("timeout");
    expect(classifyReviewRunFailure(true, true)).toBe("timeout");
    expect(classifyReviewRunFailure(false, true)).toBe("ok");
    expect(classifyReviewRunFailure(false, false)).toBe("no-output");
  });

  it("says what the activity log and Review tab show", () => {
    expect(formatReviewTimeout(15)).toBe("15 minutes");
    expect(formatReviewTimeout(1)).toBe("1 minute");
    expect(
      reviewPassActivitySummary(2, "failed", null, undefined, {
        minutes: 15,
        retrying: true,
      }),
    ).toBe("review pass 2: timed out after 15 minutes — no report (retrying once automatically)");
    expect(
      reviewPassActivitySummary(2, "failed", null, undefined, {
        minutes: 15,
        retrying: false,
      }),
    ).toBe("review pass 2: timed out after 15 minutes — no report; human needed");
    // A reviewer that exited without a report keeps its original wording.
    expect(reviewPassActivitySummary(1, "failed", null)).toBe(
      "review pass 1: failed — no usable report",
    );
  });

  it("allows exactly one automatic retry", () => {
    expect(reviewTimeoutRetryAttempts(task())).toBe(0);
    expect(reviewTimeoutRetryAllowed(task())).toBe(true);
    const retried = task({ review_timeout_retries: 1 });
    expect(reviewTimeoutRetryAttempts(retried)).toBe(1);
    expect(reviewTimeoutRetryAllowed(retried)).toBe(false);
  });

  it("persists the timeout flag for the Review tab and activity note", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-review-timeout-store-"));
    tempDirs.push(root);
    const absPath = join(root, "work", "0001.md");
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(
      absPath,
      '---\nid: "0001"\ntitle: Timeout store test\ntype: bug\nstatus: review\npriority: p1\narea: server\nassigned_to: ai\ncreated_at: "2026-11-04T00:00:00Z"\nupdated_at: "2026-11-04T00:00:00Z"\n---\n\nBody.\n',
    );
    const taskRow = { id: "0001", status: "review", path: "work/0001.md", absPath } as Task;
    const config = { root, cacheDir: ".repoos" } as RepoOSConfig;
    const reviews = new ReviewManager(config, () => {});
    const write = (
      reviews as unknown as {
        write: (report: unknown, task: Task, retrying?: boolean) => Promise<void>;
      }
    ).write.bind(reviews);
    await write(
      {
        id: "0001",
        at: "2026-11-04T00:15:00Z",
        agent: "reviewer",
        cli: "opencode",
        model: "slow-model",
        branch: "",
        state: "failed",
        timedOut: true,
        timeoutMinutes: 15,
        markdown: "Review timed out after 15 minutes before it produced a report.",
      },
      taskRow,
      true,
    );
    expect(reviews.read("0001")).toMatchObject({
      state: "failed",
      timedOut: true,
      timeoutMinutes: 15,
      markdown: "Review timed out after 15 minutes before it produced a report.",
    });
    expect(readFileSync(absPath, "utf8")).toContain(
      "review pass 1: timed out after 15 minutes — no report (retrying once automatically)",
    );
  });

  it("schedules one retry, persists the bound, and never loops", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-review-timeout-retry-"));
    tempDirs.push(root);
    const absPath = join(root, "work", "0001.md");
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(
      absPath,
      '---\nid: "0001"\nstatus: review\ncreated_at: "2026-11-04T00:00:00Z"\n---\n\nBody.\n',
    );
    const taskRow = {
      id: "0001",
      status: "review",
      path: "work/0001.md",
      absPath,
      extra: {},
    } as Task;
    const config = {
      root,
      cacheDir: ".repoos",
      review: { timeoutMinutes: 15 },
    } as RepoOSConfig;
    const index = { getTask: () => taskRow };
    const reviews = new ReviewManager(config, () => {}, undefined, index as never);
    const run = vi.spyOn(reviews as unknown as { run: () => Promise<unknown> }, "run");
    run.mockResolvedValue({ ok: true });
    vi.useFakeTimers();
    try {
      const schedule = (
        reviews as unknown as {
          scheduleTimeoutRetry: (task: Task, minutes: number) => void;
        }
      ).scheduleTimeoutRetry.bind(reviews);
      schedule(taskRow, 15);
      // A second timeout in the same episode must not queue another retry.
      schedule(taskRow, 15);
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0]?.[1]).toMatchObject({ trigger: REVIEW_RUN_TRIGGERS.TIMEOUT_RETRY });
      expect(readFileSync(absPath, "utf8")).toContain("review_timeout_retries: 1");
    } finally {
      vi.useRealTimers();
    }
  });
});
