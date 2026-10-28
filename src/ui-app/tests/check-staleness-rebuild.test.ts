import { beforeEach, describe, expect, it, vi } from "vitest";

const build = vi.hoisted(() => ({ stale: [] as boolean[] }));
const run = vi.hoisted(() => ({ status: "passed" as "passed" | "failed", calls: [] as string[] }));

vi.mock("../../core/build.js", async (orig) => ({
  ...(await orig<typeof import("../../core/build.js")>()),
  checkBuildForRoot: () => {
    const stale = build.stale.shift() ?? false;
    return stale
      ? { stale: true, applicable: true, code: "stale", message: "Stale build" }
      : { stale: false, applicable: true, code: "fresh" };
  },
}));
vi.mock("../../core/check-runner.js", async (orig) => ({
  ...(await orig<typeof import("../../core/check-runner.js")>()),
  runCommand: async ({ command }: { command: string }) => {
    run.calls.push(command);
    return { status: run.status, output: "build log", exitCode: run.status === "passed" ? 0 : 1 };
  },
}));

const { stepStaleness } = await import("../../commands/check.js");
const ctx = { repoRoot: "/repo", cwd: "/repo", env: {} } as Parameters<typeof stepStaleness>[0];

describe("staleness step rebuilds instead of failing (2026-10-28)", () => {
  beforeEach(() => {
    run.calls = [];
    run.status = "passed";
  });

  it("passes without building when the build is fresh", async () => {
    build.stale = [false];
    expect((await stepStaleness(ctx)).status).toBe("passed");
    expect(run.calls).toEqual([]);
  });

  it("runs the build and passes when the build was stale", async () => {
    // The shared-build claim re-reads staleness before the step does.
    build.stale = [true, true, false];
    const out = await stepStaleness(ctx);
    expect(run.calls).toEqual(["bun run build"]);
    expect(out.status).toBe("passed");
  });

  it("fails with the build output when the rebuild fails", async () => {
    build.stale = [true, true, true];
    run.status = "failed";
    const out = await stepStaleness(ctx);
    expect(out.status).toBe("failed");
    expect(out.detail).toMatch(/Automatic `bun run build` failed/);
  });
});
