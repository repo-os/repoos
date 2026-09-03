import { describe, expect, it } from "vitest";
import { taskAssetOffenders } from "../../commands/check";

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
});
