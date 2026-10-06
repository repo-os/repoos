import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCheckStore, resetCheckStore } from "../../core/check-store.js";
import {
  engineerSelfCheckRemoteEnabled,
  findReusableRemotePreReviewPass,
  remoteOutcomeFromReuse,
  shouldRunEngineerRemoteSelfCheck,
} from "../../server/engineer-remote-self-check.js";
import type { RepoOSConfig } from "../../core/types.js";

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

  it("shouldRunEngineerRemoteSelfCheck allows managed engineers on Hetzner", () => {
    const hetzner = makeConfig("/x", { provider: "hetzner" });
    expect(
      shouldRunEngineerRemoteSelfCheck(
        hetzner,
        { changedRef: "main" },
        { REPOOS_AGENT: "1", REPOOS_TASK_ID: "0694" },
      ),
    ).toBe(true);
    expect(shouldRunEngineerRemoteSelfCheck(hetzner, {}, {})).toBe(false);
  });

  it("findReusableRemotePreReviewPass matches task, sha, and green remote row", () => {
    resetCheckStore();
    const root = mkdtempSync(join(tmpdir(), "repoos-0694-reuse-"));
    const store = getCheckStore(root, ".repoos");
    store.record({
      taskId: "0694",
      phase: "pre-review",
      candidateSha: "abc123",
      machine: "bee",
      remote: true,
      scope: "full",
      startedAt: new Date().toISOString(),
      durationMs: 42_000,
      outcome: "pass",
    });
    store.record({
      taskId: "0694",
      phase: "pre-review",
      candidateSha: "deadbeef",
      machine: "bee",
      remote: true,
      scope: "full",
      startedAt: new Date().toISOString(),
      durationMs: 1000,
      outcome: "pass",
    });
    expect(
      findReusableRemotePreReviewPass(root, ".repoos", {
        taskId: "0694",
        candidateSha: "abc123",
      })?.machine,
    ).toBe("bee");
    expect(
      findReusableRemotePreReviewPass(root, ".repoos", {
        taskId: "0694",
        candidateSha: "nope",
      }),
    ).toBeNull();
    const reused = remoteOutcomeFromReuse({
      machine: "bee",
      durationMs: 42_000,
    } as never);
    expect(reused.kind).toBe("local-only");
    if (reused.kind === "local-only") {
      expect(reused.detail).toMatch(/reusing green remote self-check on bee/);
    }
  });
});
