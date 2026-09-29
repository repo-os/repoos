/**
 * The shared area vocabulary helpers (#0583): parse, format, matching, the
 * `[areas]` config merge with preview targets, and the free-text-only
 * fallback.
 */
import { describe, expect, it } from "vitest";
import {
  areaListsIntersect,
  effectiveAreaNames,
  effectiveAreaVocabulary,
  formatTaskAreas,
  parseTaskAreas,
  unresolvedAreaReport,
} from "../../core/areas.js";
import { parseTask, serializeTask } from "../../core/task.js";
import { getConfigSchema, loadConfig } from "../../core/config.js";

function makeTask(content: string) {
  return parseTask({
    content,
    absPath: "/root/work/x.md",
    root: "/root",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

describe("parseTaskAreas — the one shared parse helper", () => {
  it("reads the canonical forms", () => {
    expect(parseTaskAreas("web")).toEqual(["web"]);
    expect(parseTaskAreas("web, core")).toEqual(["web", "core"]);
    expect(parseTaskAreas("web,core")).toEqual(["web", "core"]);
    expect(parseTaskAreas(["web", "core"])).toEqual(["web", "core"]);
    expect(parseTaskAreas(undefined)).toEqual([]);
    expect(parseTaskAreas(null)).toEqual([]);
    expect(parseTaskAreas("")).toEqual([]);
  });

  it("still reads the legacy `+` spelling (space-separated `+` splits)", () => {
    expect(parseTaskAreas("server + ui-app")).toEqual(["server", "ui-app"]);
    expect(parseTaskAreas("web + core + server")).toEqual(["web", "core", "server"]);
    // A `+` without surrounding whitespace is part of the value, never a
    // separator — an area literally named "c++" or "a+b" cannot be clobbered.
    expect(parseTaskAreas("c++")).toEqual(["c++"]);
    expect(parseTaskAreas("a+b")).toEqual(["a+b"]);
    expect(parseTaskAreas("server+ui-app")).toEqual(["server+ui-app"]);
    expect(parseTaskAreas(["web + core", "c++"])).toEqual(["web", "core", "c++"]);
  });

  it("does not treat `/` as a separator — 'web/mobile' stays one value", () => {
    expect(parseTaskAreas("web/mobile")).toEqual(["web/mobile"]);
  });

  it("trims, drops empties, and dedupes case-insensitively (first spelling wins)", () => {
    expect(parseTaskAreas(" web ,  core ,, ")).toEqual(["web", "core"]);
    expect(parseTaskAreas("web, WEB, Web, core")).toEqual(["web", "core"]);
    expect(parseTaskAreas(["web", " web ", "core"])).toEqual(["web", "core"]);
  });

  it("splits legacy spans inside a list item too", () => {
    expect(parseTaskAreas(["server + ui"])).toEqual(["server", "ui"]);
    expect(parseTaskAreas(["web, core"])).toEqual(["web", "core"]);
  });
});

describe("task round-trip — scalar for one area, inline list for several", () => {
  it("parses a single scalar, joins nothing", () => {
    const t = makeTask('---\nid: "0001"\narea: web\n---\nbody');
    expect(t.area).toBe("web");
    expect(t.areas).toEqual(["web"]);
  });

  it("parses an inline list into both fields", () => {
    const t = makeTask('---\nid: "0001"\narea: [web, core]\n---\nbody');
    expect(t.area).toBe("web, core");
    expect(t.areas).toEqual(["web", "core"]);
  });

  it("accepts legacy `+` and normalizes to the comma form", () => {
    const t = makeTask('---\nid: "0001"\narea: server + ui-app\n---\nbody');
    expect(t.area).toBe("server, ui-app");
    expect(t.areas).toEqual(["server", "ui-app"]);
  });

  it("falls back to the historical 'general' default", () => {
    const t = makeTask('---\nid: "0001"\n---\nbody');
    expect(t.area).toBe("general");
    expect(t.areas).toEqual(["general"]);
  });

  it("serializes one value back as a scalar", () => {
    const t = makeTask('---\nid: "0001"\narea: web\n---\nbody');
    expect(serializeTask(t)).toContain("area: web");
  });

  it("serializes several values as an inline list and round-trips", () => {
    const t = makeTask('---\nid: "0001"\narea: web, core\n---\nbody');
    const text = serializeTask(t);
    expect(text).toContain("area: [web, core]");
    expect(parseTaskAreas(makeTask(text).area)).toEqual(["web", "core"]);
  });
});

describe("matching helpers", () => {
  it("intersect case-insensitively", () => {
    expect(areaListsIntersect(["Web"], ["web"])).toBe(true);
    expect(areaListsIntersect(["web"], ["server"])).toBe(false);
  });

  it("formatTaskAreas is the plain-text display form", () => {
    expect(formatTaskAreas(["web", "core"])).toBe("web, core");
    expect(formatTaskAreas(["web"])).toBe("web");
  });
});

describe("effectiveAreaVocabulary — declared areas plus preview target areas", () => {
  it("merges both sources, deduped, each other's casing preserved", () => {
    const config = {
      areas: [{ name: "web", description: "The main app" }, { name: "landing" }],
      preview: {
        targets: [
          { name: "Docs", areas: ["docs", "web"], command: "x" },
          { name: "Landing", areas: ["landing"], command: "x" },
        ],
      },
    };
    expect(effectiveAreaNames(config)).toEqual(["web", "landing", "docs"]);
    expect(effectiveAreaVocabulary(config)[0]).toEqual({
      name: "web",
      description: "The main app",
    });
  });

  it("is empty (free-text only) when nothing is declared", () => {
    expect(effectiveAreaNames({})).toEqual([]);
  });

  it("shared preview-target areas resolve case-insensitively", () => {
    const config = {
      areas: [{ name: "web" }],
      preview: { targets: [{ name: "T", areas: ["WEB"], command: "x" }] },
    };
    expect(effectiveAreaNames(config)).toEqual(["web"]);
  });
});

describe("unresolvedAreaReport — vocabulary drift is advisory", () => {
  it("reports tasks whose areas left the vocabulary", () => {
    const report = unresolvedAreaReport(
      [
        { id: "1", area: "web, landing" },
        { id: "2", area: "landing" },
        { id: "3", areas: ["web"] },
      ],
      ["web"],
    );
    expect(report).toEqual([{ area: "landing", taskIds: ["1", "2"] }]);
  });

  it("returns nothing when every area resolves", () => {
    expect(
      unresolvedAreaReport(
        [
          { id: "1", area: "WEB" },
          { id: "2", area: "docs" },
        ],
        ["web", "docs"],
      ),
    ).toEqual([]);
  });
});

describe("[areas] configuration", () => {
  it("is exposed as a live Settings array control", () => {
    expect(getConfigSchema().find((field) => field.key === "areas")).toMatchObject({
      label: "Areas",
      type: "array",
      tier: "live",
    });
  });

  it("parses [[areas]] rows with optional descriptions", () => {
    const config = loadTomlFile(`[[areas]]
name = "web"
description = "The main app"
[[areas]]
name = "cli"
`);
    expect(config.areas).toEqual([{ name: "web", description: "The main app" }, { name: "cli" }]);
  });

  it("parses the flat string-array shorthand", () => {
    const config = loadTomlFile('areas = ["web", "core"]\n');
    expect(config.areas).toEqual([{ name: "web" }, { name: "core" }]);
  });

  it("drops unusable rows rather than poisoning the picker", () => {
    const config = loadTomlFile(`[[areas]]
name = ""
[[areas]]
name = "web"
`);
    expect(config.areas).toEqual([{ name: "web" }]);
  });

  it("stays undefined (free-text only) when nothing is declared", () => {
    expect(loadTomlFile('workDir = "work"\n').areas).toBeUndefined();
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function loadTomlFile(toml: string): ReturnType<typeof loadConfig> {
  const root = mkdtempSync(join(tmpdir(), "repoos-areas-config-"));
  try {
    writeFileSync(join(root, "repoos.toml"), toml, "utf8");
    return loadConfig(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
