import { describe, expect, it } from "vitest";
import { annotateAttachmentCloudUploads } from "../src/lib/attachment-cloud-markdown";

describe("attachment cloud upload labels (#0666)", () => {
  it('wraps pending task attachment images with an "upload pending" caption', () => {
    const html =
      '<p><img src="/api/tasks/0666/attachments/att_x.png" alt="bug" loading="lazy"></p>';
    const out = annotateAttachmentCloudUploads(html, "0666", { "att_x.png": "pending" });
    expect(out).toContain('class="attachment-cloud-badge">upload pending</figcaption>');
    expect(out).toContain('src="/api/tasks/0666/attachments/att_x.png"');
  });

  it("leaves available attachments unmarked", () => {
    const html =
      '<p><img src="/api/tasks/0666/attachments/att_x.png" alt="bug" loading="lazy"></p>';
    const out = annotateAttachmentCloudUploads(html, "0666", { "att_x.png": "available" });
    expect(out).toBe(html);
  });
});
