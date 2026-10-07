/**
 * #0728 — `repoos watch` reconnect and auth behavior.
 */
import { describe, expect, it } from "vitest";
import { runBoardWatchLoop } from "../../commands/watch.js";
import { RepoOsApi, RepoOsApiError } from "../../cli/repoos-api.js";

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= frames.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(frames[i++]));
    },
  });
}

describe("runBoardWatchLoop", () => {
  it("reconnects after the SSE stream ends (server reload)", async () => {
    let calls = 0;
    const api = {
      base: "http://127.0.0.1:9",
      async fetchEventStream() {
        calls++;
        const frame =
          'event: hello\ndata: {"type":"hello","taskCount":0,"at":"2026-10-07T10:00:00.000Z"}\n\n';
        return new Response(sseBody([frame]), { status: 200 });
      },
      async reauthenticate() {
        return true;
      },
    } as unknown as RepoOsApi;

    await runBoardWatchLoop(
      api,
      { json: false, shouldContinue: () => calls < 2, reconnectMs: 0 },
      () => {},
    );

    expect(calls).toBe(2);
  });

  it("re-authenticates on HTTP 401 then continues", async () => {
    let calls = 0;
    let relog = 0;
    const api = {
      base: "http://127.0.0.1:9",
      async fetchEventStream() {
        calls++;
        if (calls === 1) return new Response("", { status: 401 });
        const frame =
          'event: attention.updated\ndata: {"type":"attention.updated","at":"2026-10-07T10:00:00.000Z"}\n\n';
        return new Response(sseBody([frame]), { status: 200 });
      },
      async reauthenticate() {
        relog++;
        return true;
      },
    } as unknown as RepoOsApi;

    const seen: string[] = [];
    let done = false;
    await runBoardWatchLoop(
      api,
      {
        json: false,
        shouldContinue: () => {
          if (seen.length) done = true;
          return !done;
        },
      },
      (ev) => seen.push(ev.type),
    );

    expect(relog).toBe(1);
    expect(seen).toContain("attention.updated");
  });

  it("exits non-zero when the server is unreachable", async () => {
    const api = {
      base: "http://127.0.0.1:9",
      async fetchEventStream() {
        throw new RepoOsApiError("down", 0);
      },
      async reauthenticate() {
        return false;
      },
    } as unknown as RepoOsApi;

    await expect(
      runBoardWatchLoop(api, { json: false, shouldContinue: () => true }, () => {}),
    ).rejects.toMatchObject({ status: 0 });
  });
});
