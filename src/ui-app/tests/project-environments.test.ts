import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDotEnv } from "../../core/config";
import {
  buildProjectConsumerEnv,
  readProjectEnvironment,
  writeProjectEnvironmentBinding,
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
  it("isolates concurrent consumer grants and never falls back for a missing selected key", async () => {
    const root = project();
    mkdirSync(join(root, ".repoos"));
    writeFileSync(
      join(root, ".repoos/environments.json"),
      JSON.stringify({
        environments: [
          { id: "dev-nick", sources: [{ id: "local", path: ".env.nick" }] },
          { id: "dev-alice", sources: [{ id: "local", path: ".env.alice" }] },
          { id: "dev-empty", sources: [{ id: "local", path: ".env.empty" }] },
          { id: "production", sources: [{ id: "local", path: ".env.production" }] },
        ],
      }),
    );
    writeFileSync(join(root, ".env.nick"), "DATABASE_URL=nick-db\nSHARED=nick\n");
    writeFileSync(join(root, ".env.alice"), "DATABASE_URL=alice-db\n");
    writeFileSync(join(root, ".env.production"), "DATABASE_URL=prod-db\n");
    writeProjectEnvironmentBinding(root, "dev:web-nick", "dev-nick", ["DATABASE_URL", "SHARED"]);
    writeProjectEnvironmentBinding(root, "dev:web-alice", "dev-alice", ["DATABASE_URL", "SHARED"]);
    const base = { ...process.env, DATABASE_URL: "machine-db", SHARED: "machine-value" };
    const [nick, alice] = await Promise.all([
      buildProjectConsumerEnv(root, "dev:web-nick", base),
      buildProjectConsumerEnv(root, "dev:web-alice", base),
    ]);
    expect(nick.DATABASE_URL).toBe("nick-db");
    expect(alice.DATABASE_URL).toBe("alice-db");
    expect(nick.SHARED).toBe("nick");
    expect(alice.SHARED).toBeUndefined();
    expect(base.DATABASE_URL).toBe("machine-db");

    const observe = (childEnv: NodeJS.ProcessEnv) =>
      new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "-e",
            "process.stdout.write(JSON.stringify({db:process.env.DATABASE_URL,shared:process.env.SHARED}))",
          ],
          { env: childEnv },
        );
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0 ? resolve(output) : reject(new Error(`child exited ${code}`)),
        );
      });
    const [nickOutput, aliceOutput] = await Promise.all([observe(nick), observe(alice)]);
    expect(JSON.parse(nickOutput)).toEqual({ db: "nick-db", shared: "nick" });
    expect(JSON.parse(aliceOutput)).toEqual({ db: "alice-db" });

    writeProjectEnvironmentBinding(root, "dev:web-nick", "dev-empty", ["DATABASE_URL"]);
    expect(buildProjectConsumerEnv(root, "dev:web-nick", base).DATABASE_URL).toBeUndefined();
  });

  it("does not grant project values to an unbound remote consumer", () => {
    const root = project();
    mkdirSync(join(root, ".repoos"));
    writeFileSync(
      join(root, ".repoos/environments.json"),
      JSON.stringify({
        environments: [{ id: "dev", sources: [{ id: "local", path: ".env.dev" }] }],
      }),
    );
    writeFileSync(join(root, ".env.dev"), "TOKEN=project-value\n");
    const childEnv = buildProjectConsumerEnv(root, "check:default", { PATH: "/bin" });
    expect(childEnv.TOKEN).toBeUndefined();
  });
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
