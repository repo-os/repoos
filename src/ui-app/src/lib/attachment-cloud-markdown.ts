/**
 * Mark task attachment images whose cloud upload is still pending (#0666).
 */
import type { AttachmentCloudDelivery } from "../../../core/attachment-resilience.js";

const TASK_ATTACHMENT_IMG_RE =
  /<img src="(\/api\/tasks\/([^/]+)\/attachments\/([^"?]+))" alt="([^"]*)"([^>]*)>/g;

/**
 * Wrap pending cloud uploads in the spec markdown HTML with a visible
 * "upload pending" label — never "available" until the server says so.
 */
export function annotateAttachmentCloudUploads(
  html: string,
  taskId: string,
  states: Record<string, AttachmentCloudDelivery> | null | undefined,
): string {
  if (!states || !Object.keys(states).length) return html;
  return html.replace(TASK_ATTACHMENT_IMG_RE, (full, src, tid, encName, alt, tail) => {
    if (tid !== taskId) return full;
    let objectName: string;
    try {
      objectName = decodeURIComponent(encName);
    } catch {
      return full;
    }
    if (states[objectName] !== "pending") return full;
    return (
      `<figure class="attachment-cloud-figure">` +
      `<img src="${src}" alt="${alt}"${tail}>` +
      `<figcaption class="attachment-cloud-badge">upload pending</figcaption>` +
      `</figure>`
    );
  });
}
