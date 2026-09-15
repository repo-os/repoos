import { describe, expect, it } from "vitest";
import { normalizeGuardDir, taskAssetOffenders } from "../../commands/check";

describe("taskAssetOffenders", () => {
  it("flags images and PDFs committed under work/ or inputs/", () => {
    const offenders = taskAssetOffenders([
      "work/.attachments/0123/screenshot-1.png",
      "work/0123-some-task.md",
      "inputs/.attachments/abc/Screenshot.jpeg",
      "inputs/abc-raw-thought.md",
      "inputs/spec.pdf",
    ]);
    expect(offenders).toEqual([
      "work/.attachments/0123/screenshot-1.png",
      "inputs/.attachments/abc/Screenshot.jpeg",
      "inputs/spec.pdf",
    ]);
  });

  it("allows product image assets outside work/ and inputs/", () => {
    expect(
      taskAssetOffenders([
        "src/ui-app/public/logo.svg",
        "src/ui-app/src/assets/icon.png",
        "docs/diagram.png",
        "screenshots/dashboard.png",
        "README.md",
      ]),
    ).toEqual([]);
  });

  it("ignores non-image files under work/ and inputs/", () => {
    expect(taskAssetOffenders(["work/0001-task.md", "inputs/.gitkeep", "inputs/note.md"])).toEqual(
      [],
    );
  });

  it("matches case-insensitively", () => {
    expect(taskAssetOffenders(["work/.attachments/1/A.PNG", "inputs/x/B.WebP"])).toEqual([
      "work/.attachments/1/A.PNG",
      "inputs/x/B.WebP",
    ]);
  });

  it("flags binaries under a custom workDir/inputsDir from repoos.toml", () => {
    expect(
      taskAssetOffenders(
        [
          "tasks/.attachments/0350/screenshot.png",
          "tasks/0350-some-task.md",
          "inbox/.attachments/abc/spec.pdf",
          "inbox/abc-raw-thought.md",
        ],
        { workDir: "tasks", inputsDir: "inbox" },
      ),
    ).toEqual(["tasks/.attachments/0350/screenshot.png", "inbox/.attachments/abc/spec.pdf"]);
  });

  it("does not flag the default folders when custom ones are configured", () => {
    expect(
      taskAssetOffenders(["work/.attachments/1/a.png", "inputs/b.pdf"], {
        workDir: "tasks",
        inputsDir: "inbox",
      }),
    ).toEqual([]);
  });

  it("normalizes a leading ./ so a configured workDir still matches git's root-relative paths", () => {
    expect(
      taskAssetOffenders(["tasks/.attachments/1/a.png"], {
        workDir: "./tasks",
        inputsDir: "inbox",
      }),
    ).toEqual(["tasks/.attachments/1/a.png"]);
  });

  it("drops a dir that normalizes to empty instead of matching everything", () => {
    // workDir = "" (or "." / "./") can't be scoped to a real directory — the
    // guard must disable itself for that path, never fall back to matching
    // every tracked file (a "" prefix would match unconditionally via
    // startsWith("")).
    expect(
      taskAssetOffenders(["src/ui-app/public/logo.png", "inbox/spec.pdf"], {
        workDir: "",
        inputsDir: "inbox",
      }),
    ).toEqual(["inbox/spec.pdf"]);
  });
});

describe("normalizeGuardDir", () => {
  it("strips a leading ./ and trailing slashes", () => {
    expect(normalizeGuardDir("./tasks")).toBe("tasks");
    expect(normalizeGuardDir("tasks/")).toBe("tasks");
    expect(normalizeGuardDir("./tasks/")).toBe("tasks");
    expect(normalizeGuardDir("././tasks")).toBe("tasks");
    expect(normalizeGuardDir("nested/dir")).toBe("nested/dir");
  });

  it("normalizes an unusable dir to empty", () => {
    expect(normalizeGuardDir("")).toBe("");
    expect(normalizeGuardDir(".")).toBe("");
    expect(normalizeGuardDir("./")).toBe("");
  });

  it("normalizes non-repo-relative paths to empty (they can never match ls-files output)", () => {
    expect(normalizeGuardDir("../tasks")).toBe("");
    expect(normalizeGuardDir("foo/../tasks")).toBe("");
    expect(normalizeGuardDir("/abs/tasks")).toBe("");
    expect(normalizeGuardDir("~/tasks")).toBe("");
  });
});

describe("taskAssetOffenders with non-repo-relative dirs", () => {
  it("does not silently match when a configured dir escapes the repo root", () => {
    // `../tasks` normalizes to empty, so it must not fall back to matching
    // everything — only the usable inputsDir is matched.
    expect(
      taskAssetOffenders(["tasks/.attachments/1/a.png", "inbox/spec.pdf"], {
        workDir: "../tasks",
        inputsDir: "inbox",
      }),
    ).toEqual(["inbox/spec.pdf"]);
  });
});
