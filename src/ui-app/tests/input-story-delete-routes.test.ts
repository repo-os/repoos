/**
 * Input + story deletion (#0634): the DELETE routes behind the new
 * "Delete input" / "Delete story" panel buttons. Inputs lose their markdown
 * file and their gitignored attachments; stories lose only their `stories/`
 * definition file — tasks tagged with the story name are never touched — and
 * both 404 for ids/keys that no longer exist.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepoOS } from "../../core/repoos";
import { createInput, listInputs, saveInputAttachment } from "../../core/input";
import { listStoryDefinitions, writeStoryDefinition } from "../../core/story-definition-files";
import { deleteInput } from "../../server/routes/inputs";
import { deleteStory } from "../../server/routes/stories";
import { createLogger } from "../../core/logger";
import type { RepoEvent } from "../../server/live-index";

function makeCtx(root: string, events: RepoEvent[]) {
  return {
    // Stories are opt-in via config; the delete route gates on it.
    config: { ...createRepoOS(root).config, stories: { enabled: true } },
    logger: createLogger(root),
    emitEvent: (e: RepoEvent) => events.push(e),
  } as never as Parameters<typeof deleteInput>[0];
}

function makeRes() {
  const capture = { status: 0, body: undefined as unknown };
  return {
    capture,
    res: {
      writeHead: (status: number) => {
        capture.status = status;
      },
      end: (chunk?: string) => {
        capture.body = JSON.parse(chunk ?? "null");
      },
    } as never as Parameters<typeof deleteInput>[2],
  };
}

function setup(): { root: string; events: RepoEvent[]; ctx: ReturnType<typeof makeCtx> } {
  const root = mkdtempSync(join(tmpdir(), "repoos-delete-0634-"));
  const events: RepoEvent[] = [];
  return { root, events, ctx: makeCtx(root, events) };
}

describe("DELETE /api/inputs/:id", () => {
  it("removes the input file and its attachments", () => {
    const { root, ctx, events } = setup();
    try {
      const input = createInput(ctx.config, "Add a delete button", "idea", "human");
      saveInputAttachment(ctx.config, input.id, "shot.png", "aGk=");
      const abs = join(root, input.path);
      expect(existsSync(abs)).toBe(true);

      const { capture, res } = makeRes();
      void deleteInput(ctx, {} as never, res, { param1: input.id } as never);

      expect(capture.status).toBe(200);
      expect(capture.body).toEqual({ ok: true });
      expect(existsSync(abs)).toBe(false);
      expect(existsSync(join(root, "inputs", ".attachments", input.id))).toBe(false);
      expect(listInputs(ctx.config).find((i) => i.id === input.id)).toBeUndefined();
      // Inputs are not in the live index: no SSE event, clients refresh.
      expect(events).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("404s for an unknown id and for an already-deleted input", () => {
    const { root, ctx } = setup();
    try {
      const { capture, res } = makeRes();
      void deleteInput(ctx, {} as never, res, { param1: "nope" } as never);
      expect(capture.status).toBe(404);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("DELETE /api/stories/:key", () => {
  it("removes the definition file, emits definitionsChanged, leaves tasks alone", () => {
    const { root, ctx, events } = setup();
    try {
      const def = writeStoryDefinition(ctx.config, {
        name: "Delete target",
        body: "The slice to remove.",
      });
      const abs = join(root, def.path);
      expect(existsSync(abs)).toBe(true);

      const { capture, res } = makeRes();
      void deleteStory(ctx, {} as never, res, { param1: def.key } as never);

      expect(capture.status).toBe(200);
      expect(capture.body).toEqual({ ok: true });
      expect(existsSync(abs)).toBe(false);
      expect(listStoryDefinitions(ctx.config)).toHaveLength(0);
      expect(events.map((e) => e.type)).toEqual(["story.definitionsChanged"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("404s for a tag-only story (no definition file) and unknown keys", () => {
    const { root, ctx } = setup();
    try {
      const { capture, res } = makeRes();
      void deleteStory(ctx, {} as never, res, { param1: "tag-only-story" } as never);
      expect(capture.status).toBe(404);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("404s when stories are disabled", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-delete-0634-off-"));
    try {
      mkdirSync(join(root, "stories"), { recursive: true });
      writeFileSync(join(root, "stories", "x.md"), "---\nname: X\n---\nBody\n");
      const events: RepoEvent[] = [];
      const ctx = {
        config: {
          ...createRepoOS(root).config,
          stories: { enabled: false },
        },
        logger: createLogger(root),
        emitEvent: (e: RepoEvent) => events.push(e),
      } as never as Parameters<typeof deleteStory>[0];
      const { capture, res } = makeRes();
      void deleteStory(ctx, {} as never, res, { param1: "x" } as never);
      expect(capture.status).toBe(404);
      expect(events).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
