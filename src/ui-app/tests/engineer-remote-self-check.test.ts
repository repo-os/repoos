import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCheckStore, resetCheckStore } from "../../core/check-store.js";
import {
  engineerSelfCheckRemoteEnabled,
  runEngineerRemoteSelfCheckGate,
} from "../../server/engineer-remote-self-check.js";
import * as preReview from "../../server/pre-review-remote-gate.js";
import * as remoteValidation from "../../server/remote-validation.js";
import type { RepoOSConfig } from "../../core/types.js";
import { shouldRunCliRemotePreReviewGate } from "../../server/pre-review-remote-gate.js";
import { readCheckGateLock } from "../../server/check-gate-lock.js";

function makeConfig(root: string, rv: Record<string, unknown>): RepoOSConfig {
  return {
    root,
    cacheDir: ".repoos",
    workDir: "work",
    remoteValidation: { enabled: true, provider: "tailscale", ...rv },
  } as RepoOSConfig;
}

describe("engineer remote self-check (#0694)", () => {
  it("defaults engineerSelfCheckRemote on when remote validation is enabled", () => {
    expect(engineerSelfCheckRemoteEnabled(makeConfig("/x", {}))).toBe(true);
    expect(
      engineerSelfCheckRemoteEnabled(makeConfig("/x", { engineerSelfCheckRemote: false })),
    ).toBe(false);
  });

  it("shouldRunEngineerRemoteSelfCheck aliases the CLI gate predicate", () => {
    const hetzner = makeConfig("/x", { provider: "hetzner" });
    expect(
      shouldRunCliRemotePreReviewGate(
        hetzner,
        { changedRef: "main" },
        { REPOOS_AGENT: "1", REPOOS_TASK_ID: "0694" },
      ),
    ).toBe(true);
    expect(shouldRunCliRemotePreReviewGate(hetzner, {}, {})).toBe(false);
  });

  it("runEngineerRemoteSelfCheckGate creates one validator and disposes it once", async () => {
    const dispose = vi.fn(async () => {});
    vi.spyOn(remoteValidation, "createRemoteValidator").mockReturnValue({
      validate: vi.fn(),
      dispose,
      reconcile: async () => {},
      logPath: () => "",
    } as never);
    const root = mkdtempSync(join(tmpdir(), "repoos-0694-gate-"));
    const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
    git(["init", "-q", "-b", "feat/0694"]);
    git(["config", "user.email", "t@example.com"]);
    git(["config", "user.name", "Test"]);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "repoos.toml"), 'work_dir = "work"\n');
    git(["add", "-A"]);
    git(["commit", "-qm", "init"]);
    let lockDuringRemote: unknown;
    vi.spyOn(preReview, "runRemotePreReviewGate").mockImplementation(async () => {
      lockDuringRemote = readCheckGateLock(root, ".repoos", "0694");
      return { kind: "local-only", skipTests: true };
    });
    const cfg = makeConfig(root, { enabled: true, provider: "hetzner" });
    const prevStore = process.env.REPOOS_CHECK_STORE_ROOT;
    process.env.REPOOS_CHECK_STORE_ROOT = root;
    try {
      await runEngineerRemoteSelfCheckGate({
        worktreeConfig: cfg,
        worktreePath: root,
        taskId: "0694",
      });
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(lockDuringRemote).toMatchObject({ taskId: "0694" });
      expect(readCheckGateLock(root, ".repoos", "0694")).toBeNull();
    } finally {
      if (prevStore === undefined) delete process.env.REPOOS_CHECK_STORE_ROOT;
      else process.env.REPOOS_CHECK_STORE_ROOT = prevStore;
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
