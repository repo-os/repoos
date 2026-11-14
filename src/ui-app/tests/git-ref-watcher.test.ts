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
      // Give native fs.watch registrations a turn to reach the OS before the
      // one-time write. A single setImmediate can run before subscriptions are
      // active on a busy worker, losing the only event this test emits.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      writeFileSync(join(refs, "topic"), "new tip\n");
      await waitFor(() => changed.mock.calls.length > 0, "nested ref changed");
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
