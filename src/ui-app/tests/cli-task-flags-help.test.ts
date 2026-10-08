/**
 * CLI help drift for `repoos new` / `repoos update` (#0699).
 *
 * The help text is generated from the flag tables plus a description map, so a
 * flag can no longer be accepted while being absent from `--help` (and from the
 * top-level Tasks group). `repoos new` must also accept `--paths` / `--hold`
 * with the same parsing `repoos update` uses.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { NEW_FLAGS, UPDATE_FLAGS, NEW_USAGE, UPDATE_USAGE, cmdNew } from "../../commands/tasks";
import { NEW_FLAG_HELP, UPDATE_FLAG_HELP } from "../../cli/task-flags";
import { printCommandHelp, renderHelp } from "../../cli/help";
import { parseTask } from "../../core/task";

/**
 * Flags `cmdUpdate` handles specially, before the generic `UPDATE_FLAGS` lookup:
 * they are accepted but not part of the parse map.
 */
const SPECIAL_UPDATE_FLAGS = ["shots", "section", "section-body", "clear-questions", "force"];

const UPDATE_FLAG_NAMES = [...Object.keys(UPDATE_FLAGS), ...SPECIAL_UPDATE_FLAGS];

describe("task flag help is generated from the flag tables", () => {
  it("describes every flag UPDATE_FLAGS accepts", () => {
    for (const flag of Object.keys(UPDATE_FLAGS)) {
      const help = UPDATE_FLAG_HELP[flag];
      expect(help, `--${flag} is accepted but has no help entry`).toBeDefined();
      expect(help.desc.trim(), `--${flag} has an empty description`).not.toBe("");
    }
  });

  it("describes the flags cmdUpdate handles specially", () => {
    for (const flag of SPECIAL_UPDATE_FLAGS) {
      const help = UPDATE_FLAG_HELP[flag];
      expect(help, `--${flag} is accepted but has no help entry`).toBeDefined();
      expect(help.desc.trim(), `--${flag} has an empty description`).not.toBe("");
    }
  });

  it("keeps repoos new's accepted flags and its help map in lockstep", () => {
    expect([...NEW_FLAGS].sort()).toEqual(Object.keys(NEW_FLAG_HELP).sort());
    for (const flag of NEW_FLAGS) {
      expect(NEW_FLAG_HELP[flag].desc.trim(), `--${flag} has an empty description`).not.toBe("");
    }
  });

  it("lists every accepted flag in the usage lines", () => {
    for (const flag of NEW_FLAGS) expect(NEW_USAGE).toContain(`--${flag}`);
    for (const flag of UPDATE_FLAG_NAMES) expect(UPDATE_USAGE).toContain(`--${flag}`);
  });

  it("shows every flag in the top-level Tasks group", () => {
    const out = renderHelp(140);
    for (const flag of NEW_FLAGS) expect(out).toContain(`--${flag}`);
    for (const flag of UPDATE_FLAG_NAMES) expect(out).toContain(`--${flag}`);
  });

  it("shows every flag in the per-command help", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      expect(printCommandHelp("new", 200)).toBe(true);
      const newHelp = lines.join("\n");
      for (const flag of NEW_FLAGS) expect(newHelp).toContain(`--${flag}`);

      lines.length = 0;
      expect(printCommandHelp("update", 200)).toBe(true);
      const updateHelp = lines.join("\n");
      for (const flag of UPDATE_FLAG_NAMES) expect(updateHelp).toContain(`--${flag}`);
    } finally {
      spy.mockRestore();
    }
  });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeCliRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-flags-cli-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(root, "work", "0001-test.md"),
    `---\nid: "0001"\ntitle: Test task\ntype: feature\nstatus: active\npriority: p2\narea: web\nassigned_to: ai\nbranch: feat/test\n---\nBody.\n`,
  );
  writeFileSync(join(root, "repoos.toml"), "");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

async function withCwd<T>(dir: string, fn: () => T): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}

const tmpRoots: string[] = [];

afterEach(() => {
  for (const r of tmpRoots) rmFixture(r);
  tmpRoots.length = 0;
  vi.restoreAllMocks();
});

describe("repoos new --paths / --hold", () => {
  it("writes paths and hold into the created task", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    try {
      await withCwd(root, () =>
        cmdNew(["A held task", "--paths", "src/a.ts, src/b.ts", "--hold", "true"]),
      );
      expect(process.exitCode).toBe(prevExit);

      const file = readdirSync(join(root, "work")).find((f) => f.includes("a-held-task"));
      expect(file).toBeTruthy();
      const absPath = join(root, "work", file!);
      const task = parseTask({
        content: readFileSync(absPath, "utf8"),
        absPath,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(task.isHeld).toBe(true);
      expect(task.paths).toEqual(["src/a.ts", "src/b.ts"]);
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("rejects an invalid --hold value without creating a task", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(" ")));
    try {
      await withCwd(root, () => cmdNew(["Bad hold", "--hold", "maybe"]));
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toContain("--hold must be true or false");
      expect(readdirSync(join(root, "work"))).toEqual(["0001-test.md"]);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });
});
