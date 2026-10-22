/**
 * Task creation from Telegram (#0543).
 *
 * The bot is not a second task format. It calls the same `repoos.createTask`
 * the New-task drawer does, with the same fields, the same `originalPrompt`
 * handling (`## Original prompt`), the same index notification, the same
 * attachment storage and the same commit message — so a Telegram task is
 * structurally indistinguishable from a UI-created one.
 *
 * Attachments are validated by content (magic bytes) before the task exists,
 * so a rejected upload never leaves a half-created task behind. Images are
 * written through the shared screenshot helper (which also builds the
 * `## Screenshots` section); other allowed documents land in the same
 * `work/.attachments/<taskId>/` namespace and are referenced from a body
 * section. Nothing under `work/` is ever tracked.
 */
import type { Logger } from "../../core/logger.js";
import type { RepoOS } from "../../core/repoos.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import {
  generateAttachmentObjectName,
  taskAttachmentApiPath,
  taskAttachmentStore,
} from "../../core/attachment-reference.js";
import { commitTaskFile } from "../../core/git.js";
import { saveScreenshot, type ScreenshotMeta } from "../attachments.js";
import { patchTaskFile } from "../write.js";
import {
  flagTaskSpecFlagsIfNeededAsync,
  isUnderspecifiedSweepEligible,
} from "../task-underspecified-flag.js";
import {
  attachmentBaseName,
  classifyTelegramAttachment,
  type ClassifiedAttachment,
} from "./attachments.js";

export interface TelegramTaskDraft {
  title: string;
  type: string;
  priority: string;
  area: string;
  /** Task body as filed (the free-form prose). */
  body: string;
  /** Raw prose, preserved under `## Original prompt`. */
  originalPrompt: string;
}

export interface IncomingTelegramAttachment {
  /** Sender-declared name — used only for the display label. */
  name: string | null;
  bytes: Buffer;
}

export interface TelegramTaskCreateDeps {
  config: RepoOSConfig;
  repoos: Pick<RepoOS, "createTask">;
  index: {
    getTask(id: string): Task | null;
    applyFileChange(absPath: string, opts?: { guarded?: boolean }): void | Promise<void>;
  };
  logger: Logger;
}

export type TelegramTaskCreateResult =
  | { ok: true; task: Task; imageCount: number; fileCount: number }
  | { ok: false; error: string };

interface ClassifiedIncoming {
  declaredName: string | null;
  classified: ClassifiedAttachment;
  bytes: Buffer;
}

function attachmentsSection(entries: Array<{ name: string; url: string }>): string {
  return ["## Attachments", "", ...entries.map((e) => `- [${e.name}](${e.url})`)].join("\n");
}

function appendSection(body: string, section: string): string {
  const activityIndex = body.lastIndexOf("\n## Activity\n");
  const trimmed = body.replace(/\s+$/, "");
  if (activityIndex === -1) return `${trimmed}\n\n${section}\n`;
  const before = body.slice(0, activityIndex).replace(/\s+$/, "");
  const after = body.slice(activityIndex + 1);
  return `${before}\n\n${section}\n\n${after}`;
}

/**
 * Create a task from a Telegram draft. Returns an error (and creates nothing)
 * when any attachment fails content validation.
 */
export function createTelegramTask(
  deps: TelegramTaskCreateDeps,
  draft: TelegramTaskDraft,
  attachments: readonly IncomingTelegramAttachment[],
  actor: { email: string },
): TelegramTaskCreateResult {
  const classified: ClassifiedIncoming[] = [];
  for (const attachment of attachments) {
    const result = classifyTelegramAttachment(attachment.bytes);
    if (!result.ok) return { ok: false, error: result.error };
    classified.push({
      declaredName: attachment.name,
      classified: result,
      bytes: attachment.bytes,
    });
  }

  let created: Task;
  try {
    created = deps.repoos.createTask({
      title: draft.title,
      type: draft.type,
      priority: draft.priority,
      area: draft.area,
      body: draft.body,
      originalPrompt: draft.originalPrompt,
      createdBy: actor.email,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  deps.logger.task(created.id, "info", "Task created from Telegram", {
    title: created.title,
    type: created.type,
    area: created.area,
    actor: actor.email,
  });
  void deps.index.applyFileChange(created.absPath);

  // Same "stub body" flag the HTTP create route applies, so a short Telegram
  // capture is visible as underspecified rather than silently carried.
  if (isUnderspecifiedSweepEligible(created)) {
    void flagTaskSpecFlagsIfNeededAsync(deps.config, created).then((flagged) => {
      if (flagged) void deps.index.applyFileChange(flagged.absPath, { guarded: true });
    });
  }

  const images: ScreenshotMeta[] = [];
  const files: Array<{ name: string; url: string }> = [];
  try {
    const store = taskAttachmentStore(deps.config);
    for (const entry of classified) {
      const { classified: kind } = entry;
      if (kind.kind === "image") {
        const saved = saveScreenshot(deps.config, created, {
          name: attachmentBaseName(entry.declaredName, kind.extension),
          // The sniffed MIME is the only type storage is told about.
          mime: kind.mime,
          data: entry.bytes.toString("base64"),
        });
        if ("error" in saved) return { ok: false, error: saved.error };
        images.push(saved);
      } else {
        const objectName = generateAttachmentObjectName(kind.extension);
        const put = store.put(created.id, objectName, entry.bytes);
        if ("error" in put) return { ok: false, error: put.error };
        files.push({
          name: attachmentBaseName(entry.declaredName, kind.extension),
          url: taskAttachmentApiPath(created.id, objectName),
        });
      }
    }

    // Screenshots and Activity are system-managed sections (#0613): a body
    // replacement cannot set them, so images go through `addScreenshots` and
    // only the non-image `## Attachments` section rides the body patch.
    let updated = created;
    if (files.length > 0) {
      updated = patchTaskFile(deps.config, created.absPath, {
        body: appendSection(created.body, attachmentsSection(files)),
      });
    }
    if (images.length > 0) {
      updated = patchTaskFile(deps.config, updated.absPath, { addScreenshots: images });
    }
    if (updated !== created) {
      void deps.index.applyFileChange(updated.absPath, { guarded: true });
      created = deps.index.getTask(created.id) ?? updated;
    }
  } catch (error) {
    // The task exists. Commit what we have so it cannot become an orphaned
    // untracked file, then report the attachment failure honestly.
    commitTaskFile(deps.config.root, created.absPath, `docs(${created.id}): add task`);
    return {
      ok: false,
      error: `Task #${created.id} was created, but an attachment could not be stored: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  commitTaskFile(deps.config.root, created.absPath, `docs(${created.id}): add task`);
  return {
    ok: true,
    task: deps.index.getTask(created.id) ?? created,
    imageCount: images.length,
    fileCount: files.length,
  };
}
