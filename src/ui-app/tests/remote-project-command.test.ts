import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../core/config.js";

const roots: string[] = [];
const runnerScript = resolve(__dirname, "../../../scripts/remote-runner/validate-macos.sh");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("remote project command", () => {
  it("runs a Tiao-shaped project command from its own checkout and returns artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-tiao-runner-fixture-"));
    roots.push(root);
    const project = join(root, "tiao-project");
    const home = join(root, "runner-home");
    const artifacts = join(root, "runner-artifacts");
    mkdirSync(join(project, "scripts"), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(project, "repoos.toml"),
      '[remoteValidation]\ncommand = "./scripts/ci-remote.sh"\n' +
        'requiredTools = ["java", "node"]\n',
    );
    writeFileSync(
      join(project, "scripts/ci-remote.sh"),
      "#!/usr/bin/env bash\nset -euo pipefail\n" +
        'echo "Tiao checks at $PWD"\n' +
        'mkdir -p "$REPOOS_ARTIFACTS_DIR"\n' +
        'printf "gradle + web checks passed\\n" > "$REPOOS_ARTIFACTS_DIR/tiao-check.txt"\n',
    );
    chmodSync(join(project, "scripts/ci-remote.sh"), 0o755);

    const git = (args: string[]) =>
      execFileSync("git", ["-C", project, ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Tiao fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.test",
          GIT_COMMITTER_NAME: "Tiao fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.test",
        },
      }).trim();
    git(["init", "-q"]);
    git(["add", "."]);
    git(["commit", "-qm", "Tiao fixture"]);
    const sha = git(["rev-parse", "HEAD"]);
    const bundle = join(root, "candidate.bundle");
    git(["bundle", "create", bundle, "--all"]);

    const config = loadConfig(project);
    expect(config.remoteValidation?.command).toBe("./scripts/ci-remote.sh");
    expect(config.remoteValidation?.requiredTools).toEqual(["java", "node"]);

    const output = execFileSync("bash", [runnerScript, bundle, sha, artifacts], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        REPOOS_VALIDATION_COMMAND: config.remoteValidation.command,
        REPOOS_ARTIFACTS_DIR: artifacts,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
      },
    });
    expect(output).toContain("HEAD verified");
    expect(output).toMatch(/Tiao checks at .*runner-home\/\.repoos-validate\.[^/]+\/repo/);
    expect(readFileSync(join(artifacts, "test-output.log"), "utf8")).toContain("Tiao checks at");
    expect(readFileSync(join(artifacts, "tiao-check.txt"), "utf8")).toContain("passed");
  });
});
