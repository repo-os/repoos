/**
 * Client-side attachment upload lifecycle (#0664).
 *
 * Pending picks stay "selected" until a server upload succeeds; only then are
 * they treated as available on the task/input. Failed uploads keep the same
 * bytes so retry reuses the original pick.
 */
import type { PendingScreenshot } from "../stores/ui";

/** Upload lifecycle for a not-yet-server-confirmed attachment. */
export type AttachmentUploadPhase = "selected" | "uploading" | "failed";

export function attachmentUploadPhase(s: PendingScreenshot): AttachmentUploadPhase {
  return s.uploadPhase ?? "selected";
}

export function isAttachmentUploadInFlight(s: PendingScreenshot): boolean {
  return attachmentUploadPhase(s) === "uploading";
}

export function isAttachmentUploadFailed(s: PendingScreenshot): boolean {
  return attachmentUploadPhase(s) === "failed";
}

export function markAttachmentUploading(s: PendingScreenshot): void {
  s.uploadPhase = "uploading";
  s.uploadError = undefined;
}

export function markAttachmentUploadFailed(s: PendingScreenshot, err: unknown): void {
  s.uploadPhase = "failed";
  s.uploadError = err instanceof Error ? err.message : String(err);
}

export function clearAttachmentUploadState(s: PendingScreenshot): void {
  s.uploadPhase = undefined;
  s.uploadError = undefined;
}

export function pendingAttachmentRowClass(s: PendingScreenshot): string {
  const phase = attachmentUploadPhase(s);
  if (phase === "uploading") return "ff-pending-file--uploading";
  if (phase === "failed") return "ff-pending-file--failed";
  return "";
}
