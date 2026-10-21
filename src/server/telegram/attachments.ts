/**
 * Content-first attachment validation for Telegram (#0543).
 *
 * Telegram tells us a file's `mime_type` and a filename, but both are supplied
 * by the sender's client and are not evidence of the bytes. Storage must never
 * trust them: a `.png` can be an executable, and a `image/png` declaration can
 * be a ZIP. This module sniffs the magic bytes and returns the type storage
 * should record; anything unrecognized is refused before a byte is written.
 *
 * Only images and documents this project can honestly serve are allowed.
 * Images cover Telegram's photo/compressed variants and screenshot uploads;
 * PDF and plain UTF-8 text are the useful non-image documents. Archives and
 * executables are deliberately excluded — there is no use for them on a task
 * and they are the riskiest thing to write under `work/`.
 */
import { MAX_SCREENSHOT_BYTES } from "../attachments.js";

export type TelegramAttachmentKind = "image" | "file";

export interface ClassifiedAttachment {
  ok: true;
  kind: TelegramAttachmentKind;
  /** MIME type derived from the bytes, never the sender's declaration. */
  mime: string;
  /** Extension storage should use, including the leading dot. */
  extension: string;
}

export type AttachmentRejection = { ok: false; error: string };

function startsWith(buf: Buffer, bytes: readonly number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(buf: Buffer, offset: number, length: number): string {
  return buf.subarray(offset, offset + length).toString("latin1");
}

function looksLikeUtf8Text(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  if (buf.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Classify by bytes. Size is checked here (before any storage) and the result
 * is a MIME/extension pair derived from content.
 */
export function classifyTelegramAttachment(
  input: Buffer,
  options: { maxBytes?: number } = {},
): ClassifiedAttachment | AttachmentRejection {
  const buf = input;
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return { ok: false, error: "Attachment is empty" };
  }
  const maxBytes = options.maxBytes ?? MAX_SCREENSHOT_BYTES;
  if (buf.length > maxBytes) {
    return {
      ok: false,
      error: `Attachment is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`,
    };
  }

  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, kind: "image", mime: "image/png", extension: ".png" };
  }
  if (startsWith(buf, [0xff, 0xd8, 0xff])) {
    return { ok: true, kind: "image", mime: "image/jpeg", extension: ".jpg" };
  }
  if (ascii(buf, 0, 6) === "GIF87a" || ascii(buf, 0, 6) === "GIF89a") {
    return { ok: true, kind: "image", mime: "image/gif", extension: ".gif" };
  }
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WEBP") {
    return { ok: true, kind: "image", mime: "image/webp", extension: ".webp" };
  }
  if (startsWith(buf, [0x42, 0x4d])) {
    return { ok: true, kind: "image", mime: "image/bmp", extension: ".bmp" };
  }
  if (ascii(buf, 4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(buf, 8, 4))) {
    return { ok: true, kind: "image", mime: "image/avif", extension: ".avif" };
  }
  if (ascii(buf, 0, 5) === "%PDF-") {
    return { ok: true, kind: "file", mime: "application/pdf", extension: ".pdf" };
  }
  if (looksLikeUtf8Text(buf)) {
    return { ok: true, kind: "file", mime: "text/plain", extension: ".txt" };
  }

  return {
    ok: false,
    error: "Unsupported attachment type — send an image, a PDF, or a plain-text file",
  };
}

/**
 * A storage-safe base name. The extension is replaced with the sniffed one,
 * so a sender cannot smuggle `evil.exe` through as a `.png` name.
 */
export function attachmentBaseName(
  declaredName: string | null | undefined,
  extension: string,
): string {
  const base = (declaredName ?? "attachment")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.[^./]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "attachment"}${extension}`;
}
