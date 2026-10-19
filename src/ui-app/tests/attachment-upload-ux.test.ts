/**
 * Upload state + retry UX (#0664).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import PendingAttachmentList from "../src/components/PendingAttachmentList.vue";
import {
  attachmentUploadPhase,
  markAttachmentUploadFailed,
  markAttachmentUploading,
} from "../src/lib/attachment-upload-ui";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { PendingScreenshot } from "../src/stores/ui";

const sample: PendingScreenshot = {
  name: "shot.png",
  mime: "image/png",
  dataUrl: "data:image/png;base64,QUJD",
  size: 3,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("attachment-upload-ui helpers", () => {
  it("tracks uploading and failed phases on the same object", () => {
    const shot = { ...sample };
    expect(attachmentUploadPhase(shot)).toBe("selected");
    markAttachmentUploading(shot);
    expect(attachmentUploadPhase(shot)).toBe("uploading");
    markAttachmentUploadFailed(shot, new Error("network"));
    expect(attachmentUploadPhase(shot)).toBe("failed");
    expect(shot.uploadError).toBe("network");
  });
});

describe("PendingAttachmentList", () => {
  it("shows uploading status and a retry control after failure", async () => {
    const failed = { ...sample, uploadPhase: "failed" as const, uploadError: "nope" };
    const wrapper = mount(PendingAttachmentList, {
      props: { items: [failed] },
      global: { stubs: { ActivityIndicator: true, ScreenshotExpandButton: true } },
    });
    expect(wrapper.text()).toContain("nope");
    expect(wrapper.find(".ff-pending-file-retry").exists()).toBe(true);
    await wrapper.find(".ff-pending-file-retry").trigger("click");
    expect(wrapper.emitted("retry")?.[0]).toEqual([0]);
  });
});

describe("repo upload helpers", () => {
  it("retries a failed input attachment against the same endpoint", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL, opts?: RequestInit) => {
        const u = String(url);
        calls.push(u);
        if (
          u.includes("/attachments") &&
          calls.filter((c) => c.includes("/attachments")).length === 1
        ) {
          return Promise.reject(new Error("upload failed"));
        }
        if (u.includes("/attachments")) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ ok: true }),
          });
        }
        return Promise.reject(new Error("unexpected: " + u));
      }),
    );
    setActivePinia(createPinia());
    const repo = useRepoStore();
    const attachment: PendingScreenshot = { ...sample };
    const job = { batchId: "batch-a", inputId: "0042", attachment };
    repo.inputAttachmentUploads.push(job);
    await repo.retryInputAttachmentUpload(job);
    await nextTick();
    expect(attachment.uploadPhase).toBe("failed");
    expect(repo.inputAttachmentUploads).toHaveLength(1);

    await repo.retryInputAttachmentUpload(job);
    await nextTick();
    expect(repo.inputAttachmentUploads).toHaveLength(0);
    expect(calls.filter((c) => c.includes("/attachments"))).toHaveLength(2);
  });

  it("scopes input upload jobs to their submit batch", () => {
    setActivePinia(createPinia());
    const repo = useRepoStore();
    const a: PendingScreenshot = { ...sample, name: "a.png" };
    const b: PendingScreenshot = { ...sample, name: "b.png" };
    repo.inputAttachmentUploads.push(
      { batchId: "one", inputId: "1", attachment: a },
      { batchId: "two", inputId: "2", attachment: b },
    );
    expect(repo.inputAttachmentUploadsForBatch("one")).toHaveLength(1);
    expect(repo.inputAttachmentUploadsForBatch("one")[0]?.attachment.name).toBe("a.png");
  });

  it("uploadTaskScreenshot records failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "boom" }),
        }),
      ),
    );
    setActivePinia(createPinia());
    const repo = useRepoStore();
    const shot: PendingScreenshot = { ...sample };
    const ok = await repo.uploadTaskScreenshot("0099", shot);
    expect(ok).toBe(false);
    expect(shot.uploadPhase).toBe("failed");
  });
});

describe("ui pending screenshot retention", () => {
  it("clearResolvedScreenshots keeps failed picks for retry", () => {
    setActivePinia(createPinia());
    const ui = useUiStore();
    const ok: PendingScreenshot = { ...sample, name: "ok.png" };
    const bad: PendingScreenshot = {
      ...sample,
      name: "bad.png",
      uploadPhase: "failed",
      uploadError: "nope",
      uploadTaskId: "0001",
    };
    ui.pendingScreenshots.push(ok, bad);
    ui.clearResolvedScreenshots();
    expect(ui.pendingScreenshots).toHaveLength(1);
    expect(ui.pendingScreenshots[0]?.name).toBe("bad.png");
    expect(ui.hasFailedPendingScreenshots()).toBe(true);
  });
});
