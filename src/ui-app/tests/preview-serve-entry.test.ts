/**
 * #0313 regression — a preview must serve the worktree's OWN compiled server,
 * not the control plane's. When the control plane's dist is stale (the normal
 * state while a feature branch adds new API routes), spawning its entry made
 * every new `/api/*` route 404 into the SPA fallback; the client then tried to
 * parse `index.html` as JSON and reported `Unexpected token '<'` in place of
 * the model list. `ensureFreshBuild` guarantees the worktree's dist matches
 * the worktree's src, so the worktree's entry is always the right thing to run.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveServeEntry } from "../../server/preview";

describe("resolveServeEntry", () => {
  it("prefers the worktree's own compiled entry when it exists", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-entry-own-"));
    const own = join(root, "dist", "cli", "index.js");
    mkdirSync(join(root, "dist", "cli"), { recursive: true });
    writeFileSync(own, "// serve entry\n");
    try {
      expect(resolveServeEntry(root)).toBe(own);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to the control plane's entry when the worktree has no dist", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-entry-fb-"));
    try {
      const entry = resolveServeEntry(root);
      // Either the control-plane entry (built repo — the case under
      // `repoos check`, which builds before tests) or null (src-only
      // checkout); never a path inside the worktree, which has nothing.
      if (entry) expect(entry.startsWith(root)).toBe(false);
      else expect(entry).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
