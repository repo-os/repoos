import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBrowserEvidence } from "../../../scripts/remote-runner/capture-browser.js";
import { worktreesDir } from "../../core/config.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const validatePath = join(repoRoot, "scripts/remote-runner/validate.sh");
const validateScript = readFileSync(validatePath, "utf8");
const dockerfileCi = readFileSync(join(repoRoot, "scripts/remote-runner/Dockerfile.ci"), "utf8");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("remote browser capture result artifact", () => {
  it("exits after publishing a result even with a live timer", () => {
    const output = mkdtempSync(join(tmpdir(), "repoos-browser-exit-"));
    roots.push(output);
    const preload = join(output, "preload.ts");
    writeFileSync(preload, "setInterval(() => {}, 1000);\n");
    const run = spawnSync(
      "bun",
      [
        "--preload",
        preload,
        join(repoRoot, "scripts/remote-runner/capture-browser.ts"),
        "0854",
        "shots",
        output,
      ],
      {
        env: { ...process.env, REPOOS_ROOT: join(output, "missing-repo") },
        encoding: "utf8",
        timeout: 10_000,
      },
    );
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(2);
    expect(JSON.parse(readFileSync(join(output, "result.json"), "utf8")).ok).toBe(false);
  });

  it("writes the actual setup error to result.json when capture cannot start", async () => {
    const output = mkdtempSync(join(tmpdir(), "repoos-browser-result-"));
    roots.push(output);
    const result = await captureBrowserEvidence(
      join(output, "missing-repo"),
      "0854",
      "shots",
      output,
    );
    const artifact = JSON.parse(readFileSync(join(output, "result.json"), "utf8")) as {
      ok: boolean;
      detail: string;
      results: { error: string };
    };
    expect(result.ok).toBe(false);
    expect(artifact.ok).toBe(false);
    expect(artifact.detail).toContain("Task #0854 was not found");
    expect(artifact.results.error).toBe(artifact.detail);
  });

  it("resolves the linked task worktree from the explicit runner repo root", async () => {
    const parent = mkdtempSync(join(tmpdir(), "repoos-browser-worktree-layout-"));
    roots.push(parent);
    const repoRoot = join(parent, "repo");
    mkdirSync(join(repoRoot, "work"), { recursive: true });
    const git = (args: string[]) => execFileSync("git", args, { cwd: repoRoot, stdio: "ignore" });
    git(["init", "-b", "main"]);
    git(["config", "user.email", "runner-test@example.com"]);
    git(["config", "user.name", "Runner test"]);
    writeFileSync(
      join(repoRoot, "work/0854-test.md"),
      '---\nid: "0854"\ntitle: Runner layout fixture\nstatus: review\nbranch: feat/runner-layout\narea: core\n---\n',
    );
    writeFileSync(join(repoRoot, "README.md"), "fixture\n");
    git(["add", "."]);
    git(["commit", "-m", "fixture"]);
    const linked = join(worktreesDir(repoRoot), "feat/runner-layout");
    mkdirSync(join(linked, ".."), { recursive: true });
    git(["worktree", "add", "-b", "feat/runner-layout", linked, "HEAD"]);

    const output = join(parent, "artifacts");
    const result = await captureBrowserEvidence(repoRoot, "0854", "verify", output);
    const artifact = JSON.parse(readFileSync(join(output, "result.json"), "utf8")) as {
      ok: boolean;
      results: { verification?: { ok?: boolean; skipped?: boolean } };
    };
    expect(result.ok).toBe(true);
    expect(artifact.ok).toBe(true);
    expect(artifact.results.verification).toMatchObject({ ok: true, skipped: true });
  });
});

describe("runner browser capture process lifecycle (#1060)", () => {
  it("exits explicitly after the CLI entry finishes", () => {
    const src = readFileSync(join(repoRoot, "scripts/remote-runner/capture-browser.ts"), "utf8");
    expect(src).toMatch(/process\.exit\(result\.ok \? 0 : 2\)/);
    expect(src).toMatch(/PREVIEW_STOP_TIMEOUT_MS/);
  });
});

describe("runner worktree layout for browser capture (#0854)", () => {
  it("still parses as bash", () => {
    expect(() => execFileSync("bash", ["-n", validatePath], { stdio: "ignore" })).not.toThrow();
  });

  it("logs reaper markers only after docker rm outcome is known (#1060)", () => {
    expect(validateScript).toMatch(
      /\[reaper\] removed \$bare\$task_tag: no output for two minutes and CPU idle/,
    );
    expect(validateScript).toMatch(
      /\[reaper\] failed to remove \$bare\$task_tag reason=\$rm_reason/,
    );
    const rmAt = validateScript.indexOf('rm_out=$(docker rm -f "$id" 2>&1)');
    const successAt = validateScript.indexOf("[reaper] removed $bare$task_tag");
    expect(rmAt).toBeGreaterThan(-1);
    expect(successAt).toBeGreaterThan(rmAt);
    // set -e must not abort the sweep when docker rm fails — capture rm_code in one line.
    expect(validateScript.slice(rmAt, rmAt + 80)).toMatch(
      /rm_out=\$\(docker rm -f "\$id" 2>&1\) && rm_code=0 \|\| rm_code=\$\?/,
    );
    expect(validateScript).toMatch(/REPOOS_BROWSER_CAPTURE_TASK=/);
  });

  it("guards startup reaper docker calls under set -euo pipefail (#1060)", () => {
    const marker =
      "# handles the hang where the runner process never exits after writing result.json.";
    const start = validateScript.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const block = validateScript.slice(start, start + 2600);
    expect(block).not.toMatch(/set \+e/);
    expect(block).toMatch(
      /_reap_ids=\$\(docker ps -q --filter "name=repoos-validate-" --filter status=running 2>\/dev\/null\) \\\n  && _reap_ps_ok=0 \|\| _reap_ps_ok=\$\?/,
    );
    expect(block).toMatch(/failed to list running capture containers reason=exit-/);
    expect(block).toMatch(
      /if recent=\$\(docker logs --since 120s --tail 1 "\$id" 2>&1\); then :; else/,
    );
    expect(block).toMatch(/failed to read recent logs for \$bare reason=exit-/);
    expect(block).toMatch(/<<EOF\n\$\{_reap_ids\}\nEOF/);
  });

  it("emits reaper failure markers when docker ps or logs fail under set -euo pipefail", () => {
    const reaperStart = validateScript.indexOf("# Best-effort: remove still-running");
    const end = validateScript.indexOf("# No global sweep of $HOME/.repoos-validate.*");
    const reaper = validateScript.slice(reaperStart, end);
    const root = mkdtempSync(join(tmpdir(), "reaper-startup-guard-"));
    roots.push(root);
    const bin = join(root, "bin");
    mkdirSync(bin);
    const runReaper = (dockerBody: string) => {
      writeFileSync(
        join(bin, "docker"),
        `#!/bin/sh
${dockerBody}
`,
      );
      chmodSync(join(bin, "docker"), 0o755);
      return spawnSync("bash", ["-c", `set -euo pipefail\n${reaper}\necho AFTER_REAPER`], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      });
    };

    const psFail = runReaper('case "$*" in *"ps -q"*) exit 1;; esac\nexit 0');
    expect(psFail.status, psFail.stderr).toBe(0);
    expect(psFail.stdout).toContain("[reaper] failed to list running capture containers");
    expect(psFail.stdout).toContain("AFTER_REAPER");

    const logsFail = runReaper(
      `case "$*" in
*"ps -q"*) echo cid123; exit 0;;
*"{{.Name}}"*) echo /repoos-validate-1060-abcd; exit 0;;
*"Config.Env"*) printf '%s\\n' REPOOS_BROWSER_CAPTURE_MODE=shots; exit 0;;
*"logs --since"*) exit 1;;
*logs*) echo "[browser-capture] runner browser capture completed"; exit 0;;
esac
exit 0`,
    );
    expect(logsFail.status, logsFail.stderr).toBe(0);
    expect(logsFail.stdout).toContain(
      "[reaper] failed to read recent logs for repoos-validate-1060-abcd",
    );
    expect(logsFail.stdout).toContain("AFTER_REAPER");
  });

  it("creates and bind-mounts a writable /repo-worktrees for the capture worktree", () => {
    // capture-browser.ts resolves the task worktree through
    // worktreePathForBranch, which points at worktreesDir("/repo") =
    // /repo-worktrees — OUTSIDE the /repo mount. The container runs as the host
    // uid, so a bare `mkdir /repo-worktrees` at the container root fails; the
    // host must create the dir (same uid) and bind it in writable.
    expect(worktreesDir("/repo")).toBe("/repo-worktrees");
    expect(validateScript).toMatch(/WORKTREES="\$WORK\/worktrees"/);
    expect(validateScript).toMatch(/mkdir -p "\$WORKTREES"/);
    expect(validateScript).toMatch(/-v "\$WORKTREES":\/repo-worktrees/);
    expect(validateScript).toMatch(/\/repo-worktrees\/\\?\$\{REPOOS_BROWSER_CAPTURE_BRANCH\}/);
  });

  it("bakes a writable /repo-worktrees into the runner image as a fallback", () => {
    expect(dockerfileCi).toMatch(/RUN mkdir(?: -m \d+)? \/repo-worktrees/);
  });
});
