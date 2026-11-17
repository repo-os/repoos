import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
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
    const output = execFileSync("bash", [script, bundle, sha, artifacts], {
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
    });

    expect(output).toContain("[validate] gate exit 0");
    expect(existsSync(dockerArgs)).toBe(true);
    const argv = readFileSync(dockerArgs, "utf8");
    expect(argv).toContain("--entrypoint\nbash\ntiao-ci\n-lc\n");
    expect(argv).toContain('bash -lc "$REPOOS_VALIDATION_COMMAND"');
    expect(readFileSync(join(artifacts, "test-output.log"), "utf8")).toContain(
      "custom-project-gate-ran",
    );
  });

  it("keeps project exit 126/127 as gate failures and maps Docker startup/cache setup failures to infra", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-custom-docker-exits-"));
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
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    let repoRoot = process.cwd();
    while (!existsSync(join(repoRoot, "scripts/remote-runner/validate.sh"))) {
      const parent = dirname(repoRoot);
      if (parent === repoRoot) throw new Error("could not locate validate.sh");
      repoRoot = parent;
    }
    const script = join(repoRoot, "scripts/remote-runner/validate.sh");
    const fakeDocker = `#!/usr/bin/env bash
set -eu
case "$1" in
  ps|rm) exit 0 ;;
  volume) [ "\${FAKE_VOLUME_FAIL:-0}" = 1 ] && exit 1 || exit 0 ;;
  run)
    case "$*" in *"mkdir -p /repoos-cache"*) [ "\${FAKE_CACHE_PREP_FAIL:-0}" = 1 ] && exit 1 || true ;; esac
    shift
    while [ "$#" -gt 0 ]; do
      case "$1" in
        -e) shift; case "$1" in HOME=*) ;; *) export "$1" ;; esac; shift ;;
        --entrypoint)
          shift; entrypoint="$1"; shift; image="$1"; shift; mode="$1"; shift; command="$1"
          [ "\${FAKE_DOCKER_START_FAIL:-0}" = 0 ] || exit "$FAKE_DOCKER_START_FAIL"
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
    const docker = join(bin, "docker");
    writeFileSync(docker, fakeDocker);
    chmodSync(docker, 0o755);
    const run = (command: string, extra: Record<string, string> = {}) => {
      const bundle = join(root, `candidate-${Math.random().toString(16).slice(2)}.bundle`);
      execFileSync("git", ["bundle", "create", bundle, "--all"], { cwd: source });
      return spawnSync("bash", [script, bundle, sha, artifacts], {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          HOST_ARTIFACTS: artifacts,
          REPOOS_CI_IMAGE: "tiao-ci",
          REPOOS_VALIDATION_COMMAND: command,
          ...extra,
        },
      });
    };

    for (const code of [126, 127]) {
      const result = run(`exit ${code}`);
      expect(result.status).toBe(code);
      expect(result.stdout).toContain(`[validate] gate exit ${code}`);
      expect(result.stderr).not.toContain("container could not start");
    }
    expect(run("echo should-not-run", { FAKE_DOCKER_START_FAIL: "127" })).toMatchObject({
      status: 5,
    });
    expect(run("echo should-not-run", { FAKE_VOLUME_FAIL: "1" })).toMatchObject({ status: 5 });
    expect(run("echo should-not-run", { FAKE_CACHE_PREP_FAIL: "1" })).toMatchObject({ status: 5 });
  });
});

describe("native browser capture cleanup", () => {
  it("removes each capture worktree with its per-run checkout and leaves setup failure unmarked", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-native-capture-"));
    roots.push(root);
    const source = join(root, "source");
    const home = join(root, "home");
    const artifacts = join(root, "artifacts");
    mkdirSync(source);
    mkdirSync(home, { recursive: true });
    mkdirSync(join(home, ".repoos-artifacts"), { recursive: true });
    mkdirSync(artifacts);
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: source });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: source });
    writeFileSync(join(source, "project.txt"), "fixture\n");
    writeFileSync(join(source, "package.json"), '{"name":"capture-fixture","version":"1.0.0"}\n');
    mkdirSync(join(source, "scripts/remote-runner"), { recursive: true });
    writeFileSync(
      join(source, "scripts/remote-runner/capture-browser.ts"),
      'console.log("fixture capture ran");\n',
    );
    execFileSync("bun", ["install"], { cwd: source });
    execFileSync("git", ["add", "project.txt"], { cwd: source });
    execFileSync("git", ["add", "package.json", "scripts/remote-runner/capture-browser.ts"], {
      cwd: source,
    });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: source });
    let repoRoot = process.cwd();
    while (!existsSync(join(repoRoot, "scripts/remote-runner/validate-macos.sh"))) {
      const parent = dirname(repoRoot);
      if (parent === repoRoot) throw new Error("could not locate validate-macos.sh");
      repoRoot = parent;
    }
    const script = join(repoRoot, "scripts/remote-runner/validate-macos.sh");
    const runCapture = () => {
      const bundle = join(root, `candidate-${Math.random().toString(16).slice(2)}.bundle`);
      execFileSync("git", ["bundle", "create", bundle, "--all"], { cwd: source });
      const sha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: source,
        encoding: "utf8",
      }).trim();
      return spawnSync("bash", [script, bundle, sha, artifacts], {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          REPOOS_BROWSER_CAPTURE_MODE: "task",
          REPOOS_BROWSER_CAPTURE_BRANCH: "feature/retry-capture",
          REPOOS_BROWSER_CAPTURE_TASK: "1160",
        },
      });
    };

    const firstCapture = runCapture();
    expect(firstCapture.status, `${firstCapture.stdout}\n${firstCapture.stderr}`).toBe(0);
    const repeatedCapture = runCapture();
    expect(repeatedCapture.status, `${repeatedCapture.stdout}\n${repeatedCapture.stderr}`).toBe(0);
    expect(existsSync(join(home, ".repoos-worktrees"))).toBe(false);
    writeFileSync(join(source, "package.json"), "not valid package json\n");
    execFileSync("git", ["add", "package.json"], { cwd: source });
    execFileSync("git", ["commit", "-qm", "invalid lock fixture"], { cwd: source });
    const failedSetup = runCapture();
    expect(failedSetup.status).toBe(4);
    expect(failedSetup.stdout).not.toContain("[validate] gate exit 4");
    expect(failedSetup.stderr).toContain("[validate] setup failed (exit 4)");
    expect(readFileSync(join(artifacts, "test-output.log"), "utf8")).not.toContain(
      "[validate] gate started",
    );
  });
});
