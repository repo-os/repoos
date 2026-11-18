import { afterEach, describe, expect, it, vi } from "vitest";
import { cmdList } from "../../commands/tasks.js";

describe("repoos list argument validation", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("rejects an unknown status with valid choices and usage", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await cmdList("nonsense");

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Unknown list status: nonsense"));
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("inbox | ready | active | review | done | archived"),
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Usage: repoos list [status]"));
  });
});
