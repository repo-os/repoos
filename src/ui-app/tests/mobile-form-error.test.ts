import { describe, expect, it } from "vitest";
import { errorAfterServerUrlInput } from "../../../mobile/src/form-validation.js";
import { lockOverlayShouldRemainOpen } from "../../../mobile/src/lock-state.js";
import { serverToOpenAfterLockRetry } from "../../../mobile/src/lock-context.js";

describe("Hub add-server URL validation", () => {
  it("clears a missing URL error as soon as a URL is entered", () => {
    expect(errorAfterServerUrlInput("Enter a server URL.", "https://dev.repoos.org")).toBe("");
  });

  it("keeps the validation error while the URL remains blank", () => {
    expect(errorAfterServerUrlInput("Enter a server URL.", "  ")).toBe("Enter a server URL.");
  });
});

describe("Hub device lock", () => {
  it("keeps the app covered after authentication fails", () => {
    expect(lockOverlayShouldRemainOpen(false)).toBe(true);
  });

  it("unlocks after authentication succeeds", () => {
    expect(lockOverlayShouldRemainOpen(true)).toBe(false);
  });

  it("replays the pending server open after a successful retry only", () => {
    const server = {
      id: "server-1",
      url: "https://repoos.example",
      name: "repoos",
      order: 0,
      createdAt: 1,
    };
    const context = { kind: "server" as const, server };

    expect(serverToOpenAfterLockRetry(context, false)).toBeNull();
    expect(serverToOpenAfterLockRetry(context, true)).toBe(server);
    expect(serverToOpenAfterLockRetry({ kind: "reopen" }, true)).toBeNull();
  });
});
