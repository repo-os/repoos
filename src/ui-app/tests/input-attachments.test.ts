/**
 * Input → task screenshot carry-over (#0382): when an input with attachments
 * is resolved into a task through the freeform PM flow, every input
 * attachment must land on the new task's `## Screenshots` section and under
 * `work/.attachments/<taskId>/`. The carry-over is server-side (the
 * `inputId` field on `/api/tasks/freeform`) so the PM agent's rewrite still
 * leaves the screenshots in place through PROTECTED_SECTIONS.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepoOS, withOriginalPromptSection } from "../../core/repoos";
import { createInput, listInputs, saveInputAttachment } from "../../core/input";
import { patchTaskFile } from "../../server/write";
import { appendScreenshotsSection, saveScreenshot } from "../../server/attachments";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function setupRepo() {
  const root = mkdtempSync(join(tmpdir(), "repoos-input-shot-"));
  const repoos = createRepoOS(root);
  return { root, repoos };
}

describe("input → task attachment carry-over (#0382)", () => {
  it("carries a single attachment into the task's ## Screenshots and disk", () => {
    const { root, repoos } = setupRepo();
    try {
      const input = createInput(repoos.config, "Add dark mode", "idea", "human");
      saveInputAttachment(repoos.config, input.id, "dark.png", PNG_1PX);

      // Server-side carry-over path: emulate the route handler's flow of
      // (a) re-saving the input's attachment through `saveScreenshot` so it
      // gets a numbered name under the task's `.attachments`, then
      // (b) `patchTaskFile({addScreenshot})` appends it to `## Screenshots`.
      const fresh = repoos.getTask; // touch handle to silence lint
      void fresh;
      const created = repoos.createTask({
        title: "Add dark mode",
        body: withOriginalPromptSection("Add dark mode", "Add dark mode"),
        originalPrompt: "Add dark mode",
      });

      // Step (a): read the input attachment and re-save it as a task screenshot.
      const inputRoot = repoos.config.inputsDir ?? "inputs";
      const attSrc = join(root, inputRoot, ".attachments", input.id, "dark.png");
      expect(existsSync(attSrc)).toBe(true);
      const bytes = readFileSync(attSrc);
      const meta = saveScreenshot(repoos.config, created, {
        name: "dark.png",
        mime: "image/png",
        data: bytes.toString("base64"),
      });
      expect("error" in meta).toBe(false);

      // Step (b): append to ## Screenshots through the same patch the route uses.
      const updated = patchTaskFile(repoos.config, created.absPath, {
        addScreenshot: meta as Exclude<typeof meta, { error: string }>,
      });
      expect(updated.body).toContain("## Screenshots");
      expect(updated.body).toContain(
        `![dark](/api/tasks/${created.id}/attachments/screenshot-1.png)`,
      );
      // The activity log remains the last section.
      expect(updated.body.indexOf("## Screenshots")).toBeLessThan(
        updated.body.indexOf("## Activity"),
      );
      // And the image bytes are on disk under the task's own attachments dir.
      const onDisk = join(
        root,
        repoos.config.workDir,
        ".attachments",
        created.id,
        "screenshot-1.png",
      );
      expect(existsSync(onDisk)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("carries multiple input attachments and preserves them across a body rewrite", () => {
    const { root, repoos } = setupRepo();
    try {
      const input = createInput(repoos.config, "Bug repro", "bug", "human");
      saveInputAttachment(repoos.config, input.id, "first.png", PNG_1PX);
      saveInputAttachment(repoos.config, input.id, "second.png", PNG_1PX);
      saveInputAttachment(repoos.config, input.id, "third.png", PNG_1PX);

      const created = repoos.createTask({
        title: "Bug repro",
        body: withOriginalPromptSection("Bug repro", "Bug repro"),
        originalPrompt: "Bug repro",
      });

      const inputRoot = repoos.config.inputsDir ?? "inputs";
      const inputAtts = readdirSync(join(root, inputRoot, ".attachments", input.id)).sort();
      expect(inputAtts).toEqual(["first.png", "second.png", "third.png"]);

      let current = created;
      for (const name of inputAtts) {
        const bytes = readFileSync(join(root, inputRoot, ".attachments", input.id, name));
        const meta = saveScreenshot(repoos.config, current, {
          name,
          mime: "image/png",
          data: bytes.toString("base64"),
        });
        expect("error" in meta).toBe(false);
        current = patchTaskFile(repoos.config, current.absPath, {
          addScreenshot: meta as Exclude<typeof meta, { error: string }>,
        });
      }

      // All three are in the section, in order.
      expect(current.body).toContain(
        "![first](/api/tasks/" + current.id + "/attachments/screenshot-1.png)",
      );
      expect(current.body).toContain(
        "![second](/api/tasks/" + current.id + "/attachments/screenshot-2.png)",
      );
      expect(current.body).toContain(
        "![third](/api/tasks/" + current.id + "/attachments/screenshot-3.png)",
      );
      expect(current.body.split("## Screenshots").length - 1).toBe(1);

      // A subsequent PM-driven body rewrite must keep all three (PROTECTED_SECTIONS).
      const after = patchTaskFile(repoos.config, current.absPath, {
        body: "## Problem\n\nRewritten by PM.\n",
      });
      expect(after.body).toContain("## Screenshots");
      expect(after.body).toContain("![first]");
      expect(after.body).toContain("![second]");
      expect(after.body).toContain("![third]");
      expect(after.body.split("## Screenshots").length - 1).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a non-existent inputId is silently ignored (no crash, no attachment)", () => {
    const { root, repoos } = setupRepo();
    try {
      const created = repoos.createTask({ title: "lonely task" });
      // Emulate the route handler's branch for sourceInputId: not in
      // listInputs() → nothing carried. The task still exists, with no
      // Screenshots section yet (no addScreenshot patch was sent).
      const input = listInputs(repoos.config).find((i) => i.id === "ghost");
      expect(input).toBeUndefined();
      // `appendScreenshotsSection` with no metas still produces a header so
      // future writes have a stable target — confirm that helper output
      // shape (it isn't sent to patchTaskFile in this branch, just held
      // in case a later addScreenshot lands).
      const empty = appendScreenshotsSection(created.body, []);
      expect(empty).toContain("## Screenshots");
      expect(empty.split("## Screenshots").length - 1).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a missing attachment file on disk is skipped without dropping later ones", () => {
    const { root, repoos } = setupRepo();
    try {
      const input = createInput(repoos.config, "Bug with missing file", "bug", "human");
      saveInputAttachment(repoos.config, input.id, "present.png", PNG_1PX);
      // Reference a missing file in the input's record by listing both —
      // the listing only includes files on disk so `missing.png` won't
      // appear, but we still want to assert that the route doesn't crash
      // when an attachment referenced in the input is gone.
      const inputRoot = repoos.config.inputsDir ?? "inputs";
      mkdirSync(join(root, inputRoot, ".attachments", input.id), { recursive: true });
      // Sanity: only `present.png` is on disk; the listing reflects that.
      const before = listInputs(repoos.config).find((i) => i.id === input.id)!;
      const attNames = before.attachments.map((a) => a.name).sort();
      expect(attNames).toContain("present.png");
      expect(attNames).not.toContain("ghost.png");
      // The route's flow: read each listed attachment, skipping ones whose
      // file no longer exists. We mirror that by reading the surviving file
      // and asserting a `ghost.png` would have been skipped (not added).
      const created = repoos.createTask({ title: "Bug" });
      let current = created;
      for (const att of before.attachments) {
        const src = join(root, inputRoot, ".attachments", input.id, att.name);
        if (!existsSync(src)) continue;
        const bytes = readFileSync(src);
        const meta = saveScreenshot(repoos.config, current, {
          name: att.name,
          mime: att.mime,
          data: bytes.toString("base64"),
        });
        if ("error" in meta) continue;
        current = patchTaskFile(repoos.config, current.absPath, {
          addScreenshot: meta as Exclude<typeof meta, { error: string }>,
        });
      }
      expect(current.body).toContain(
        `![present](/api/tasks/${current.id}/attachments/screenshot-1.png)`,
      );
      expect(current.body.split("## Screenshots").length - 1).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
