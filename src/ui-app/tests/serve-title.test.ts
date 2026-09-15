import { describe, expect, it, afterEach } from "vitest";
import { isBun } from "../../core/runtime.js";
import { serveProcessTitle, setServeProcessTitle } from "../../commands/serve.js";

type ExecveFn = (file: string, args: readonly string[], env: NodeJS.ProcessEnv) => never;
const TITLE_GUARD = "REPOOS_PROCESS_TITLE";

const origTitle = process.title;
const origGuard = process.env[TITLE_GUARD];
afterEach(() => {
  process.title = origTitle;
  if (origGuard === undefined) delete process.env[TITLE_GUARD];
  else process.env[TITLE_GUARD] = origGuard;
});

describe("serveProcessTitle", () => {
  it("names the project after the managed root's directory", () => {
    expect(serveProcessTitle("/Users/nick/code/squishy")).toBe("repoos-squishy");
    expect(serveProcessTitle("/Users/nick/code/repoos")).toBe("repoos-repoos");
  });

  it("falls back to `repoos` when the root has no directory name", () => {
    expect(serveProcessTitle("/")).toBe("repoos-repoos");
  });
});

describe("setServeProcessTitle", () => {
  it("sets process.title", () => {
    // Always inject a stub: the real default would replace the test worker.
    setServeProcessTitle("repoos-squishy", () => undefined as never);
    expect(process.title).toBe("repoos-squishy");
  });

  it("clears the one-shot marker without re-execing when already relabeled", () => {
    process.env[TITLE_GUARD] = "1";
    let called = false;
    const execve: ExecveFn = () => {
      called = true;
      return undefined as never;
    };
    setServeProcessTitle("repoos-squishy", execve);
    expect(called).toBe(false);
    expect(process.env[TITLE_GUARD]).toBeUndefined();
    expect(process.title).toBe("repoos-squishy");
  });

  it("re-execs with argv[0] = title under Bun, and never under Node", () => {
    delete process.env[TITLE_GUARD];
    let captured: { file: string; args: readonly string[]; env: NodeJS.ProcessEnv } | null = null;
    const execve: ExecveFn = (file, args, env) => {
      captured = { file, args, env };
      return undefined as never;
    };
    setServeProcessTitle("repoos-squishy", execve);
    if (isBun()) {
      expect(captured).not.toBeNull();
      const { file, args, env } = captured as unknown as {
        file: string;
        args: readonly string[];
        env: NodeJS.ProcessEnv;
      };
      expect(file).toBe(process.execPath);
      expect(args[0]).toBe("repoos-squishy");
      expect(args[1]).toBe(process.argv[1]);
      expect(args.slice(2)).toEqual(process.argv.slice(2));
      expect(env[TITLE_GUARD]).toBe("1");
    } else {
      // Node's process.title reaches the OS directly — no re-exec needed.
      expect(captured).toBeNull();
    }
    expect(process.title).toBe("repoos-squishy");
  });
});
