import { describe, expect, it } from "vitest";
import { TestRunManager } from "./test-run.js";

describe("TestRunManager", () => {
  it("begin rejects a second run while one is in progress", () => {
    const mgr = new TestRunManager();
    expect(mgr.begin()).toEqual({ ok: true });
    expect(mgr.begin()).toEqual({ ok: false, reason: "a test run is already in progress" });
    mgr.finish(0);
  });

  it("appendOutput caps retained text", () => {
    const mgr = new TestRunManager();
    mgr.begin();
    mgr.appendOutput("x".repeat(3_000_000));
    expect(mgr.getState().output.length).toBeLessThanOrEqual(2_000_000);
    mgr.finish(0);
  });

  it("finish records exit code and clears running", () => {
    const mgr = new TestRunManager();
    mgr.begin();
    mgr.appendOutput("log\n");
    mgr.finish(2);
    const s = mgr.getState();
    expect(s.running).toBe(false);
    expect(s.code).toBe(2);
    expect(s.output).toBe("log\n");
    expect(s.finishedAt).toBeTruthy();
  });
});
