/**
 * `.env` autoload for `repoos serve` (companion to #0246's auth env-var
 * fallbacks) — zero deps, minimal KEY=value parser, real env vars win.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDotEnv } from "../../core/config";

const tmpRoots: string[] = [];
const ENV_KEYS = ["FOO", "BAR", "QUOTED", "SINGLE_QUOTED", "ALREADY_SET"] as const;

afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
  for (const k of ENV_KEYS) delete process.env[k];
});

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-dotenv-"));
  tmpRoots.push(dir);
  return dir;
}

function writeEnv(root: string, body: string): void {
  writeFileSync(join(root, ".env"), body, "utf8");
}

describe("loadDotEnv", () => {
  it("is a no-op when .env doesn't exist", () => {
    expect(() => loadDotEnv(tmpDir())).not.toThrow();
    expect(process.env.FOO).toBeUndefined();
  });

  it("loads simple KEY=value pairs", () => {
    const root = tmpDir();
    writeEnv(root, "FOO=bar\nBAR=baz\n");
    loadDotEnv(root);
    expect(process.env.FOO).toBe("bar");
    expect(process.env.BAR).toBe("baz");
  });

  it("skips blank lines and comments", () => {
    const root = tmpDir();
    writeEnv(root, "# a comment\n\nFOO=bar\n  # indented comment\n");
    loadDotEnv(root);
    expect(process.env.FOO).toBe("bar");
  });

  it("strips matching single or double quotes", () => {
    const root = tmpDir();
    writeEnv(root, "QUOTED=\"hello world\"\nSINGLE_QUOTED='hi there'\n");
    loadDotEnv(root);
    expect(process.env.QUOTED).toBe("hello world");
    expect(process.env.SINGLE_QUOTED).toBe("hi there");
  });

  it("never overrides a real env var already set", () => {
    const root = tmpDir();
    process.env.ALREADY_SET = "from-shell";
    writeEnv(root, "ALREADY_SET=from-dotenv\n");
    loadDotEnv(root);
    expect(process.env.ALREADY_SET).toBe("from-shell");
  });

  it("ignores lines with no '=' and blank keys", () => {
    const root = tmpDir();
    writeEnv(root, "not-a-valid-line\n=no-key\nFOO=bar\n");
    loadDotEnv(root);
    expect(process.env.FOO).toBe("bar");
  });
});
