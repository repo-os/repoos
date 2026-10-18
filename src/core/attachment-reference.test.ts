import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepoOS } from "./repoos.js";
import {
  generateAttachmentObjectName,
  isLegacyScreenshotObjectName,
  isStableAttachmentObjectName,
  mimeForAttachmentObjectName,
  parseTaskAttachmentReferences,
  resolveTaskAttachmentReference,
  taskAttachmentApiPath,
  taskAttachmentStore,
} from "./attachment-reference.js";
import { saveScreenshot } from "../server/attachments.js";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("attachment reference format (#0661)", () => {
  it("generates opaque att_<uuid>.<ext> object names", () => {
    const a = generateAttachmentObjectName(".png");
    const b = generateAttachmentObjectName(".png");
    expect(a).not.toBe(b);
    expect(isStableAttachmentObjectName(a)).toBe(true);
    expect(isStableAttachmentObjectName("screenshot-1.png")).toBe(false);
    expect(isLegacyScreenshotObjectName("screenshot-1.png")).toBe(true);
  });

  it("builds stable API paths without secrets or storage coordinates", () => {
    const path = taskAttachmentApiPath("0661", "att_test.png");
    expect(path).toBe("/api/tasks/0661/attachments/att_test.png");
    expect(path).not.toContain("work/");
    expect(path).not.toContain("http");
  });

  it("parses embedded image links from task Markdown", () => {
    const id = "0123";
    const object = generateAttachmentObjectName(".png");
    const md = `## Screenshots\n\n![bug](${taskAttachmentApiPath(id, object)})\n`;
    const refs = parseTaskAttachmentReferences(md);
    expect(refs).toEqual([{ taskId: id, objectName: object, alt: "bug" }]);
  });

  it("resolves stable references through the storage provider", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-att-ref-"));
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "ref" });
      const saved = saveScreenshot(repoos.config, task, {
        name: "shot.png",
        mime: "image/png",
        data: PNG_1PX,
      });
      expect("error" in saved).toBe(false);
      const objectName = (saved as { url: string }).url.split("/").pop()!;
      expect(isStableAttachmentObjectName(decodeURIComponent(objectName))).toBe(true);

      const resolved = resolveTaskAttachmentReference(repoos.config, task.id, objectName);
      expect(resolved?.data.equals(Buffer.from(PNG_1PX, "base64"))).toBe(true);
      expect(mimeForAttachmentObjectName(objectName)).toBe("image/png");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still resolves legacy screenshot-N object names", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-att-legacy-"));
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "legacy" });
      taskAttachmentStore(repoos.config).put(
        task.id,
        "screenshot-1.png",
        Buffer.from(PNG_1PX, "base64"),
      );
      const resolved = resolveTaskAttachmentReference(repoos.config, task.id, "screenshot-1.png");
      expect(resolved?.objectName).toBe("screenshot-1.png");
      expect(resolved?.data.length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
