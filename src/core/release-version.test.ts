import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isNewerVersion } from "./release-version.js";

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? testFiles(path)
      : entry.isFile() && entry.name.endsWith(".test.ts")
        ? [path]
        : [];
  });
}

describe("installed upgrade version check", () => {
  it("does not hardcode the current package version in test fixtures", () => {
    const current = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string })
      .version;
    const exactVersion = new RegExp(
      `(["'])${current.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:\\1)`,
    );
    const offenders = testFiles("src")
      .filter((file) => exactVersion.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(`${process.cwd()}/`, ""));
    expect(offenders).toEqual([]);
  });

  it("detects a newer fake installed version without network access", () => {
    const installedVersion = "0.5.79";
    const runningVersion = "0.5.78";

    expect(isNewerVersion(installedVersion, runningVersion)).toBe(true);
    expect(isNewerVersion(runningVersion, runningVersion)).toBe(false);
  });
});
