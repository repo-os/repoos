import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./release-version.js";

describe("installed upgrade version check", () => {
  it("detects a newer fake installed version without network access", () => {
    const installedVersion = "0.5.79";
    const runningVersion = "0.5.78";

    expect(isNewerVersion(installedVersion, runningVersion)).toBe(true);
    expect(isNewerVersion(runningVersion, runningVersion)).toBe(false);
  });
});
