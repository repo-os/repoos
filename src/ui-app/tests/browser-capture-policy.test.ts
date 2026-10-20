import { describe, expect, it, vi } from "vitest";
import type { RepoOSConfig } from "../../core/types.js";
import {
  BrowserEvidenceUnavailableError,
  recordBrowserCaptureActivity,
  runBrowserCaptureWithPolicy,
  validateBrowserEvidenceArtifacts,
  type BrowserEvidenceArtifacts,
} from "../../server/browser-capture-policy.js";

function config(mode: "local" | "runner-available" | "runner-only"): RepoOSConfig {
  return {
    root: "/tmp/repoos-test",
    workDir: "work",
    cacheDir: ".repoos",
    remoteValidation: { enabled: true, browserCaptureMode: mode },
  } as RepoOSConfig;
}

const request = {
  taskId: "0854",
  worktreePath: "/tmp/repoos-test-worktree",
  branch: "feat/test",
  candidateSha: "abc123",
  operation: "shots" as const,
};

function artifacts(overrides: Partial<BrowserEvidenceArtifacts> = {}): BrowserEvidenceArtifacts {
  return {
    version: 1,
    taskId: request.taskId,
    ok: true,
    detail: "captured",
    results: { shots: { status: "captured" } },
    files: [],
    ...overrides,
  };
}

describe("browser capture runner policy", () => {
  it("records remote success and failure in task activity and the task note", () => {
    const log = vi.fn();
    const addTaskNote = vi.fn();
    recordBrowserCaptureActivity("0854", true, "shots: captured 2 screenshots", log, addTaskNote);
    recordBrowserCaptureActivity(
      "0854",
      false,
      "ui verification failed: missing target",
      log,
      addTaskNote,
    );
    expect(log).toHaveBeenNthCalledWith(1, "0854", "info", "shots: captured 2 screenshots");
    expect(log).toHaveBeenNthCalledWith(
      2,
      "0854",
      "error",
      "ui verification failed: missing target",
    );
    expect(addTaskNote.mock.calls.map(([message]) => message)).toEqual([
      "shots: captured 2 screenshots",
      "ui verification failed: missing target",
    ]);
  });

  it("uses the runner and imports returned artifacts", async () => {
    const capture = vi.fn(async () => artifacts());
    const useArtifacts = vi.fn(async (result) => result.detail);
    const local = vi.fn(async () => "local");
    const result = await runBrowserCaptureWithPolicy({
      config: config("runner-available"),
      request,
      transport: { capture },
      local,
      useArtifacts,
      note: vi.fn(),
    });
    expect(result).toBe("captured");
    expect(capture).toHaveBeenCalledWith(request);
    expect(useArtifacts).toHaveBeenCalledOnce();
    expect(local).not.toHaveBeenCalled();
  });

  it.each([
    [
      "missing browser",
      async () => {
        throw new BrowserEvidenceUnavailableError("WebKit is not installed", true);
      },
    ],
    [
      "runner failure",
      async () => {
        throw new Error("runner unavailable");
      },
    ],
  ])("falls back locally with a visible note after %s", async (_label, capture) => {
    const note = vi.fn();
    const local = vi.fn(async () => "local");
    await expect(
      runBrowserCaptureWithPolicy({
        config: config("runner-available"),
        request,
        transport: { capture },
        local,
        useArtifacts: vi.fn(),
        note,
      }),
    ).resolves.toBe("local");
    expect(local).toHaveBeenCalledOnce();
    expect(note).toHaveBeenCalledWith(expect.stringContaining("falling back to local capture"));
  });

  it("keeps declared-shot failures as capture failures without local fallback", async () => {
    const local = vi.fn(async () => "local");
    const useArtifacts = vi.fn(async (result) => {
      if (!result.ok) throw new Error("declared shot not captured — missing selector .target");
      return "remote";
    });
    await expect(
      runBrowserCaptureWithPolicy({
        config: config("runner-available"),
        request,
        transport: { capture: async () => artifacts({ ok: false }) },
        local,
        useArtifacts,
        note: vi.fn(),
      }),
    ).rejects.toThrow("declared shot not captured — missing selector .target");
    expect(local).not.toHaveBeenCalled();
  });

  it("runner-only reports an unavailable runner without starting local browser work", async () => {
    const local = vi.fn(async () => "local");
    const note = vi.fn();
    await expect(
      runBrowserCaptureWithPolicy({
        config: config("runner-only"),
        request,
        local,
        note,
        useArtifacts: vi.fn(),
      }),
    ).rejects.toThrow(
      "runner-only browser capture failed: no remote browser capture transport is available",
    );
    expect(local).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
  });

  it("rejects unsafe or oversized artifact payloads", () => {
    expect(
      validateBrowserEvidenceArtifacts(
        artifacts({ files: [{ name: "../secret", data: "YQ==" }] }),
        request.taskId,
      ),
    ).toBeNull();
    expect(
      validateBrowserEvidenceArtifacts({ ...artifacts(), taskId: "other" }, request.taskId),
    ).toBeNull();
  });
});
