/**
 * 0215 — how the close-out failure reason is captured and recorded.
 *
 * The reason persisted on `.repoos/integration-jobs/<id>.json` used to carry
 * raw ANSI escapes and to truncate mid-word at the front (`check failed:
 * …eletion detected by…`). These tests pin the capture-side hygiene (ANSI
 * stripped, secrets redacted, whole-word truncation) and the recording of the
 * failing phase so the UI can tell a check failure from a conflict.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator, tailLine } from "../../server/integration-orchestrator.js";

describe("tailLine (reason capture)", () => {
  it("strips ANSI escapes so the stored reason renders as plain text", () => {
    const out = tailLine("\u001b[31merror\u001b[0m: boom\n\u001b[1m✗\u001b[0m", "");
    expect(out).toContain("error: boom");
    expect(out).not.toContain("\u001b[");
  });

  it("keeps the tail of the output, not the head", () => {
    const noise = Array.from({ length: 30 }, (_, i) => `noise ${i}`).join("\n");
    const out = tailLine(noise + "\nError: the real cause", "");
    expect(out).toContain("Error: the real cause");
    expect(out).not.toContain("noise 0");
  });

  it("redacts credential-shaped values from the stored reason", () => {
    const out = tailLine("check failed: token=ghp_AbCdEf123456", "");
    expect(out).not.toMatch(/ghp_/);
    expect(out).toContain("***");
  });

  it("never starts the excerpt mid-word when truncating (0215 regression)", () => {
    const chunk = "deletion detected by watcher ";
    const out = tailLine(chunk.repeat(200), "");
    expect(out.startsWith("…")).toBe(true);
    // The old code sliced 800 chars straight from the front, landing mid-word
    // (`…eletion detected by…`). The first word shown must be a whole word.
    const firstWord = out.slice(1).split(" ")[0]!;
    expect(chunk.trim().split(" ")).toContain(firstWord);
    expect(out).toContain("deletion detected by watcher");
  });
});

describe("failing phase recording (0215)", () => {
  let repo: string;

  const makeRepo = (): void => {
    repo = join(tmpdir(), `repoos-phase-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    mkdirSync(repo, { recursive: true });
    const git = `git -C ${repo}`;
    execSync(`${git} init`, { stdio: "ignore" });
    execSync(`${git} config user.email "t@e.com"`, { stdio: "ignore" });
    execSync(`${git} config user.name "T"`, { stdio: "ignore" });
    writeFileSync(join(repo, "README.md"), "# t\n");
    execSync(`${git} add README.md`, { stdio: "ignore" });
    execSync(`${git} commit -m init`, { stdio: "ignore" });
  };

  const cleanup = (): void => {
    try {
      rmSync(repo, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  it("records the failing phase (validating) alongside the failed status", async () => {
    makeRepo();
    try {
      const coordinator = createJobCoordinator(repo);
      coordinator.enqueue({ id: "0001", branch: "feat/x" } as never);
      coordinator.updateJob("0001", { phase: "validating" });

      const orch = new CloseOutOrchestrator({ root: repo } as never, coordinator);
      // Both gate attempts fail identically → a real failure, not machine load.
      (orch as never as Record<string, unknown>).validateCandidate = async () => ({
        ok: false,
        reason: "check failed: TypeError: boom",
      });
      (orch as never as Record<string, unknown>).publishCandidate = async () => ({ ok: true });

      const res = await orch.processNext();
      expect(res.ok).toBe(false);

      const job = coordinator.getJob("0001");
      expect(job?.phase).toBe("failed");
      expect(job?.failedPhase).toBe("validating");
      expect(job?.reason).toContain("check failed: TypeError: boom");
    } finally {
      cleanup();
    }
  });

  it("records the failing phase as publishing for a publish-time failure", async () => {
    makeRepo();
    try {
      const coordinator = createJobCoordinator(repo);
      coordinator.enqueue({ id: "0001", branch: "feat/x" } as never);
      coordinator.updateJob("0001", { phase: "publishing" });

      const orch = new CloseOutOrchestrator({ root: repo } as never, coordinator);
      (orch as never as Record<string, unknown>).publishCandidate = async () => ({
        ok: false,
        reason: "main has 1 uncommitted file at publish time",
      });

      const res = await orch.processNext();
      expect(res.ok).toBe(false);

      const job = coordinator.getJob("0001");
      expect(job?.phase).toBe("failed");
      expect(job?.failedPhase).toBe("publishing");
    } finally {
      cleanup();
    }
  });
});
