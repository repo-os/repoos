import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function makeFixture(body = "") {
  const root = mkdtempSync(join(tmpdir(), "repoos-dbg-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(bin, "opencode"),
    `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
${body}
`,
    { mode: 0o755 },
  );
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  const worktrees = join(dirname(root), `${basename(root)}-worktrees`);
  return {
    root,
    bin,
    log: join(root, "spawns.log"),
    worktrees,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(worktrees, { recursive: true, force: true });
    },
  };
}

async function api(server: ServerHandle, method: string, path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

it("debug engineer start", async () => {
  const fx = makeFixture(`process.stdout.write("hello from fake\\n");`);
  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${fx.bin}:${oldPath}`;
  process.env.REPOOS_FAKEBIN_LOG = fx.log;
  const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
  try {
    const created = await api(server, "POST", "/api/tasks", { title: "Debug", status: "active" });
    console.log("create", created.status, created.body.id);
    const id = created.body.id as string;
    const branch = `feat/${id}-review`;
    const worktree = join(fx.worktrees, branch);
    git(fx.root, ["worktree", "add", "-q", "-b", branch, worktree]);
    writeFileSync(join(worktree, "implementation.txt"), "implemented\n");
    const patched = await api(server, "PATCH", `/api/tasks/${id}`, { branch });
    console.log("patch", patched.status);
    const started = await api(server, "POST", `/api/tasks/${id}/start`);
    console.log("start", started.status, JSON.stringify(started.body));
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const out = await api(server, "GET", `/api/tasks/${id}/output`);
      const running = await api(server, "GET", `/api/agents/running`);
      const task = await api(server, "GET", `/api/tasks/${id}`);
      const lines = Array.isArray(out.body.lines) ? out.body.lines : [];
      console.log(
        `t=${i}`,
        "lines", JSON.stringify(lines.slice(-2)),
        "running", JSON.stringify(running.body.tasks ?? running.body),
        "task", JSON.stringify({ status: task.body.status, worktree: task.body.worktree, pendingHandoff: task.body.pendingHandoff, needsInput: task.body.needsInput }),
      );
      if (lines.length > 0) break;
    }
    console.log("spawns", existsSync(fx.log) ? readFileSync(fx.log, "utf8") : "none");
    const logsDir = join(fx.root, ".repoos", "logs");
    if (existsSync(logsDir)) {
      for (const f of readdirSync(logsDir)) {
        console.log("LOG", f, readFileSync(join(logsDir, f), "utf8").slice(-2000));
      }
    }
  } finally {
    process.env.PATH = oldPath;
    delete process.env.REPOOS_FAKEBIN_LOG;
    await server.close();
    fx.clean();
  }
}, 60_000);
