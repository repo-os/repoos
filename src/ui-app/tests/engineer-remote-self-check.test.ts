import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
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
    vi.spyOn(preReview, "runRemotePreReviewGate").mockResolvedValue({
      kind: "local-only",
      skipTests: true,
    });
    const root = mkdtempSync(join(tmpdir(), "repoos-0694-gate-"));
    const cfg = makeConfig(root, { enabled: true, provider: "hetzner" });
    await runEngineerRemoteSelfCheckGate({
      worktreeConfig: cfg,
      worktreePath: root,
      taskId: "0694",
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
