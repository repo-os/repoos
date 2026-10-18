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
    expect(attachmentUploadPhase(sample)).toBe("selected");
    markAttachmentUploading(sample);
    expect(attachmentUploadPhase(sample)).toBe("uploading");
    markAttachmentUploadFailed(sample, new Error("network"));
    expect(attachmentUploadPhase(sample)).toBe("failed");
    expect(sample.uploadError).toBe("network");
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
    const job = { inputId: "0042", attachment };
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
});
