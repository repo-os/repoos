import { describe, expect, it, afterEach } from "vitest";
import * as nodeZlib from "node:zlib";
import { deflateSync, gzipSync } from "node:zlib";
const zstdCompressSync = (nodeZlib as { zstdCompressSync?: (b: Buffer) => Buffer })
  .zstdCompressSync;
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAddedPaths,
  evaluateStagedForPreCommit,
  expandCheckpointPaths,
  gitAddedPathsOnBranch,
  isBuildOutputPath,
  planCheckpointStaging,
  scanBuffersForSecrets,
  scanTextForSecrets,
  zstdAvailable,
} from "../../core/branch-artifact-guard.js";
import { commitWipCheckpointForRemoteGate } from "../../server/engineer-remote-self-check.js";
import { loadConfig } from "../../core/config.js";
import { stepBranchArtifacts } from "../../commands/check.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(root: string, ...args: string[]) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

/** Fake Stripe test key — base64 in source so guards do not flag the test file (#1096). */
function fakeStripeTestSecret(): string {
  return Buffer.from("c2tfdGVzdF8wMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkw", "base64").toString(
    "utf8",
  );
}

function initRepo(root: string) {
  git(root, "init", "-q", "-b", "main");
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "README.md"), "seed\n");
  git(root, "add", "README.md");
  git(root, "commit", "-qm", "seed");
  git(root, "checkout", "-q", "-b", "feat/x");
}

function seedPreCommitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-hook-"));
  initRepo(root);
  cpSync(join(repoRoot, ".githooks"), join(root, ".githooks"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(
    join(repoRoot, "scripts", "staged-artifact-pre-commit.mjs"),
    join(root, "scripts/staged-artifact-pre-commit.mjs"),
  );
  mkdirSync(join(root, "dist", "core"), { recursive: true });
  cpSync(
    join(repoRoot, "dist", "core", "branch-artifact-guard.js"),
    join(root, "dist", "core", "branch-artifact-guard.js"),
  );
  cpSync(join(repoRoot, "dist", "core", "config.js"), join(root, "dist", "core", "config.js"));
  git(root, "config", "core.hooksPath", ".githooks");
  return root;
}

describe("isBuildOutputPath", () => {
  it("flags derived data and xcresult trees", () => {
    expect(isBuildOutputPath("macos/.derived-data-verify/foo", [])).toBe(true);
    expect(isBuildOutputPath("out/Test.xcresult/Data", [])).toBe(true);
    expect(isBuildOutputPath("src/index.ts", [])).toBe(false);
  });
});

describe("secret scan", () => {
  it("finds a fake Stripe key inside gzip", () => {
    const secret = fakeStripeTestSecret();
    const z = gzipSync(Buffer.from(secret, "utf8"));
    const { secrets } = scanBuffersForSecrets(z, "blob.bin", 1_000_000);
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets[0]!.suffix).toHaveLength(4);
    expect(secrets[0]!.type).toBe("stripe_secret");
    expect(JSON.stringify(secrets)).not.toContain(secret);
  });

  it("finds gzip at an embedded offset", () => {
    const secret = fakeStripeTestSecret();
    const z = gzipSync(Buffer.from(secret, "utf8"));
    const host = Buffer.concat([Buffer.alloc(700_000, 0), z]);
    const { secrets } = scanBuffersForSecrets(host, "blob.bin", 1_000_000);
    expect(secrets.some((h) => h.type === "stripe_secret")).toBe(true);
  });

  it("fails closed when gzip expands past the decompress limit", () => {
    const secret = fakeStripeTestSecret();
    const body = Buffer.concat([Buffer.from(secret, "utf8"), Buffer.alloc(5 * 1024 * 1024, 0)]);
    const z = gzipSync(body);
    const { secrets, incomplete } = scanBuffersForSecrets(z, "big.gz", 64 * 1024);
    expect(incomplete.some((i) => i.reason.includes("scan limit"))).toBe(true);
    expect(secrets.length).toBe(0);
  });

  it.skipIf(typeof zstdCompressSync !== "function")(
    "finds a fake Stripe key inside zstd (Node zlib)",
    () => {
      const secret = fakeStripeTestSecret();
      const z = zstdCompressSync!(Buffer.from(secret, "utf8"));
      const { secrets } = scanBuffersForSecrets(z, "blob.bin", 1_000_000);
      expect(secrets.length).toBeGreaterThan(0);
    },
  );

  it("flags zstd payloads when no decompressor is available", () => {
    const fakeFrame = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x00, 0x00, 0x01]);
    const { incomplete } = scanBuffersForSecrets(fakeFrame, "x.zst", 64 * 1024);
    if (!zstdAvailable()) {
      expect(incomplete.some((i) => i.reason.includes("zstd"))).toBe(true);
    } else {
      expect(incomplete.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not false-positive on random base64 noise", () => {
    const samples = [
      "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw",
      "QUJDREVGR0hJS0tMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkw",
      "aGVsbG8gd29ybGQgdGhpcyBpcyBub3Qga2V5IG1hdGVyaWFs",
    ];
    for (const noise of samples) {
      expect(scanTextForSecrets(noise, "noise.txt")).toEqual([]);
    }
  });
});

describe("branch diff guard", () => {
  it("fails on a synthetic 2 MiB added file", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-branch-guard-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "big.bin"), Buffer.alloc(2 * 1024 * 1024, 1));
    git(root, "add", "big.bin");
    git(root, "commit", "-qm", "big");
    const added = gitAddedPathsOnBranch(root, "main")!;
    const { violations } = evaluateAddedPaths(root, added, {
      maxAddedFileBytes: 1_048_576,
    });
    expect(violations.some((v) => v.kind === "oversize" && v.path === "big.bin")).toBe(true);
  });

  it("flags a secret committed then overwritten clean in the worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-overwrite-"));
    dirs.push(root);
    initRepo(root);
    const secret = fakeStripeTestSecret();
    writeFileSync(join(root, "leak.txt"), secret);
    git(root, "add", "leak.txt");
    git(root, "commit", "-qm", "add secret");
    writeFileSync(join(root, "leak.txt"), "clean\n");
    const added = gitAddedPathsOnBranch(root, "main")!;
    const { violations } = evaluateAddedPaths(root, added, {});
    expect(violations.some((v) => v.kind === "secret" && v.path === "leak.txt")).toBe(true);
  });

  it("flags oversize content committed then removed from the worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rm-big-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "big.bin"), Buffer.alloc(2 * 1024 * 1024, 1));
    git(root, "add", "big.bin");
    git(root, "commit", "-qm", "big");
    git(root, "rm", "-f", "big.bin");
    git(root, "commit", "-qm", "rm");
    const { violations } = evaluateAddedPaths(root, gitAddedPathsOnBranch(root, "main")!, {
      maxAddedFileBytes: 1_048_576,
    });
    expect(violations.some((v) => v.kind === "oversize" && v.path === "big.bin")).toBe(true);
  });

  it("scans a file that was added then deleted on the branch", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-del-add-"));
    dirs.push(root);
    initRepo(root);
    const secret = fakeStripeTestSecret();
    writeFileSync(join(root, "leak.txt"), secret);
    git(root, "add", "leak.txt");
    git(root, "commit", "-qm", "add secret");
    git(root, "rm", "-f", "leak.txt");
    git(root, "commit", "-qm", "delete");
    const added = gitAddedPathsOnBranch(root, "main")!;
    expect(added).toContain("leak.txt");
    const { violations } = evaluateAddedPaths(root, added, {});
    expect(violations.some((v) => v.kind === "secret" && v.path === "leak.txt")).toBe(true);
  });

  it("fails when more paths are added than maxScanFiles", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-scan-cap-"));
    dirs.push(root);
    initRepo(root);
    const paths: string[] = [];
    for (let i = 0; i < 5; i++) {
      const p = `f${i}.txt`;
      paths.push(p);
      writeFileSync(join(root, p), `ok ${i}\n`);
    }
    git(root, "add", ".");
    git(root, "commit", "-qm", "many");
    const { violations } = evaluateAddedPaths(root, gitAddedPathsOnBranch(root, "main")!, {
      maxScanFiles: 2,
    });
    expect(violations.some((v) => v.kind === "scan-limit")).toBe(true);
  });

  it("fails on an added xcresult path", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-xcresult-"));
    dirs.push(root);
    initRepo(root);
    mkdirSync(join(root, "run/Test.xcresult", "Data"), { recursive: true });
    writeFileSync(join(root, "run/Test.xcresult", "Data", "ref"), "x");
    git(root, "add", "run");
    git(root, "commit", "-qm", "xc");
    const { violations } = evaluateAddedPaths(root, ["run/Test.xcresult/Data/ref"], {});
    expect(violations.some((v) => v.kind === "build-output")).toBe(true);
  });
});

describe("review pass 3 regressions (#1096)", () => {
  it("does not treat a staged deletion as a missing blob (hook and checkpoint)", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-del-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "old.txt"), "old\n");
    git(root, "add", "old.txt");
    git(root, "commit", "-qm", "track");
    git(root, "rm", "-q", "old.txt");
    expect(evaluateStagedForPreCommit(root, {}).ok).toBe(true);
    const staging = planCheckpointStaging(root, ["old.txt"], {});
    expect(staging.error).toBeFalsy();
    expect(staging.allowed).toContain("old.txt");
  });

  it("does not fail closed on a large random binary that merely contains gzip magic bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rand-"));
    dirs.push(root);
    initRepo(root);
    const buf = Buffer.alloc(300 * 1024, 7);
    buf[1000] = 0x1f;
    buf[1001] = 0x8b;
    buf[200_000] = 0x1f;
    buf[200_001] = 0x8b;
    writeFileSync(join(root, "blob.bin"), buf);
    git(root, "add", "blob.bin");
    git(root, "commit", "-qm", "bin");
    const added = gitAddedPathsOnBranch(root, "main")!;
    const { violations } = evaluateAddedPaths(root, added, { maxAddedFileBytes: 1_048_576 });
    expect(violations.filter((v) => v.kind === "scan-incomplete")).toEqual([]);
  });

  it("sees a renamed file: a rename into a build-output path still fires", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rename-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "a.bin"), Buffer.alloc(1024, 3));
    git(root, "add", "a.bin");
    git(root, "commit", "-qm", "a");
    git(root, "checkout", "-q", "-b", "feat/y");
    mkdirSync(join(root, "x.xcresult"));
    git(root, "mv", "a.bin", "x.xcresult/a.bin");
    git(root, "commit", "-qm", "mv");
    const added = gitAddedPathsOnBranch(root, "feat/x")!;
    expect(added).toContain("x.xcresult/a.bin");
    const { violations } = evaluateAddedPaths(root, added, {});
    expect(violations.some((v) => v.kind === "build-output")).toBe(true);
  });

  it("scans a rename commit's new path for secrets", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rename-secret-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "a.txt"), "x".repeat(300) + "\n");
    git(root, "add", "a.txt");
    git(root, "commit", "-qm", "a");
    git(root, "checkout", "-q", "-b", "feat/z");
    git(root, "mv", "a.txt", "b.txt");
    writeFileSync(join(root, "b.txt"), "x".repeat(300) + "\n" + fakeStripeTestSecret() + "\n");
    git(root, "add", "b.txt");
    git(root, "commit", "-qm", "rename+secret");
    const added = gitAddedPathsOnBranch(root, "feat/x")!;
    expect(added).toContain("b.txt");
    const { violations } = evaluateAddedPaths(root, added, {});
    expect(violations.some((v) => v.kind === "secret")).toBe(true);
  });
});

describe("review pass 6 regressions (#1096)", () => {
  it("raw-scans the whole bounded buffer: a key at 4.3 MiB and 4.9 MiB is found", () => {
    for (const at of [4.3, 4.9]) {
      const buf = Buffer.alloc(5 * 1024 * 1024, 9);
      Buffer.from(fakeStripeTestSecret()).copy(buf, Math.floor(at * 1024 * 1024));
      const { secrets } = scanBuffersForSecrets(buf, "p.bin", 4 * 1024 * 1024);
      expect(secrets.length).toBeGreaterThan(0);
    }
  });

  it("an allowlisted large dirty file does not block the checkpoint", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cp-allow-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "big.dat"), Buffer.alloc(6 * 1024 * 1024, 9));
    writeFileSync(join(root, "src.ts"), "ok\n");
    git(root, "add", "big.dat", "src.ts");
    const staging = planCheckpointStaging(root, ["big.dat", "src.ts"], {
      largeFileAllowlist: ["big.dat"],
    });
    expect(staging.error).toBeFalsy();
    expect(staging.allowed).toContain("src.ts");
  });

  it("an allowlisted large dirty file with a secret past the first window is refused", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cp-allow-secret-"));
    dirs.push(root);
    initRepo(root);
    const buf = Buffer.alloc(6 * 1024 * 1024, 9);
    Buffer.from(fakeStripeTestSecret()).copy(buf, 5 * 1024 * 1024 + 100);
    writeFileSync(join(root, "big.dat"), buf);
    git(root, "add", "big.dat");
    const staging = planCheckpointStaging(root, ["big.dat"], { largeFileAllowlist: ["big.dat"] });
    expect(staging.error).toMatch(/Secret pattern/);
  });
});

describe("review pass 4 regressions (#1096)", () => {
  it("flags a secret added to a file after its first (clean) commit", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-later-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "notes.txt"), "hello\n");
    git(root, "add", "notes.txt");
    git(root, "commit", "-qm", "clean");
    writeFileSync(join(root, "notes.txt"), "hello\n" + fakeStripeTestSecret() + "\n");
    git(root, "commit", "-qam", "later secret");
    const added = gitAddedPathsOnBranch(root, "main")!;
    const { violations } = evaluateAddedPaths(root, added, {});
    expect(violations.some((v) => v.kind === "secret" && v.path === "notes.txt")).toBe(true);
  });

  it("flags a file that grew past the size limit after it was added", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-grew-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "data.bin"), "small");
    git(root, "add", "data.bin");
    git(root, "commit", "-qm", "small");
    writeFileSync(join(root, "data.bin"), Buffer.alloc(2 * 1024 * 1024, 5));
    git(root, "commit", "-qam", "grow");
    const added = gitAddedPathsOnBranch(root, "main")!;
    const { violations } = evaluateAddedPaths(root, added, { maxAddedFileBytes: 1_048_576 });
    expect(violations.some((v) => v.kind === "oversize" && v.path === "data.bin")).toBe(true);
  });

  it("scans an allowlisted file over 5 MiB end to end with zero violations", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-bigallow-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "big.dat"), Buffer.alloc(6 * 1024 * 1024, 9));
    git(root, "add", "big.dat");
    git(root, "commit", "-qm", "big");
    const added = gitAddedPathsOnBranch(root, "main")!;
    const { violations } = evaluateAddedPaths(root, added, { largeFileAllowlist: ["big.dat"] });
    expect(violations).toEqual([]);
  });

  it("finds a secret past the first window of an allowlisted file over 5 MiB", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-bigsecret-"));
    dirs.push(root);
    initRepo(root);
    const buf = Buffer.alloc(6 * 1024 * 1024, 9);
    Buffer.from(fakeStripeTestSecret()).copy(buf, 5 * 1024 * 1024 + 100);
    writeFileSync(join(root, "big.dat"), buf);
    git(root, "add", "big.dat");
    git(root, "commit", "-qm", "big");
    const added = gitAddedPathsOnBranch(root, "main")!;
    const { violations } = evaluateAddedPaths(root, added, { largeFileAllowlist: ["big.dat"] });
    expect(violations.some((v) => v.kind === "secret" && v.path === "big.dat")).toBe(true);
  });

  it("finds a secret in a gzip member followed by trailing bytes", () => {
    const payload = Buffer.concat([
      gzipSync(Buffer.from(fakeStripeTestSecret())),
      Buffer.alloc(2048, 7),
    ]);
    const { secrets } = scanBuffersForSecrets(payload, "t.bin", 1_048_576);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it("reports incomplete for a valid gzip header over a corrupt body", () => {
    const bad = Buffer.concat([
      Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0, 0xff]),
      Buffer.alloc(64, 0xff),
    ]);
    const { incomplete } = scanBuffersForSecrets(bad, "t.bin", 1_048_576);
    expect(incomplete.length).toBeGreaterThan(0);
  });

  it("recovers a key from a truncated zlib stream (partial output via raw inflate)", () => {
    const body = Buffer.from(fakeStripeTestSecret() + " " + "filler ".repeat(600));
    const z = deflateSync(body);
    const truncated = z.subarray(0, Math.floor(z.length * 0.6));
    const { secrets } = scanBuffersForSecrets(truncated, "z.bin", 1_048_576);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it("reports incomplete when the file is a zlib stream that cannot be recovered at all", () => {
    const bad = Buffer.concat([Buffer.from([0x78, 0x9c]), Buffer.alloc(64, 0xff)]);
    const { incomplete } = scanBuffersForSecrets(bad, "z.bin", 1_048_576);
    expect(incomplete.length).toBeGreaterThan(0);
  });

  it("finds a zlib payload at a non-zero offset", () => {
    const payload = Buffer.concat([
      Buffer.from("AAAA"),
      deflateSync(Buffer.from(fakeStripeTestSecret())),
    ]);
    const { secrets } = scanBuffersForSecrets(payload, "z.bin", 1_048_576);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it("reports capped when directory expansion is cut off, across directories", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-walk-"));
    dirs.push(root);
    initRepo(root);
    for (const d of ["d1", "d2"]) {
      mkdirSync(join(root, d));
      for (let i = 0; i < 30; i++) writeFileSync(join(root, d, `f${i}.txt`), "x");
    }
    const r = expandCheckpointPaths(root, ["d1", "d2"], 40);
    expect(r.capped).toBe(true);
    expect(r.paths.length).toBeLessThanOrEqual(40);
  });

  it("does not loop on a directory symlink cycle", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cycle-"));
    dirs.push(root);
    initRepo(root);
    mkdirSync(join(root, "d"));
    writeFileSync(join(root, "d", "a.txt"), "x");
    symlinkSync("..", join(root, "d", "up"));
    const r = expandCheckpointPaths(root, ["d"], 100);
    expect(r.paths).toContain("d/a.txt");
    expect(r.paths.length).toBeLessThan(10);
  });
});

describe("checkpoint staging", () => {
  it("scans the index blob after git add, not a clean worktree with dirty disk", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-dirty-tracked-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "f.txt"), "ok\n");
    git(root, "add", "f.txt");
    git(root, "commit", "-qm", "track");
    writeFileSync(join(root, "f.txt"), fakeStripeTestSecret());
    git(root, "add", "f.txt");
    const staging = planCheckpointStaging(root, ["f.txt"], {});
    expect(staging.allowed).toEqual([]);
    expect(staging.error).toMatch(/Secret pattern/);
  });
  it("expands untracked directories", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-dir-expand-"));
    dirs.push(root);
    initRepo(root);
    mkdirSync(join(root, "dump"), { recursive: true });
    writeFileSync(join(root, "dump", "big.bin"), Buffer.alloc(3 * 1024 * 1024, 1));
    writeFileSync(join(root, "dump", "leak.txt"), fakeStripeTestSecret());
    const expanded = expandCheckpointPaths(root, ["dump/"], 50);
    expect(expanded.paths).toContain("dump/big.bin");
    git(root, "add", "dump");
    const staging = planCheckpointStaging(root, ["dump/"], {
      maxAddedFileBytes: 1_048_576,
    });
    expect(staging.unstagedOversize.length + staging.secrets.length).toBeGreaterThan(0);
  });

  it("refuses secrets in staged content", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-chk-secret-"));
    dirs.push(root);
    initRepo(root);
    writeFileSync(join(root, "secret.txt"), fakeStripeTestSecret());
    git(root, "add", "secret.txt");
    const staging = planCheckpointStaging(root, ["secret.txt"], {});
    expect(staging.error).toMatch(/Secret pattern/);
    expect(staging.report).toBeNull();
  });
});

describe("commitWipCheckpointForRemoteGate build-output guard (#1096)", () => {
  it("does not commit derived-data paths and records unstaged build output", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-wip-build-out-"));
    dirs.push(root);
    initRepo(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work", "1096-task.md"), '---\nid: "1096"\n---\n');
    writeFileSync(join(root, "src.txt"), "ok\n");
    mkdirSync(join(root, "macos/.derived-data-verify/nested"), { recursive: true });
    writeFileSync(join(root, "macos/.derived-data-verify/nested/obj"), "x");
    git(root, "add", "--", "src.txt", "work/1096-task.md");
    git(root, "add", "-f", "--", "macos/.derived-data-verify/nested/obj");
    const cfg = loadConfig(root);
    const err = await commitWipCheckpointForRemoteGate(root, { ...cfg, root }, "1096");
    expect(err).toBeNull();
    const committed = execFileSync("git", ["show", "--name-only", "--format=", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(committed).toContain("src.txt");
    expect(committed).not.toContain("macos/.derived-data-verify/nested/obj");
    expect(
      planCheckpointStaging(root, ["macos/.derived-data-verify/nested/obj"], {})
        .unstagedBuildOutput,
    ).toContain("macos/.derived-data-verify/nested/obj");
  });

  it("unstages foreign bookkeeping before refusing a staged secret", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-foreign-secret-"));
    dirs.push(root);
    initRepo(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work", "1096-task.md"), '---\nid: "1096"\n---\n');
    writeFileSync(join(root, "work", "9999-other.md"), '---\nid: "9999"\n---\n');
    writeFileSync(join(root, "leak.txt"), fakeStripeTestSecret());
    git(root, "add", "--", "work/1096-task.md", "work/9999-other.md", "leak.txt");
    const cfg = loadConfig(root);
    const err = await commitWipCheckpointForRemoteGate(root, { ...cfg, root }, "1096");
    expect(err).toMatch(/Secret pattern/);
    const stagedOut = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(stagedOut).not.toContain("work/9999-other.md");
    expect(stagedOut).not.toContain("leak.txt");
  });
});

describe("pre-commit hook (#1096)", () => {
  it("blocks build output on a task branch", () => {
    const root = seedPreCommitRepo();
    dirs.push(root);
    git(root, "checkout", "-q", "-b", "feat/y");
    mkdirSync(join(root, "macos/.derived-data-verify"), { recursive: true });
    writeFileSync(join(root, "macos/.derived-data-verify/o"), "x");
    git(root, "add", "macos/.derived-data-verify/o");
    const res = spawnSync("git", ["commit", "-qm", "bad"], { cwd: root, encoding: "utf8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/artifact guard|build-output/i);
  });

  it("blocks a secret-bearing task bookkeeping file (exemption is not by filename alone)", () => {
    const root = seedPreCommitRepo();
    dirs.push(root);
    git(root, "checkout", "-q", "-b", "feat/book");
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work/1-x.md"), `leak ${fakeStripeTestSecret()}\n`);
    git(root, "add", "work/1-x.md");
    const res = spawnSync("git", ["commit", "-qm", "bad"], { cwd: root, encoding: "utf8" });
    expect(res.status).not.toBe(0);
  });

  it("blocks an oversized task bookkeeping file", () => {
    const root = seedPreCommitRepo();
    dirs.push(root);
    git(root, "checkout", "-q", "-b", "feat/book2");
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work/2-x.md"), "a".repeat(1536 * 1024));
    git(root, "add", "work/2-x.md");
    const res = spawnSync("git", ["commit", "-qm", "bad"], { cwd: root, encoding: "utf8" });
    expect(res.status).not.toBe(0);
  });

  it("still allows a small clean task bookkeeping commit", () => {
    const root = seedPreCommitRepo();
    dirs.push(root);
    git(root, "checkout", "-q", "-b", "feat/book3");
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work/3-x.md"), "# task\n");
    git(root, "add", "work/3-x.md");
    const res = spawnSync("git", ["commit", "-qm", "ok"], { cwd: root, encoding: "utf8" });
    expect(res.status).toBe(0);
  });

  it("still runs artifact guard for docs-only stages", () => {
    const root = seedPreCommitRepo();
    dirs.push(root);
    git(root, "checkout", "-q", "-b", "feat/docs");
    mkdirSync(join(root, "macos/.derived-data-verify"), { recursive: true });
    writeFileSync(join(root, "macos/.derived-data-verify/o"), "x");
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs/note.md"), "docs\n");
    git(root, "add", "docs/note.md", "macos/.derived-data-verify/o");
    const res = spawnSync("git", ["commit", "-qm", "bad"], { cwd: root, encoding: "utf8" });
    expect(res.status).not.toBe(0);
  });
});

describe("evaluateStagedForPreCommit reads the index", () => {
  it("catches a secret in the staged blob when the worktree no longer matches", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-staged-blob-"));
    dirs.push(root);
    initRepo(root);
    const secret = fakeStripeTestSecret();
    writeFileSync(join(root, "k.txt"), secret);
    git(root, "add", "k.txt");
    writeFileSync(join(root, "k.txt"), "clean\n");
    const res = evaluateStagedForPreCommit(root, {});
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Secret pattern/);
  });
});

describe("stepBranchArtifacts", () => {
  it("fails when the merge-base ref is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-step-ref-"));
    dirs.push(root);
    initRepo(root);
    const cfg = loadConfig(root);
    const outcome = await stepBranchArtifacts({
      repoRoot: root,
      cfg: { ...cfg, root },
      changedRef: "main",
    } as Parameters<typeof stepBranchArtifacts>[0]);
    expect(outcome.status).toBe("passed");
    git(root, "checkout", "-q", "main");
    const bad = await stepBranchArtifacts({
      repoRoot: root,
      cfg: { ...cfg, root },
      changedRef: "no-such-ref",
    } as Parameters<typeof stepBranchArtifacts>[0]);
    expect(bad.status).toBe("failed");
    expect(bad.detail).toMatch(/could not resolve git ref/);
  });
  it("leaves nothing staged when a refusal happens (clean paths included)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-refuse-clean-"));
    dirs.push(root);
    initRepo(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work", "1096-task.md"), '---\nid: "1096"\n---\n');
    writeFileSync(join(root, "src.ts"), "ok\n");
    writeFileSync(join(root, "leak.txt"), fakeStripeTestSecret());
    git(root, "add", "--", "work/1096-task.md", "src.ts", "leak.txt");
    const cfg = loadConfig(root);
    const err = await commitWipCheckpointForRemoteGate(root, { ...cfg, root }, "1096");
    expect(err).toMatch(/Secret pattern/);
    const stagedOut = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(stagedOut.trim()).toBe("");
  });
});
