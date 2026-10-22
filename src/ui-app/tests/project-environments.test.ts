import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDotEnv } from "../../core/config";
import {
  readProjectEnvironment,
  validateEnvironmentRegistry,
  writeProjectEnvironmentValue,
} from "../../core/project-environments";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
function project(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-envsets-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(join(root, ".gitignore"), ".env*\n!.env.example\n");
  writeFileSync(join(root, ".env.example"), "EXAMPLE_ONLY=placeholder\n");
  execFileSync("git", ["add", ".gitignore"], { cwd: root });
  execFileSync("git", ["add", ".env.example"], { cwd: root });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-qm", "init"],
    { cwd: root },
  );
  return root;
}
const env = {
  id: "dev-nick",
  sources: [
    { id: "base", path: ".env.base", examplePath: ".env.example" },
    { id: "local", path: ".env.dev" },
  ],
};

describe("explicit project environment files", () => {
  it("validates separate sets, expected names only, source precedence and duplicate keys", () => {
    const root = project();
    writeFileSync(join(root, ".env.base"), "SHARED=base\nBASE_ONLY=1\n");
    writeFileSync(join(root, ".env.dev"), "SHARED=local\n");
    writeFileSync(join(root, ".env.example"), "EXPECTED=placeholder\n");
    const snapshot = readProjectEnvironment(root, env);
    expect(snapshot.keys).toEqual(["SHARED", "BASE_ONLY"]);
    expect(snapshot.expectedKeys).toEqual(["EXPECTED"]);
    expect(JSON.stringify(snapshot)).not.toContain("placeholder");
    writeFileSync(join(root, ".env.dev"), "DUP=1\nDUP=2\n");
    expect(() => readProjectEnvironment(root, env)).toThrow("Duplicate dotenv key");
    expect(() =>
      validateEnvironmentRegistry({ environments: [{ ...env, id: "../oops" }] }),
    ).toThrow();
  });

  it("reads tracked .env.example key names without its placeholder values", () => {
    const root = project();
    const result = readProjectEnvironment(root, {
      id: "dev",
      sources: [{ id: "local", path: ".env.local", examplePath: ".env.example" }],
    });
    expect(result.expectedKeys).toEqual(["EXAMPLE_ONLY"]);
    expect(JSON.stringify(result)).not.toContain("placeholder");
  });

  it("round-trips quoted values and preserves comments and unrelated assignments", () => {
    const root = project();
    const path = join(root, ".env.dev");
    writeFileSync(path, "# keep me\nOTHER=untouched\nTOKEN=old\n");
    const firstHash = readProjectEnvironment(root, {
      id: "dev",
      sources: [{ id: "local", path: ".env.dev" }],
    }).sha256;
    writeProjectEnvironmentValue(
      root,
      ".env.dev",
      "TOKEN",
      `space quote\" equals= hash#`,
      firstHash,
    );
    const result = readProjectEnvironment(root, {
      id: "dev",
      sources: [{ id: "local", path: ".env.dev" }],
    });
    expect(result.keys).toEqual(["OTHER", "TOKEN"]);
    expect(readFileSync(path, "utf8")).toContain("# keep me");
    expect(readFileSync(path, "utf8")).toContain("OTHER=untouched");
    expect(readFileSync(path, "utf8")).toContain('TOKEN="space quote\\\" equals= hash#"');
  });

  it("rejects stale writes, multiline values, tracked destinations and symlinks", () => {
    const root = project();
    writeFileSync(join(root, ".env.dev"), "A=1\n");
    const hash = readProjectEnvironment(root, {
      id: "dev",
      sources: [{ id: "local", path: ".env.dev" }],
    }).sha256;
    writeFileSync(join(root, ".env.dev"), "A=2\n");
    expect(() => writeProjectEnvironmentValue(root, ".env.dev", "A", "3", hash)).toThrow(
      "changed since",
    );
    expect(() =>
      writeProjectEnvironmentValue(
        root,
        ".env.dev",
        "A",
        "two\nlines",
        readProjectEnvironment(root, { id: "dev", sources: [{ id: "local", path: ".env.dev" }] })
          .sha256,
      ),
    ).toThrow("Multiline");
    writeFileSync(join(root, "tracked.env"), "A=1\n");
    execFileSync("git", ["add", "tracked.env"], { cwd: root });
    expect(() => writeProjectEnvironmentValue(root, "tracked.env", "A", "2", hash)).toThrow(
      "Tracked",
    );
    mkdirSync(join(root, "safe"));
    symlinkSync(join(root, ".env.dev"), join(root, "safe", "link.env"));
    expect(() =>
      readProjectEnvironment(root, { id: "dev", sources: [{ id: "link", path: "safe/link.env" }] }),
    ).toThrow("symlink");
  });
});

describe("legacy dotenv compatibility", () => {
  it("keeps root .env parsing and process-environment precedence unchanged", () => {
    const root = project();
    const keys = [
      "REPOOS_ENV_LEGACY_PLAIN",
      "REPOOS_ENV_LEGACY_QUOTED",
      "REPOOS_ENV_LEGACY_PRESET",
    ];
    try {
      process.env.REPOOS_ENV_LEGACY_PRESET = "from-process";
      writeFileSync(
        join(root, ".env"),
        '# legacy comment\nREPOOS_ENV_LEGACY_PLAIN=from-file\nREPOOS_ENV_LEGACY_QUOTED="two words"\nREPOOS_ENV_LEGACY_PRESET=from-file\n',
      );
      loadDotEnv(root);
      expect(process.env.REPOOS_ENV_LEGACY_PLAIN).toBe("from-file");
      expect(process.env.REPOOS_ENV_LEGACY_QUOTED).toBe("two words");
      expect(process.env.REPOOS_ENV_LEGACY_PRESET).toBe("from-process");
    } finally {
      for (const key of keys) delete process.env[key];
    }
  });
});
