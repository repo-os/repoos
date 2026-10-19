/**
 * Every valid TOML string form in `repoos.toml` must decode exactly as the
 * spec says — including multi-line literal (`'''…'''`) and basic (`"""…"""`)
 * values. The reader used to keep the quotes, so a dev target's command was
 * stored as `''bun install …''` (or `""…""`) and only ran by luck of the shell.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseFlatToml, patchTomlConfig } from "../../core/config.js";
import { unquoteTomlString } from "../../core/toml-line.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function repo(toml: string): { root: string; tomlPath: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-toml-strings-"));
  roots.push(root);
  const tomlPath = join(root, "repoos.toml");
  writeFileSync(tomlPath, toml, "utf8");
  return { root, tomlPath };
}

function devTargetToml(command: string): string {
  return ["[[dev.targets]]", 'name = "build"', 'kind = "process"', `command = ${command}`, ""].join(
    "\n",
  );
}

describe("multi-line TOML strings", () => {
  it("parses a ''' literal command in [[dev.targets]] without quotes", () => {
    const { root } = repo(devTargetToml("'''echo hi && echo there'''"));
    const target = loadConfig(root).dev?.targets?.[0];
    expect(target?.command).toBe("echo hi && echo there");
  });

  it('parses a """ basic command in [[dev.targets]] without quotes', () => {
    const { root } = repo(devTargetToml('"""echo hi && echo there"""'));
    const target = loadConfig(root).dev?.targets?.[0];
    expect(target?.command).toBe("echo hi && echo there");
  });

  it("trims the first newline on multi-line forms", () => {
    const parsed = parseFlatToml("x = '''\nhello\nworld'''");
    expect(parsed.x).toBe("hello\nworld");
    expect(parseFlatToml('y = """\nhello\nworld"""').y).toBe("hello\nworld");
  });

  it("handles embedded single and double quotes", () => {
    const parsed = parseFlatToml("x = '''it's \"great\"'''");
    expect(parsed.x).toBe('it\'s "great"');
  });

  it('decodes escapes and embedded quotes in """ strings', () => {
    const parsed = parseFlatToml(`x = """line1\\nline2\\"quote\\"` + '"""');
    expect(parsed.x).toBe('line1\nline2"quote"');
  });

  it("keeps a # inside every string form", () => {
    for (const value of ["'''see #0348'''", '"""see #0348"""', "'see #0348'", '"see #0348"']) {
      expect(unquoteTomlString(parseFlatToml(`x = ${value} # comment`).x as string)).toBe(
        "see #0348",
      );
    }
  });

  it("still strips a real comment after a single-line multi-line string", () => {
    expect(parseFlatToml("x = '''a''' # comment").x).toBe("a");
    expect(parseFlatToml('x = """a""" # comment').x).toBe("a");
  });
});

describe("multi-line string round-trip through the writer", () => {
  it("preserves the decoded command when the row is saved back", () => {
    const { root, tomlPath } = repo(devTargetToml("'''echo hi && echo there'''"));
    const before = loadConfig(root).dev?.targets?.[0];
    expect(before?.command).toBe("echo hi && echo there");

    // What the Settings save path sends: the parsed rows, re-serialized.
    patchTomlConfig(tomlPath, { "dev.targets": [before] });

    const after = loadConfig(root).dev?.targets?.[0];
    expect(after?.command).toBe("echo hi && echo there");
    // The writer normalizes to a single-line basic string; the value is what
    // must survive, and the output must stay valid TOML.
    expect(readFileSync(tomlPath, "utf8")).toContain(
      `command = ${JSON.stringify("echo hi && echo there")}`,
    );
  });

  it("does not corrupt a ''' row when an unrelated key is patched", () => {
    const { root, tomlPath } = repo(
      `${devTargetToml("'''\nPORT=3001 bun run dev\n'''")}theme = "dark"\n`,
    );
    patchTomlConfig(tomlPath, { theme: "light" });
    expect(loadConfig(root).dev?.targets?.[0]?.command).toBe("PORT=3001 bun run dev");
  });
});
