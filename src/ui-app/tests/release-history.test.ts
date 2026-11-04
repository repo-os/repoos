import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CHANGELOG_FILE,
  RELEASE_HISTORY_FILE,
  readReleaseHistory,
  releaseDate,
  renderChangelog,
  renderDefaultReleaseNotes,
  upsertRelease,
  writeReleaseSurfaces,
  type ReleaseHistoryEntry,
} from "../../server/release-history.js";
import { CURRENT_RELEASE, releaseStamp } from "../../../shared/release.js";
import { renderLlmsTxt } from "../../../landing/vite-plugin-llms-txt.js";
import { llmsIndexTemplate } from "../../../user-docs/.vitepress/llms-index.js";

const repoRoot = process.cwd();
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-release-history-"));
  roots.push(root);
  return root;
}

function entry(patch: Partial<ReleaseHistoryEntry> = {}): ReleaseHistoryEntry {
  return {
    version: "0.5.76",
    tag: "v0.5.76",
    date: "2026-11-04",
    notes: "A quieter board.",
    ...patch,
  };
}

describe("release history surfaces", () => {
  it("writes the structured history and its markdown rendering", () => {
    const root = scratch();
    const written = writeReleaseSurfaces(root, entry());
    expect(written).toEqual({ paths: [RELEASE_HISTORY_FILE, CHANGELOG_FILE], changed: true });
    expect(readReleaseHistory(root).releases).toEqual([entry()]);
    const changelog = readFileSync(join(root, CHANGELOG_FILE), "utf8");
    expect(changelog).toContain("## [v0.5.76] - 2026-11-04");
    expect(changelog).toContain("A quieter board.");
    expect(changelog).toContain("https://github.com/repo-os/repoos/releases/tag/v0.5.76");
  });

  it("is idempotent and replaces the entry on a retried cut", () => {
    const root = scratch();
    writeReleaseSurfaces(root, entry());
    expect(writeReleaseSurfaces(root, entry()).changed).toBe(false);
    const retried = writeReleaseSurfaces(root, entry({ notes: "Edited notes." }));
    expect(retried.changed).toBe(true);
    const releases = readReleaseHistory(root).releases;
    expect(releases).toHaveLength(1);
    expect(releases[0]?.notes).toBe("Edited notes.");
  });

  it("keeps newer releases first and preserves older history", () => {
    const root = scratch();
    writeReleaseSurfaces(root, entry({ version: "0.5.75", tag: "v0.5.75" }));
    writeReleaseSurfaces(root, entry({ version: "0.5.76", tag: "v0.5.76" }));
    const history = readReleaseHistory(root);
    expect(history.releases.map((release) => release.tag)).toEqual(["v0.5.76", "v0.5.75"]);
    expect(renderChangelog(history).indexOf("v0.5.76")).toBeLessThan(
      renderChangelog(history).indexOf("v0.5.75"),
    );
  });

  it("refuses to read a malformed history instead of overwriting it", () => {
    const root = scratch();
    (writeFileSync(join(root, RELEASE_HISTORY_FILE), '{"releases":[{"version":'),
      expect(() => readReleaseHistory(root)).toThrow(/Could not parse release-history.json/));

    writeFileSync(join(root, RELEASE_HISTORY_FILE), '{"releases":[{"version":"1.0.0"}]}');
    expect(() => readReleaseHistory(root)).toThrow(/malformed release entry/);
  });

  it("starts an empty history when the file does not exist", () => {
    const root = scratch();
    expect(readReleaseHistory(root)).toEqual({ releases: [] });
    expect(existsSync(join(root, RELEASE_HISTORY_FILE))).toBe(false);
  });

  it("renders fallback notes without commit shas", () => {
    expect(renderDefaultReleaseNotes(["abc1234 Fix the idle poll loop"])).toBe(
      "Changes in this release:\n\n- Fix the idle poll loop",
    );
    expect(renderDefaultReleaseNotes([])).toBe("Maintenance release.");
  });

  it("stamps UTC dates from the cut time", () => {
    expect(releaseDate(new Date("2026-11-04T23:59:59Z"))).toBe("2026-11-04");
    expect(releaseDate(new Date("2026-11-05T00:00:01Z"))).toBe("2026-11-05");
  });

  it("upsert matches by tag and version", () => {
    const first = entry({ version: "0.5.75", tag: "v0.5.75" });
    const next = entry();
    expect(upsertRelease({ releases: [first] }, next).releases).toEqual([next, first]);
    expect(upsertRelease({ releases: [first] }, { ...first, notes: "edit" }).releases).toEqual([
      { ...first, notes: "edit" },
    ]);
  });
});

describe("the committed release record", () => {
  it("matches the package version so every surface names the shipped release", () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      version: string;
    };
    const history = readReleaseHistory(repoRoot);
    expect(history.releases[0]?.version).toBe(manifest.version);
    expect(CURRENT_RELEASE.version).toBe(manifest.version);
    expect(history.releases[0]?.tag).toBe(`v${manifest.version}`);
  });

  it("appears in the landing and docs agent indexes", () => {
    const stamp = releaseStamp();
    expect(renderLlmsTxt()).toContain(`Current release: ${stamp}`);
    expect(llmsIndexTemplate).toContain(`Current release: ${stamp}`);
  });

  it("keeps CHANGELOG.md as the rendering of the committed history", () => {
    const history = readReleaseHistory(repoRoot);
    expect(readFileSync(join(repoRoot, CHANGELOG_FILE), "utf8")).toBe(renderChangelog(history));
  });

  it("makes the release workflow read the body from the committed history first", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/release.yml"), "utf8");
    const changelog = workflow.indexOf("bun scripts/release-notes.ts");
    const tagBody = workflow.indexOf("contents:body");
    expect(changelog).toBeGreaterThan(-1);
    // The tag annotation is only a fallback for tags that predate the history.
    expect(tagBody).toBeGreaterThan(-1);
    expect(changelog).toBeLessThan(tagBody);
  });
});
