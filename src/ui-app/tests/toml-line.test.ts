/**
 * RepoOS's TOML readers must not treat `#` inside a quoted value as a comment,
 * and a value saved by the writer must load back unchanged. Both used to fail
 * silently: the reviewer's instructions in repoos.toml were cut at a `#` and
 * then saved that way, and `"` gained a backslash on every save.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTomlComment, unquoteTomlString } from "../../core/toml-line.js";
import { loadConfig, patchTomlConfig } from "../../core/config.js";
import { parseToml } from "../../core/tunnel.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
function repo(toml: string): { root: string; tomlPath: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-toml-line-"));
  roots.push(root);
  const tomlPath = join(root, "repoos.toml");
  writeFileSync(tomlPath, toml);
  return { root, tomlPath };
}

describe("stripTomlComment", () => {
  it("strips a real trailing comment", () => {
    expect(stripTomlComment('theme = "dark"   # the UI theme').trim()).toBe('theme = "dark"');
    expect(stripTomlComment("# whole-line comment")).toBe("");
  });

  it("keeps # inside double- and single-quoted values", () => {
    expect(stripTomlComment('x = "see #0348 and `## Verdict`"')).toBe(
      'x = "see #0348 and `## Verdict`"',
    );
    expect(stripTomlComment("x = 'a # b' # c").trim()).toBe("x = 'a # b'");
  });

  it("respects escaped quotes inside a double-quoted value", () => {
    expect(stripTomlComment('x = "say \\"hi # there\\"" # c').trim()).toBe(
      'x = "say \\"hi # there\\""',
    );
  });

  it("does not treat an apostrophe inside double quotes as a quote", () => {
    expect(stripTomlComment('x = "the task\'s #1 rule" # c').trim()).toBe(
      'x = "the task\'s #1 rule"',
    );
  });
});

describe("unquoteTomlString", () => {
  it("decodes the writer's JSON escapes", () => {
    expect(unquoteTomlString(JSON.stringify('a "quoted" \\ path'))).toBe('a "quoted" \\ path');
  });

  it("falls back to stripping quotes for non-JSON escapes", () => {
    expect(unquoteTomlString('"\\d+"')).toBe("\\d+");
    expect(unquoteTomlString("'single'")).toBe("single");
  });
});

describe("repoos.toml round-trip", () => {
  const INSTRUCTIONS =
    'Open with exactly `## Verdict`, see #0348, don\'t skip "quoted # parts", keep C:\\\\path.';

  it("loads a # inside an agent's instructions intact", () => {
    const { root } = repo(
      [
        'theme = "dark" # trailing comment',
        "[[agents]]",
        'name = "reviewer"',
        'cli = "opencode"',
        `instructions = ${JSON.stringify(INSTRUCTIONS)} # real comment`,
        "",
      ].join("\n"),
    );
    const reviewer = loadConfig(root).agents?.find((a) => a.name === "reviewer");
    expect(reviewer?.instructions).toBe(INSTRUCTIONS);
  });

  it("survives repeated saves through patchTomlConfig without changing", () => {
    const { root, tomlPath } = repo('theme = "dark"\n');
    const agent = { name: "reviewer", cli: "opencode", enabled: true, instructions: INSTRUCTIONS };
    for (let i = 0; i < 3; i++) {
      const current = loadConfig(root).agents?.find((a) => a.name === "reviewer");
      patchTomlConfig(tomlPath, {
        agents: [{ ...agent, instructions: current?.instructions ?? INSTRUCTIONS }],
      });
      expect(loadConfig(root).agents?.find((a) => a.name === "reviewer")?.instructions).toBe(
        INSTRUCTIONS,
      );
    }
    expect(readFileSync(tomlPath, "utf8")).toContain(JSON.stringify(INSTRUCTIONS));
  });

  it("keeps # inside tunnel values", () => {
    const parsed = parseToml('[tunnel]\nname = "team#1" # comment\n') as {
      tunnel: { name: string };
    };
    expect(parsed.tunnel.name).toBe("team#1");
  });
});
