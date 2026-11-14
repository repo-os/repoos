import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkWatcher } from "../../server/watcher.js";
import type { LiveIndex } from "../../server/live-index.js";
import type { RepoOSConfig } from "../../core/types.js";
import { waitFor } from "./helpers.js";

const fixtures: Array<{ root: string; watcher: WorkWatcher }> = [];
afterEach(() => {
  for (const { root, watcher } of fixtures.splice(0)) {
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

async function writeUntilObserved(
  write: () => void,
  observed: () => boolean,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!observed()) {
    write();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`timed out waiting for ${label}`);
    try {
      // Each write is followed by an event wait long enough for the watcher's
      // debounce. If native registration is still pending, another write gives
      // it a fresh observable change instead of relying on a setup sleep.
      await waitFor(observed, label, Math.min(250, remaining));
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes(`timed out waiting for ${label}`)) {
        throw error;
      }
      if (Date.now() >= deadline) throw error;
    }
  }
}

describe("Git ref watches", () => {
  it.each(["checkout", "linked worktree"])(
    "observes shared nested refs from a %s",
    async (kind) => {
      const root = mkdtempSync(join(tmpdir(), "repoos-ref-watch-"));
      const checkout = join(root, "checkout");
      const common = join(checkout, ".git");
      const linked = join(root, "linked");
      const privateGit = join(common, "worktrees", "linked");
      const refs = join(common, "refs", "heads", "feature");
      mkdirSync(refs, { recursive: true });
      mkdirSync(privateGit, { recursive: true });
      mkdirSync(linked);
      writeFileSync(join(privateGit, "commondir"), "../..\n");
      writeFileSync(join(linked, ".git"), `gitdir: ${privateGit}\n`);
      const config = {
        root: kind === "checkout" ? checkout : linked,
        workDir: "work",
        cacheDir: ".repoos",
        taskExtensions: [".md"],
      } as RepoOSConfig;
      const watcher = new WorkWatcher(config, {} as LiveIndex);
      fixtures.push({ root, watcher });
      const changed = vi.fn();
      watcher.setGitSignal(changed);
      watcher.start();
      let tip = 0;
      await writeUntilObserved(
        () => writeFileSync(join(refs, "topic"), `new tip ${++tip}\n`),
        () => changed.mock.calls.length > 0,
        "nested ref changed",
      );
      expect(changed).toHaveBeenCalled();

      changed.mockClear();
      mkdirSync(join(refs, "new-namespace"));
      await waitFor(() => changed.mock.calls.length > 0, "new ref directory watched");
      changed.mockClear();
      writeFileSync(join(refs, "new-namespace", "topic"), "another tip\n");
      await waitFor(() => changed.mock.calls.length > 0, "new nested ref changed");
      expect(changed).toHaveBeenCalled();
    },
    60_000,
  );
});
