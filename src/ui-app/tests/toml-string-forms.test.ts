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

  it("keeps significant whitespace on a multi-line string's opening line", () => {
    // The value is trimmed only for recognition, not before decoding: trailing
    // spaces before the first newline are string content (review finding).
    expect(parseFlatToml('x = """first   \nsecond"""').x).toBe("first   \nsecond");
    expect(parseFlatToml("x = '''first   \nsecond'''").x).toBe("first   \nsecond");
  });

  it("keeps whitespace before the closing delimiter and on continuation lines", () => {
    expect(parseFlatToml("x = '''a   '''").x).toBe("a   ");
    expect(parseFlatToml('x = """a   """').x).toBe("a   ");
    expect(parseFlatToml("x = '''\n  indented\n\ttabbed\n'''").x).toBe("  indented\n\ttabbed\n");
  });

  it("still trims insignificant whitespace around a single-line value", () => {
    expect(parseFlatToml('x = "a"   ').x).toBe("a");
    expect(parseFlatToml("x =   'a'").x).toBe("a");
    expect(parseFlatToml("x =   42   ").x).toBe(42);
  });

  it("keeps whitespace inside a single-line basic/literal string", () => {
    expect(parseFlatToml('x = "a   "').x).toBe("a   ");
    expect(parseFlatToml("x = 'a   '").x).toBe("a   ");
  });

  it("handles closing-quote runs at the TOML limit", () => {
    expect(parseFlatToml("x = ''''''").x).toBe("");
    expect(parseFlatToml("x = '''''''").x).toBe("'");
    expect(parseFlatToml("x = ''''''''").x).toBe("''");
    expect(parseFlatToml('x = """"""').x).toBe("");
    expect(parseFlatToml('x = """""""').x).toBe('"');
    expect(parseFlatToml('x = """"""""').x).toBe('""');
    expect(parseFlatToml("x = ''''''' # comment").x).toBe("'");
  });

  it("preserves an unknown escape instead of silently dropping the backslash", () => {
    // Validation rejects this before a save; the reader must not turn `\q`
    // into `q` if it is ever handed an unvalidated file.
    expect(parseFlatToml('x = """bad\\q"""').x).toBe("bad\\q");
  });

  it('decodes escapes and embedded quotes in """ strings', () => {
    const parsed = parseFlatToml(`x = """line1\\nline2\\"quote\\"` + '"""');
    expect(parsed.x).toBe('line1\nline2"quote"');
  });

  it("decodes a single-line \\UXXXXXXXX escape with TOML rules", () => {
    // JSON.parse rejects `\U`, so the reader must not use JSON rules here.
    expect(parseFlatToml('x = "\\U0001F600"').x).toBe("😀");
    expect(parseFlatToml('x = "\\u0041\\U0001F600"').x).toBe("A😀");
  });

  it('honours a line-ending backslash in a """ string', () => {
    // TOML trims the backslash, the newline and the following indentation.
    const parsed = parseFlatToml('x = """a\\\n   b"""');
    expect(parsed.x).toBe("ab");
  });

  it("keeps header- and comment-shaped lines inside a multi-line value", () => {
    const parsed = parseFlatToml("x = '''\n[not.a.header]\nkey = value # kept\n'''\ny = 1\n");
    expect(parsed.x).toBe("[not.a.header]\nkey = value # kept\n");
    expect(parsed.y).toBe(1);
  });

  it("keeps parsing the keys after a multi-line value", () => {
    const parsed = parseFlatToml("x = '''\na\n'''\ny = 2\n");
    expect(parsed.x).toBe("a\n");
    expect(parsed.y).toBe(2);
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

  it("keeps each [[dev.targets]] row when one command spans lines", () => {
    const { root } = repo(
      [
        "[[dev.targets]]",
        'name = "web"',
        'kind = "process"',
        "command = '''",
        "PORT=3001 bun run dev",
        "'''",
        "",
        "[[dev.targets]]",
        'name = "worker"',
        'kind = "process"',
        'command = "bun run worker"',
        "",
      ].join("\n"),
    );
    const targets = loadConfig(root).dev?.targets ?? [];
    expect(targets.map((t) => [t.name, t.command])).toEqual([
      ["web", "PORT=3001 bun run dev"],
      ["worker", "bun run worker"],
    ]);
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

  it("does not rewrite a key-shaped line inside a multi-line value", () => {
    const { root, tomlPath } = repo(
      [
        "maxActiveTasks = 5",
        "[[dev.targets]]",
        'name = "web"',
        'kind = "process"',
        "command = '''",
        "maxActiveTasks = 7",
        "'''",
        "",
      ].join("\n"),
    );
    patchTomlConfig(tomlPath, { maxActiveTasks: 3 });
    const config = loadConfig(root);
    expect(config.maxActiveTasks).toBe(3);
    expect(config.dev?.targets?.[0]?.command).toBe("maxActiveTasks = 7");
  });

  it("rewrites a row whose string contains a header-shaped line", () => {
    const command = "[not.a.header]\nPORT=3001 bun run dev";
    const { root, tomlPath } = repo(
      [
        "[[dev.targets]]",
        'name = "web"',
        'kind = "process"',
        "command = '''",
        "[not.a.header]",
        "PORT=3001 bun run dev",
        "'''",
        "",
      ].join("\n"),
    );
    patchTomlConfig(tomlPath, {
      "dev.targets": [{ name: "web", kind: "process", command }],
    });
    const text = readFileSync(tomlPath, "utf8");
    expect(loadConfig(root).dev?.targets?.[0]?.command).toBe(command);
    expect(text).not.toContain("'''");
    expect(text.match(/\[\[dev\.targets\]\]/g)).toHaveLength(1);
  });

  it("drops the whole multi-line row when the row is replaced", () => {
    const { root, tomlPath } = repo(
      [
        "[[dev.targets]]",
        'name = "web"',
        'kind = "process"',
        "command = '''",
        "[not.a.header]",
        "'''",
        "",
      ].join("\n"),
    );
    patchTomlConfig(tomlPath, {
      "dev.targets": [{ name: "worker", kind: "process", command: "bun run worker" }],
    });
    const text = readFileSync(tomlPath, "utf8");
    expect(loadConfig(root).dev?.targets?.map((t) => t.name)).toEqual(["worker"]);
    expect(text).not.toContain("[not.a.header]");
    expect(text.match(/\[\[dev\.targets\]\]/g)).toHaveLength(1);
  });
});
