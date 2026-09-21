import { describe, expect, it } from "vitest";
import { explainBindFailure } from "../../server/server.js";

describe("server bind diagnostics", () => {
  it("does not mislabel Bun's false EADDRINUSE as a port conflict", () => {
    const bunError = Object.assign(new Error("Failed to start server. Is port 7171 in use?"), {
      code: "EADDRINUSE",
    });

    expect(explainBindFailure(bunError, 7171, "127.0.0.1", false).message).toContain(
      "it is not a port collision",
    );
  });

  it("preserves a real address-in-use error when a listener is reachable", () => {
    const bindError = Object.assign(new Error("address already in use"), { code: "EADDRINUSE" });

    expect(explainBindFailure(bindError, 7171, "127.0.0.1", true)).toBe(bindError);
  });
});
