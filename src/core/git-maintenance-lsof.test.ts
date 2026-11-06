/**
 * lsof holder probe behavior for index.lock maintenance (#1041).
 */
import * as childProcess from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeLsofIndexLockHolder } from "./git-maintenance.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("probeLsofIndexLockHolder", () => {
  it("treats lsof exit 1 as no holder", () => {
    const exec = vi.spyOn(childProcess, "execFileSync").mockImplementation(() => {
      const err = new Error("lsof") as Error & { status?: number };
      err.status = 1;
      throw err;
    });
    expect(probeLsofIndexLockHolder("/tmp/.git/index.lock")).toBe(false);
    exec.mockRestore();
  });

  it("treats missing lsof as live holder and logs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exec = vi.spyOn(childProcess, "execFileSync").mockImplementation(() => {
      const err = new Error("ENOENT") as Error & { status?: number };
      err.status = 127;
      throw err;
    });
    expect(probeLsofIndexLockHolder("/x/.git/index.lock")).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/index\.lock holder probe failed/));
    warn.mockRestore();
    exec.mockRestore();
  });
});
