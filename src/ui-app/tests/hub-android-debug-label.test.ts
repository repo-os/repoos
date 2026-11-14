import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../../..");

function readStringsXml(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("Hub Android debug launcher label", () => {
  it("overrides app_name and title only in the debug source set", () => {
    const debug = readStringsXml("mobile/android/app/src/debug/res/values/strings.xml");
    expect(debug).toContain('name="app_name">RepoOS Hub Dev</string>');
    expect(debug).toContain('name="title_activity_main">RepoOS Hub Dev</string>');

    const main = readStringsXml("mobile/android/app/src/main/res/values/strings.xml");
    expect(main).toContain('name="app_name">RepoOS Hub</string>');
    expect(main).toContain('name="title_activity_main">RepoOS Hub</string>');
    expect(main).not.toContain("RepoOS Hub Dev");
  });
});
