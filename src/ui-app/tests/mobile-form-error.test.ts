import { describe, expect, it } from "vitest";
import { errorAfterServerUrlInput } from "../../../mobile/src/form-validation.js";
import { lockOverlayShouldRemainOpen } from "../../../mobile/src/lock.js";

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
});
