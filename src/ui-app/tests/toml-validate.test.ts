/**
 * TOML syntax validator (#0375) — the raw repoos.toml editor's save gate. The
 * key property is that it accepts every TOML shape this repo actually emits
 * (the real repoos.toml is validated as a fixture) while rejecting the
 * structural mistakes a hand-edit produces, before anything touches disk.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatTomlError, validateToml } from "../../core/toml-validate.js";

/** Walk up from the test process's cwd to the checkout's real repoos.toml. */
function findRepoosToml(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "repoos.toml");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("repoos.toml not found above the test cwd");
}

const repoosToml = readFileSync(findRepoosToml(), "utf8");

describe("validateToml accepts", () => {
  it("the repository's own repoos.toml", () => {
    expect(validateToml(repoosToml)).toEqual({ ok: true });
  });

  it.each([
    ["empty document", ""],
    ["flat scalar", 'workDir = "work"\nmaxActiveTasks = 3\n'],
    ["comments everywhere", "# a\nkey = 1 # trailing\n"],
    ["table + array of tables", '[check]\nuiStylesheet = "x"\n\n[[deployments]]\nname = "a"\n'],
    ["dotted keys", "auth.enabled = true\nauth.sessionMaxAge = 604800\n"],
    ["quoted keys", '"a b" = 1\n'],
    ["literal strings with quotes inside", "selector = '[data-theme=\"light\"]'\n"],
    ["single-line arrays", 'a = [1, 2, 3]\nb = ["x", "y"]\n'],
    [
      "dates, hex, floats, specials",
      "d = 1979-05-27T07:32:00Z\nh = 0xDEAD_beef\nf = -1.5e3\nn = inf\n",
    ],
    ["crlf line endings", 'a = 1\r\nb = "x"\r\n'],
  ])("%s", (_name, source) => {
    expect(validateToml(source)).toEqual({ ok: true });
  });
});

describe("validateToml rejects", () => {
  it.each([
    ["missing value", "a =\n", 1],
    ["missing equals", "a 1\n", 1],
    ["no key", "= 1\n", 1],
    ["bare word value", "a = foo\n", 1],
    ["bad number", "a = 1.2.3\n", 1],
    ["unterminated string", 'a = "x\n', 1],
    ["unclosed table header", "[a\n", 1],
    ["unclosed array on one line", "a = [1, 2", 1],
    ["junk after statement", "[a] extra\n", 1],
  ])("%s reports line %i", (_name, source, line) => {
    const result = validateToml(source);
    expect(result.ok).toBe(false);
    expect(result.line).toBe(line);
    expect(result.error).toBeTruthy();
  });

  // Valid TOML that RepoOS's line-based reader cannot load must be refused, or
  // a save would be accepted and then silently ignored (#0375 review).
  it.each([
    ["multi-line array", "a = [\n  1,\n  2,\n]\n"],
    ["multi-line basic string", 'a = """x\ny"""\n'],
    ["multi-line literal string", "a = '''x\ny'''\n"],
    ["inline table", 'a = { b = 1, c = "x" }\n'],
  ])("refuses %s as unsupported by the config reader", (_name, source) => {
    const result = validateToml(source);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/aren't supported/);
  });
});

describe("formatTomlError", () => {
  it("folds the line number into the message", () => {
    const result = validateToml("a = [1, 2\n");
    expect(formatTomlError(result)).toMatch(/^Invalid TOML on line \d+: /);
  });
});
