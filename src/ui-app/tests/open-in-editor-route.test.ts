/**
 * `/api/dev/open-in-editor` (#0636 review): the route is directly reachable, so
 * it must refuse anything that is not a task markdown under the configured work
 * dir — traversal, a symlink out of the repo, or a non-task repo file. A valid
 * task path gets past validation and reaches the launch step.
 *
 * The route spawns `child_process.spawn`, which Vite externalizes and so cannot
 * be `vi.mock`ed. The success path therefore uses a deliberately missing binary
 * and asserts the failure is the launch step (500), not path rejection (400) —
 * no real editor is opened.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { postOpenInEditor, postOpenTestInEditor } from "../../server/routes/copy-inspector.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { RepoOSConfig } from "../../core/types.js";

const roots: string[] = [];

/** A repo with the dev-UI gate satisfied, a work dir, and a src file. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-open-editor-"));
  roots.push(root);
  mkdirSync(join(root, "src", "ui-app"), { recursive: true });
  writeFileSync(join(root, "src", "ui-app", "vite.config.ts"), "export {}", "utf8");
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(
    join(root, "dist", ".build-info.json"),
    JSON.stringify({ hash: "a", version: "0", devUi: true }) + "\n",
    "utf8",
  );
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "work", "0636-task.md"), "# Task", "utf8");
  writeFileSync(join(root, "work", "notes.txt"), "not a task", "utf8");
  writeFileSync(join(root, "src", "ui-app", "Foo.vue"), "<template />", "utf8");
  return root;
}

function configFor(root: string, over: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root,
    workDir: "work",
    taskExtensions: [".md"],
    // A missing binary: a valid path reaches spawn and fails there (500),
    // while an invalid path is rejected before spawn (400). No editor opens.
    dev: { inspector: { enabled: true, editorCommand: "__repoos_missing_editor__ {file}" } },
    ...over,
  } as RepoOSConfig;
}

async function invoke(
  body: unknown,
  config: RepoOSConfig,
  handler: typeof postOpenInEditor = postOpenInEditor,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // `readBody` iterates the request; a one-chunk async iterator is enough.
  const req = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  };
  let status = 0;
  let payload = "{}";
  const res = {
    writeHead(s: number) {
      status = s;
    },
    end(p: string) {
      payload = p;
    },
  };
  await handler(
    { config } as unknown as RouteContext,
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    {},
  );
  return { status, body: JSON.parse(payload) as Record<string, unknown> };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("POST /api/dev/open-in-editor", () => {
  it("accepts a task markdown under the work dir and reaches the launch step", async () => {
    const root = fixture();
    const result = await invoke({ file: "work/0636-task.md" }, configFor(root));

    // Not 400: the path passed validation and the (missing) editor was launched.
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "failed to launch editor" });
  });

  it("rejects a source file even though it exists and is repo-relative", async () => {
    const root = fixture();
    const result = await invoke({ file: "src/ui-app/Foo.vue" }, configFor(root));

    expect(result.status).toBe(400);
  });

  it("rejects a non-task file in the work dir", async () => {
    const root = fixture();
    const result = await invoke({ file: "work/notes.txt" }, configFor(root));

    expect(result.status).toBe(400);
  });

  it("rejects a traversal path", async () => {
    const root = fixture();
    const result = await invoke({ file: "../etc/passwd" }, configFor(root));

    expect(result.status).toBe(400);
  });

  it("rejects a symlink out of the repo", async () => {
    const root = fixture();
    const outside = mkdtempSync(join(tmpdir(), "repoos-open-editor-outside-"));
    roots.push(outside);
    writeFileSync(join(outside, "secret.md"), "top secret", "utf8");
    symlinkSync(join(outside, "secret.md"), join(root, "work", "link.md"));

    const result = await invoke({ file: "work/link.md" }, configFor(root));

    expect(result.status).toBe(400);
  });

  it("rejects when no editor command is configured", async () => {
    const root = fixture();
    const config = configFor(root, { dev: { inspector: { enabled: true, editorCommand: "" } } });
    const result = await invoke({ file: "work/0636-task.md" }, config);

    expect(result.status).toBe(400);
  });
});

describe("POST /api/dev/open-test-in-editor", () => {
  it("resolves a vitest-relative test name under src/ui-app and reaches the launch step", async () => {
    const root = fixture();
    mkdirSync(join(root, "src", "ui-app", "tests"), { recursive: true });
    writeFileSync(join(root, "src", "ui-app", "tests", "foo.test.ts"), "", "utf8");
    const result = await invoke(
      { test: "tests/foo.test.ts > suite > does a thing" },
      configFor(root),
      postOpenTestInEditor,
    );
    expect(result.status).toBe(500); // missing editor binary: got past resolution
  });

  it("refuses non-test files and unknown tests", async () => {
    const root = fixture();
    const notTest = await invoke(
      { test: "src/ui-app/Foo.vue > x" },
      configFor(root),
      postOpenTestInEditor,
    );
    expect(notTest.status).toBe(400);
    const missing = await invoke(
      { test: "tests/nope.test.ts > x" },
      configFor(root),
      postOpenTestInEditor,
    );
    expect(missing.status).toBe(404);
  });
});
