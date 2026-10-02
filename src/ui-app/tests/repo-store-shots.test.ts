/**
 * Repo store — shot management calls (#0627): addShot POSTs the declared
 * entry (no raw JSON from the caller) and refreshes the shot list; deleteShot
 * DELETEs by encoded name and refreshes. A structured busy failure is
 * returned, not thrown, so the modal keeps open with the reason.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

const SHOT = {
  name: "default-1.png",
  target: "default",
  route: "/",
  label: "Task drawer open",
  provenance: "declared: Task drawer open",
  path: "work/.attachments/0001/shots/default-1.png",
  url: "/api/tasks/0001/shots/default-1.png",
  size: 3,
  mime: "image/png",
  capturedAt: "2026-10-02T00:00:00Z",
};

function json(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("repo store addShot/deleteShot (#0627)", () => {
  it("addShot POSTs the entry and refreshes the list", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/tasks/0001/shots") && (init?.method ?? "GET") === "POST")
        return json({ ok: true, shot: SHOT });
      return json({ ok: true, shots: [SHOT] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();

    const result = await repo.addShot("0001", { target: "default", label: "Task drawer open" });
    expect(result).toEqual({ ok: true });
    const post = fetchMock.mock.calls.find(
      (c) =>
        String(c[0]).endsWith("/api/tasks/0001/shots") && (c[1] as RequestInit).method === "POST",
    );
    expect(post).toBeTruthy();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      target: "default",
      label: "Task drawer open",
    });
    expect(repo.shotsFor("0001")).toHaveLength(1);
  });

  it("addShot returns the busy flag for a 409 without throwing", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: false,
          status: 409,
          statusText: "Conflict",
          json: async () => ({ error: "the one preview slot is busy", busy: true }),
        }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();
    const result = await repo.addShot("0001", { target: "default" });
    expect(result).toEqual({
      ok: false,
      error: "the one preview slot is busy",
      busy: true,
    });
  });

  it("deleteShot DELETEs the encoded name and refreshes", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "DELETE")
        return json({ ok: true, removed: "default-1.png", declarationsRemoved: 1 });
      return json({ ok: true, shots: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();

    const result = await repo.deleteShot("0001", "default-1.png");
    expect(result).toEqual({ ok: true });
    const del = fetchMock.mock.calls.find((c) => (c[1] as RequestInit).method === "DELETE");
    expect(String(del![0])).toBe("/api/tasks/0001/shots/default-1.png");
    expect(repo.shotsFor("0001")).toEqual([]);
  });
});
