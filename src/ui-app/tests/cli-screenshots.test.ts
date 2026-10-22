/**
 * `repoos new --screenshot` / `repoos update --screenshot` (#0763).
 *
 * An agent handed screenshots in chat must be able to attach them when it
 * creates or updates a task, through the same storage the UI upload uses — not
 * by hand-copying files and hand-editing `## Screenshots`. These tests drive
 * the real CLI commands against a throwaway git repo and assert the images land
 * under the gitignored `work/.attachments/<id>/`, the section is written before
 * `## Activity`, numbering continues across invocations, and nothing under
 * `work/` is staged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { cmdNew, cmdUpdate } from "../../commands/tasks";
import { parseTask } from "../../core/task";
import { STABLE_ATTACHMENT_OBJECT_RE } from "../../core/attachment-reference";

function attachmentObjectsInBody(body: string): string[] {
  return [...body.matchAll(/\/attachments\/([^)]+)\)/g)].map((m) => decodeURIComponent(m[1]));
}

/** A 1x1 transparent PNG, base64-encoded. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeCliRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-screenshot-cli-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(root, "work", "0001-test.md"),
    `---\nid: "0001"\ntitle: Test task\ntype: feature\nstatus: active\npriority: p2\narea: web\nassigned_to: ai\nbranch: feat/test\n---\n## Problem\n\nBody.\n\n## Activity\n\n- 2026-01-01T00:00:00Z · created · t@example.com\n`,
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

/**
 * Run a CLI command with `process.exitCode` reset first (vitest shares one
 * process across tests, so a failure in an earlier case leaks the code), and
 * return the code the command set — `0` when it left it unset.
 *
 * The reset is `0`, never `undefined`: Bun's `process.exitCode` setter ignores
 * an `undefined` assignment and keeps the previous value, while Node clears it.
 * Since the whole suite runs under whichever runtime `process.execPath` is
 * (Bun here), `= undefined` would let an earlier failure's `1` leak into a later
 * success — the same test passing under an ad-hoc Node `vitest` run and failing
 * under `bun run test`. `0` is an explicit clean baseline in both.
 */
async function runCli(fn: () => void): Promise<number> {
  process.exitCode = 0;
  await fn();
  return process.exitCode ?? 0;
}

function writePng(
  root: string,
  name: string,
  bytes: Buffer = Buffer.from(PNG_1PX, "base64"),
): string {
  const path = join(root, name);
  writeFileSync(path, bytes);
  return path;
}

function loadTask(root: string, id: string): ReturnType<typeof parseTask> {
  const file = readdirSync(join(root, "work")).find((f) => f.startsWith(`${id}-`));
  if (!file) throw new Error(`task ${id} not found`);
  const absPath = join(root, "work", file);
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

function latestTaskId(root: string): string {
  const files = readdirSync(join(root, "work")).filter(
    (f) => /^\d{4}-/.test(f) && f !== "0001-test.md",
  );
  const ids = files.map((f) => f.slice(0, 4)).sort();
  return ids[ids.length - 1];
}

const tmpRoots: string[] = [];

afterEach(() => {
  for (const r of tmpRoots) rmFixture(r);
  tmpRoots.length = 0;
  // `0`, not `undefined` — see runCli: Bun keeps a stale code on `= undefined`.
  process.exitCode = 0;
  vi.restoreAllMocks();
});

describe("repoos new --screenshot", () => {
  it("attaches two images, writes ## Screenshots before Activity, and stages nothing", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    try {
      const a = writePng(root, "a.png");
      const b = writePng(root, "b.png");
      const code = await runCli(() =>
        withCwd(root, () => cmdNew(["Two images", "--screenshot", a, "--screenshot", b])),
      );
      expect(code).toBe(0);

      const id = latestTaskId(root);
      const task = loadTask(root, id);
      const shotsIdx = task.body.indexOf("## Screenshots");
      const activityIdx = task.body.indexOf("## Activity");
      expect(shotsIdx).toBeGreaterThan(-1);
      expect(shotsIdx).toBeLessThan(activityIdx);
      expect(task.body).toContain(`![a](/api/tasks/${id}/attachments/`);
      expect(task.body).toContain(`![b](/api/tasks/${id}/attachments/`);

      const dir = join(root, "work", ".attachments", id);
      const objects = attachmentObjectsInBody(task.body);
      expect(objects).toHaveLength(2);
      expect(readdirSync(dir).sort()).toEqual(objects.sort());
      expect(objects.every((o) => STABLE_ATTACHMENT_OBJECT_RE.test(o))).toBe(true);

      // Nothing under work/ is staged — the task .md and the gitignored pixels
      // are not `git add`ed by the command (the helper commits the .md only,
      // and the attachment dir must never appear in the index).
      const staged = git(root, ["diff", "--cached", "--name-only"]);
      expect(staged).not.toContain(".attachments");
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("labels a single image with --caption", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    try {
      const a = writePng(root, "a.png");
      const code = await runCli(() =>
        withCwd(root, () => cmdNew(["Captioned", "--screenshot", a, "--caption", "the crash"])),
      );
      expect(code).toBe(0);
      const id = latestTaskId(root);
      const captioned = loadTask(root, id).body;
      expect(captioned).toContain(`![the crash](/api/tasks/${id}/attachments/att_`);
      expect(STABLE_ATTACHMENT_OBJECT_RE.test(attachmentObjectsInBody(captioned)[0])).toBe(true);
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("writes two captions in order for two --screenshot flags", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    try {
      const a = writePng(root, "a.png");
      const b = writePng(root, "b.png");
      const code = await runCli(() =>
        withCwd(root, () =>
          cmdNew([
            "Two captions",
            "--screenshot",
            a,
            "--caption",
            "first",
            "--screenshot",
            b,
            "--caption",
            "second",
          ]),
        ),
      );
      expect(code).toBe(0);
      const id = latestTaskId(root);
      const body = loadTask(root, id).body;
      expect(body).toContain(`![first](/api/tasks/${id}/attachments/`);
      expect(body).toContain(`![second](/api/tasks/${id}/attachments/`);
      expect(body.indexOf("![first]")).toBeLessThan(body.indexOf("![second]"));
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("applies one caption to the first of two screenshots", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    try {
      const a = writePng(root, "a.png");
      const c = writePng(root, "c.png");
      const code = await runCli(() =>
        withCwd(root, () =>
          cmdNew([
            "Partial caption",
            "--screenshot",
            a,
            "--caption",
            "only first",
            "--screenshot",
            c,
          ]),
        ),
      );
      expect(code).toBe(0);
      const id = latestTaskId(root);
      const body = loadTask(root, id).body;
      expect(body).toContain(`![only first](/api/tasks/${id}/attachments/`);
      expect(body).toContain(`![c](/api/tasks/${id}/attachments/`);
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("errors when there are more captions than screenshots", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(" ")));
    try {
      const a = writePng(root, "a.png");
      const b = writePng(root, "b.png");
      const bad = await runCli(() =>
        withCwd(root, () =>
          cmdNew([
            "Too many captions",
            "--screenshot",
            a,
            "--screenshot",
            b,
            "--caption",
            "one",
            "--caption",
            "two",
            "--caption",
            "three",
          ]),
        ),
      );
      expect(bad).toBe(1);
      expect(errors.join("\n")).toContain("3 caption(s) but only 2 --screenshot");
      expect(readdirSync(join(root, "work"))).toEqual(["0001-test.md"]);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });

  it("reports a missing file without creating a task", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(" ")));
    try {
      const code = await runCli(() =>
        withCwd(root, () => cmdNew(["Missing image", "--screenshot", join(root, "nope.png")])),
      );
      expect(code).toBe(1);
      expect(errors.join("\n")).toContain("image not found");
      expect(readdirSync(join(root, "work"))).toEqual(["0001-test.md"]);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });

  it("rejects an unsupported mime and an oversize image before creating a task", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(" ")));
    try {
      const svg = writePng(root, "icon.svg", Buffer.from("<svg/>"));
      const bad = await runCli(() =>
        withCwd(root, () => cmdNew(["Bad type", "--screenshot", svg])),
      );
      expect(bad).toBe(1);
      expect(errors.join("\n")).toContain("unsupported image type");

      errors.length = 0;
      const big = writePng(root, "big.png", Buffer.alloc(10 * 1024 * 1024 + 1));
      const huge = await runCli(() =>
        withCwd(root, () => cmdNew(["Too big", "--screenshot", big])),
      );
      expect(huge).toBe(1);
      expect(errors.join("\n")).toContain("too large");

      expect(readdirSync(join(root, "work"))).toEqual(["0001-test.md"]);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });
});

describe("repoos update --screenshot", () => {
  it("adds a third image, continuing the numbering", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    try {
      const a = writePng(root, "a.png");
      const b = writePng(root, "b.png");
      await runCli(() =>
        withCwd(root, () => cmdNew(["Numbering", "--screenshot", a, "--screenshot", b])),
      );
      const id = latestTaskId(root);

      const c = writePng(root, "c.png");
      const code = await runCli(() => withCwd(root, () => cmdUpdate([id, "--screenshot", c])));
      expect(code).toBe(0);

      const task = loadTask(root, id);
      expect(task.body).toContain(`![c](/api/tasks/${id}/attachments/att_`);
      expect(task.body.indexOf("## Screenshots")).toBeLessThan(task.body.indexOf("## Activity"));
      const objects = attachmentObjectsInBody(task.body);
      expect(objects).toHaveLength(3);
      expect(readdirSync(join(root, "work", ".attachments", id)).sort()).toEqual(objects.sort());
      // Only one ## Screenshots heading — the update merged into the existing one.
      expect(task.body.match(/## Screenshots/g)?.length).toBe(1);
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("still applies metadata alongside a screenshot and reports a missing file", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(" ")));
    try {
      // A valid patch + screenshot writes both.
      const a = writePng(root, "a.png");
      const code = await runCli(() =>
        withCwd(root, () => cmdUpdate(["0001", "--priority", "p0", "--screenshot", a])),
      );
      expect(code).toBe(0);
      const task = loadTask(root, "0001");
      expect(task.priority).toBe("p0");
      expect(attachmentObjectsInBody(task.body)[0]?.startsWith("att_")).toBe(true);

      // A missing image is reported and the metadata patch is not applied.
      const bad = await runCli(() =>
        withCwd(root, () =>
          cmdUpdate(["0001", "--priority", "p3", "--screenshot", join(root, "no.png")]),
        ),
      );
      expect(bad).toBe(1);
      expect(errors.join("\n")).toContain("image not found");
      expect(loadTask(root, "0001").priority).toBe("p0");
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });

  it("requires --screenshot when --caption is given", async () => {
    const { root, clean } = makeCliRepo();
    tmpRoots.push(root);
    const prevExit = process.exitCode;
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(" ")));
    try {
      const code = await runCli(() =>
        withCwd(root, () => cmdUpdate(["0001", "--caption", "orphan"])),
      );
      expect(code).toBe(1);
      expect(errors.join("\n")).toContain("--caption requires --screenshot");
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });
});
