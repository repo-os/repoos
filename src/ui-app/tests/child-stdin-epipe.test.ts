/**
 * #0646 — a child that closes its stdin early must not crash the server.
 *
 * `writeChildStdin` is the one path every stdin write goes through, so an
 * `ssh`/app-server that exits before reading resolves the caller as a failed
 * result instead of emitting an uncaught `EPIPE`. The process-level fatal
 * handler treats a stray `EPIPE`/`write` the same way: log it, keep serving.
 */
import { describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { writeChildStdin } from "../../core/child-stdin";
import { describeFatalError, isBenignEpipe } from "../../server/server";

describe("isBenignEpipe", () => {
  it("treats an EPIPE on a write as benign", () => {
    expect(isBenignEpipe({ code: "EPIPE", syscall: "write" })).toBe(true);
  });

  it("does not swallow any other error", () => {
    expect(isBenignEpipe(new Error("boom"))).toBe(false);
    expect(isBenignEpipe({ code: "EPIPE", syscall: "read" })).toBe(false);
    expect(isBenignEpipe({ code: "ECONNRESET", syscall: "write" })).toBe(false);
    expect(isBenignEpipe("EPIPE")).toBe(false);
    expect(isBenignEpipe(undefined)).toBe(false);
    expect(isBenignEpipe(null)).toBe(false);
  });
});

describe("describeFatalError", () => {
  it("captures the fields of a non-Error throw", () => {
    const thrown = { name: "EPIPE", code: "EPIPE", syscall: "write" };
    const record = describeFatalError(thrown, "uncaughtException");
    expect(record.origin).toBe("uncaughtException");
    expect(record.name).toBe("EPIPE");
    expect(record.code).toBe("EPIPE");
    expect(record.syscall).toBe("write");
    expect(record.string).toBe(String(thrown));
    // A non-Error has no stack, so a fresh one is captured in its place.
    expect(record.stack).toBeTruthy();
  });

  it("uses an Error's own name, message and stack", () => {
    const err = new TypeError("bad thing");
    const record = describeFatalError(err, "uncaughtException");
    expect(record.name).toBe("TypeError");
    expect(record.error).toBe("bad thing");
    expect(record.stack).toBe(err.stack);
  });
});

describe("writeChildStdin", () => {
  it("routes a stdin error to onError and logs the command instead of throwing", () => {
    const stdin = new EventEmitter() as unknown as NodeJS.WritableStream;
    (stdin as unknown as { write: () => boolean }).write = () => true;
    (stdin as unknown as { end: () => void }).end = () => undefined;
    const child = { stdin } as unknown as Pick<ChildProcess, "stdin">;
    const seen: NodeJS.ErrnoException[] = [];
    const log = vi.fn();
    writeChildStdin(child, "payload", {
      command: "ssh",
      end: true,
      onError: (e) => seen.push(e),
      log,
    });
    const err = Object.assign(new Error("write EPIPE"), { code: "EPIPE", syscall: "write" });
    (stdin as unknown as EventEmitter).emit("error", err);
    expect(seen).toHaveLength(1);
    expect(seen[0].code).toBe("EPIPE");
    expect(log).toHaveBeenCalledWith("child stdin write to ssh failed", err);
  });

  it("is a no-op when stdin is already gone", () => {
    const child = { stdin: null } as unknown as Pick<ChildProcess, "stdin">;
    expect(() => writeChildStdin(child, "payload", { command: "ssh" })).not.toThrow();
  });

  it("absorbs EPIPE when a real child exits before draining a large write", async () => {
    let uncaught: unknown;
    const onUncaught = (e: unknown): void => {
      uncaught = e;
    };
    process.on("uncaughtException", onUncaught);
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const errors: NodeJS.ErrnoException[] = [];
    try {
      // 32 MiB is far beyond the OS pipe buffer, so writing after the child
      // exits reliably EPIPEs.
      writeChildStdin(child, Buffer.alloc(32 * 1024 * 1024, 0x61), {
        command: "test-child",
        end: true,
        onError: (e) => errors.push(e),
        log: () => undefined,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      process.off("uncaughtException", onUncaught);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    expect(uncaught).toBeUndefined();
    // If the pipe did error, it must have been the guarded stdin stream — not
    // some other uncaught failure.
    for (const e of errors) expect(e.syscall).toBe("write");
  });
});
