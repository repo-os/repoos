import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitWorker } from "../../server/git-worker.js";

const workers: GitWorker[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const worker of workers.splice(0)) worker.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "repoos-worker-cache-"));
  roots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(root, "head"), "first");
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh
case "$*" in
  'rev-parse HEAD') cat "$PWD/head" ;;
  'merge-base --is-ancestor first second') exit 0 ;;
  'merge-base --is-ancestor '*) exit 1 ;;
  *'-- slow') sleep 5 ;;
  *' log '*)
    echo "$*" >> "$PWD/walks"
    case "$*" in
      *first..second*) printf '\\036two\\0372026-10-28T12:00:00Z\\nwork/a.md\\n' ;;
      *) printf '\\036one\\0372026-10-28T11:00:00Z\\nwork/a.md\\n' ;;
    esac ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 },
  );
  const launch: typeof spawn = ((command: string, args: string[], options: object) =>
    spawn(command, args, {
      ...options,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })) as typeof spawn;
  const start = () => {
    const worker = new GitWorker(root, launch);
    workers.push(worker);
    return worker;
  };
  return { root, start, walks: () => readFileSync(join(root, "walks"), "utf8").trim().split("\n") };
}

describe("directory history survives worker restarts", () => {
  it("reuses the saved HEAD after a bulk timeout and walks only new commits afterwards", async () => {
    const f = fixture();
    const worker = f.start();
    expect((await worker.directoryCommits(f.root, "work")).get("work/a.md")?.subject).toBe("one");
    await expect(
      worker.request("directory-commits", { root: f.root, directory: "slow" }, 100),
    ).rejects.toThrow("timed out");
    expect((await worker.directoryCommits(f.root, "work")).get("work/a.md")?.subject).toBe("one");
    expect(f.walks()).toHaveLength(1);
    writeFileSync(join(f.root, "head"), "second");
    expect((await worker.directoryCommits(f.root, "work")).get("work/a.md")?.subject).toBe("two");
    expect(f.walks()).toHaveLength(2);
    expect(f.walks()[1]).toContain("first..second");
  });

  it.each(["corrupt", "wrong-version", "non-ancestor"])(
    "rebuilds safely for %s cache state",
    async (state) => {
      const f = fixture();
      const worker = f.start();
      await worker.directoryCommits(f.root, "work");
      worker.close();
      const cacheDir = join(f.root, ".repoos/cache");
      const path = join(
        cacheDir,
        readdirSync(cacheDir).find((name) => name.startsWith("dir-log-"))!,
      );
      if (state === "corrupt") writeFileSync(path, "bad JSON");
      if (state === "wrong-version") writeFileSync(path, '{"version":0,"head":"first","rows":[]}');
      if (state === "non-ancestor") writeFileSync(join(f.root, "head"), "rewritten");
      expect((await f.start().directoryCommits(f.root, "work")).get("work/a.md")?.subject).toBe(
        "one",
      );
      expect(f.walks()).toHaveLength(2);
      expect(f.walks()[1]).not.toContain("..");
    },
  );
});
