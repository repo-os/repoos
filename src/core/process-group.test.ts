import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setProcessGroupSignalFailureHandler,
  terminateProcessGroupAndWait,
} from "./process-group.js";

describe("terminateProcessGroupAndWait", () => {
  afterEach(() => {
    setProcessGroupSignalFailureHandler(null);
    vi.restoreAllMocks();
  });

  it.each(["EPERM", "ESRCH"])("contains %s from a cleanup signal", async (code) => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error(`kill failed: ${code}`), { code });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(terminateProcessGroupAndWait(43210)).resolves.toBeUndefined();
    expect(kill).toHaveBeenCalledWith(-43210, "SIGTERM");
    expect(kill).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("process group 43210"));
  });

  it("does not keep polling when the group probe reports EPERM", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === -43210 && signal === "SIGTERM") return true;
      throw Object.assign(new Error("kill failed: EPERM"), { code: "EPERM" });
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(terminateProcessGroupAndWait(43210, { pollMs: 1 })).resolves.toBeUndefined();
    expect(kill).toHaveBeenCalledTimes(2);
  });

  it("reports task context for the durable server attention notice", async () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("kill failed: EPERM"), { code: "EPERM" });
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onFailure = vi.fn();
    setProcessGroupSignalFailureHandler(onFailure);

    await terminateProcessGroupAndWait(43210, { taskId: "1079" });

    expect(onFailure).toHaveBeenCalledWith({
      leaderPid: 43210,
      code: "EPERM",
      signal: "SIGTERM",
      taskId: "1079",
    });
  });
});
