import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("custom Docker validation command", () => {
  it("executes the Docker branch with an explicit bash entrypoint and records the real gate output", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-custom-docker-"));
    roots.push(root);
    const source = join(root, "source");
    const home = join(root, "home");
    const bin = join(root, "bin");
    const artifacts = join(root, "artifacts");
    mkdirSync(source);
    mkdirSync(home, { recursive: true });
    mkdirSync(join(home, ".repoos-artifacts"), { recursive: true });
    mkdirSync(bin);
    mkdirSync(artifacts);

    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: source });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: source });
    writeFileSync(join(source, "project.txt"), "fixture\n");
    execFileSync("git", ["add", "project.txt"], { cwd: source });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: source });
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    const bundle = join(root, "candidate.bundle");
    execFileSync("git", ["bundle", "create", bundle, "--all"], { cwd: source });

    const dockerArgs = join(root, "docker-args.log");
    const fakeDocker = `#!/usr/bin/env bash
set -eu
case "$1" in
  ps) exit 0 ;;
  volume) exit 0 ;;
  rm) exit 0 ;;
  run)
    shift
    while [ "$#" -gt 0 ]; do
      case "$1" in
        -e) shift; case "$1" in HOME=*) ;; *) export "$1" ;; esac; shift ;;
        --entrypoint)
          shift
          entrypoint="$1"; shift
          image="$1"; shift
          mode="$1"; shift
          command="$1"
          printf '%s\\n' "--entrypoint" "$entrypoint" "$image" "$mode" "$command" > "$DOCKER_ARGS_LOG"
          [ "$entrypoint" = bash ] && [ "$mode" = -lc ] || exit 99
          command=$(printf '%s' "$command" | sed "s|/artifacts|$HOST_ARTIFACTS|g")
          exec bash -lc "$command"
          ;;
        *) shift ;;
      esac
    done
    exit 0
    ;;
esac
exit 0
`;
    const fakePath = join(bin, "docker");
    writeFileSync(fakePath, fakeDocker);
    chmodSync(fakePath, 0o755);

    let repoRoot = process.cwd();
    while (!existsSync(join(repoRoot, "scripts/remote-runner/validate.sh"))) {
      const parent = dirname(repoRoot);
      if (parent === repoRoot) throw new Error("could not locate validate.sh");
      repoRoot = parent;
    }
    const script = join(repoRoot, "scripts/remote-runner/validate.sh");
    const output = execFileSync(
      "bash",
      [script, bundle, sha, artifacts],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          HOST_ARTIFACTS: artifacts,
          DOCKER_ARGS_LOG: dockerArgs,
          REPOOS_CI_IMAGE: "tiao-ci",
          REPOOS_VALIDATION_COMMAND: "printf 'custom-project-gate-ran\\n'",
        },
      },
    );

    expect(output).toContain("[validate] gate exit 0");
    expect(existsSync(dockerArgs)).toBe(true);
    const argv = readFileSync(dockerArgs, "utf8");
    expect(argv).toContain("--entrypoint\nbash\ntiao-ci\n-lc\n");
    expect(argv).toContain("bash -lc \"$REPOOS_VALIDATION_COMMAND\"");
    expect(readFileSync(join(artifacts, "test-output.log"), "utf8")).toContain("custom-project-gate-ran");
  });
});
