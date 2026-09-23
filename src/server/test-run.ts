/**
 * Runs the full `bun run test` suite as an ephemeral background process and
 * streams its output live over SSE (Checks page's Test Suite tab). Deliberately
 * minimal compared to AgentRunner: no durable
 * registry, no reload-adoption, no per-task log files — this is a one-off
 * admin action, not a resumable session, so it doesn't need to survive a
 * server restart. A run in progress when the server restarts is simply
 * gone; the human just clicks the button again.
 */
import { spawn, type ChildProcess } from "node:child_process";
import type { RepoOSConfig } from "../core/types.js";

/** Cap on retained output so a very long/noisy run can't grow this without
 *  bound in memory — old text is dropped from the front, oldest first. */
const MAX_BUFFERED_CHARS = 2_000_000;

export interface TestRunState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  /** Process exit code, or null while running / if the process never exited cleanly. */
  code: number | null;
  /** Full output so far (stdout+stderr interleaved in arrival order), capped. */
  output: string;
}

export class TestRunManager {
  private state: TestRunState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    code: null,
    output: "",
  };
  private proc: ChildProcess | null = null;

  getState(): TestRunState {
    return this.state;
  }

  /** Reserve the single-run slot and reset output (local or remote). */
  begin(): { ok: true } | { ok: false; reason: string } {
    if (this.state.running) {
      return { ok: false, reason: "a test run is already in progress" };
    }
    this.state = {
      running: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      code: null,
      output: "",
    };
    return { ok: true };
  }

  appendOutput(text: string): void {
    this.state.output += text;
    if (this.state.output.length > MAX_BUFFERED_CHARS) {
      this.state.output = this.state.output.slice(this.state.output.length - MAX_BUFFERED_CHARS);
    }
  }

  finish(code: number | null): void {
    this.state.running = false;
    this.state.finishedAt = new Date().toISOString();
    this.state.code = code;
    this.proc = null;
  }

  /**
   * Starts `bun run test` in `config.root`. Rejects if a run is already in
   * progress — one at a time, so output/timing never interleaves between
   * two runs. `onChunk` fires for every stdout/stderr chunk as it arrives;
   * `onDone` fires once, with the exit code (null if the process itself
   * failed to spawn or was killed by a signal).
   */
  start(
    config: RepoOSConfig,
    onChunk: (chunk: string) => void,
    onDone: (code: number | null) => void,
  ): { ok: true } | { ok: false; reason: string } {
    const begun = this.begin();
    if (!begun.ok) return begun;

    const proc = spawn("bun", ["run", "test"], {
      cwd: config.root,
      // NO_COLOR/CI suppress vitest's ANSI color codes and interactive
      // cursor movement, which the plain <pre> log has no use for and which
      // would otherwise show up as literal escape-sequence garbage.
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });
    this.proc = proc;

    const handleChunk = (buf: Buffer): void => {
      const text = buf.toString("utf8");
      this.appendOutput(text);
      onChunk(text);
    };
    proc.stdout?.on("data", handleChunk);
    proc.stderr?.on("data", handleChunk);

    proc.on("close", (code) => {
      this.finish(code);
      onDone(code);
    });
    proc.on("error", (err) => {
      const text = `\n[could not start test run: ${err.message}]\n`;
      this.appendOutput(text);
      onChunk(text);
      this.finish(null);
      onDone(null);
    });

    return { ok: true };
  }
}
