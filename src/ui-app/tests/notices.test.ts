/**
 * Notices-store tests (#0606): notice creation, dedupe, dismiss/read
 * persistence, bell badge counts, and the "one finished release = exactly one
 * notice" guarantee. The notification channels (sound/push) are covered by the
 * gating contract in notifications.test.ts — here we verify the wiring fires.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNoticesStore, type ReleaseRunState } from "../src/stores/notices";
import { useNotificationsStore } from "../src/stores/notifications";

/** A Notification stub recording pushes, permission granted by default. */
class FakeNotification {
  static permission = "granted";
  static instances: { title: string; body: string }[] = [];
  static requestPermission = async () => FakeNotification.permission;
  title: string;
  body: string;
  constructor(title: string, opts: { body?: string }) {
    this.title = title;
    this.body = opts?.body ?? "";
    FakeNotification.instances.push({ title, body: this.body });
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createOscillator() {
    return { type: "sine", frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  FakeNotification.instances = [];
  vi.stubGlobal("Notification", FakeNotification);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("window", window); // keep JSDOM window (api.ts touches it)
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A finished, successful release run: the server's exact response shape. */
function succeededRun(over: Partial<ReleaseRunState> = {}): ReleaseRunState {
  return {
    state: "succeeded",
    phase: null,
    message:
      "v0.5.59 pushed. CI is now building the release — it becomes downloadable once that finishes.",
    startedAt: "2026-09-30T15:00:00.000Z",
    updatedAt: "2026-09-30T15:03:41.000Z",
    ...over,
  };
}

function failedRun(over: Partial<ReleaseRunState> = {}): ReleaseRunState {
  return {
    state: "failed",
    phase: "checking",
    message: "repoos check failed.\n3 tests failed:\n  - one\n  - two",
    startedAt: "2026-09-30T16:00:00.000Z",
    updatedAt: "2026-09-30T16:02:10.000Z",
    ...over,
  };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("ingestReleaseRun", () => {
  it("creates exactly one notice per finished release, no matter how many times it is polled", () => {
    const s = useNoticesStore();
    const run = succeededRun();
    expect(s.ingestReleaseRun(run)).not.toBeNull();
    // The run state persists on the server until a new run starts, so every
    // poll re-reports it — dedupe by run identity keeps it at exactly one.
    s.ingestReleaseRun(run);
    s.ingestReleaseRun(run);
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]).toMatchObject({
      kind: "releaseSucceeded",
      link: "/releases",
      title: "Release v0.5.59 finished",
      read: false,
      dismissed: false,
    });
  });

  it("ignores idle and running runs", () => {
    const s = useNoticesStore();
    s.ingestReleaseRun({
      state: "idle",
      phase: null,
      message: "",
      startedAt: null,
      updatedAt: null,
    });
    s.ingestReleaseRun({
      state: "running",
      phase: "checking",
      message: "Running repoos check…",
      startedAt: "2026-09-30T15:00:00.000Z",
      updatedAt: "2026-09-30T15:00:05.000Z",
    });
    expect(s.notices).toHaveLength(0);
    expect(s.unreadNotices).toHaveLength(0);
  });

  it("creates a failed notice with the failure headline as detail", () => {
    const s = useNoticesStore();
    s.ingestReleaseRun(failedRun());
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]).toMatchObject({
      kind: "releaseFailed",
      title: "Release cut failed",
      detail: "repoos check failed.",
    });
  });

  it("separate runs produce separate notices (newest first)", () => {
    const s = useNoticesStore();
    s.ingestReleaseRun(succeededRun({ startedAt: "2026-09-30T15:00:00.000Z" }));
    s.ingestReleaseRun(failedRun({ startedAt: "2026-09-30T16:00:00.000Z" }));
    expect(s.notices).toHaveLength(2);
    expect(s.notices[0].kind).toBe("releaseFailed");
    expect(s.notices[1].kind).toBe("releaseSucceeded");
  });
});

describe("bell badge (unreadNotices)", () => {
  it("counts only unread, non-dismissed notices", () => {
    const s = useNoticesStore();
    s.ingestReleaseRun(succeededRun());
    s.ingestReleaseRun(failedRun());
    expect(s.unreadNotices).toHaveLength(2);
    s.markRead(s.notices[0].id);
    expect(s.unreadNotices).toHaveLength(1);
    s.dismiss(s.notices[1].id);
    expect(s.unreadNotices).toHaveLength(0);
  });

  it("markAllRead clears the badge but keeps the rows", () => {
    const s = useNoticesStore();
    s.ingestReleaseRun(succeededRun());
    s.ingestReleaseRun(failedRun());
    s.markAllRead();
    expect(s.unreadNotices).toHaveLength(0);
    expect(s.activeNotices).toHaveLength(2);
  });

  it("dismissAll empties the feed and remembers the dismissals", () => {
    const s = useNoticesStore();
    s.ingestReleaseRun(succeededRun());
    s.ingestReleaseRun(failedRun());
    s.dismissAll();
    expect(s.activeNotices).toHaveLength(0);
    expect(s.dismissedCount).toBe(2);
  });
});

describe("dismiss / read persistence", () => {
  it("a dismissed notice never returns while the event is still current", () => {
    const s = useNoticesStore();
    const run = succeededRun();
    s.ingestReleaseRun(run);
    s.dismiss(s.notices[0].id);
    expect(s.activeNotices).toHaveLength(0);

    // Later polls keep reporting the still-terminal run state — the
    // dismissal must hold it off, not resurrect it.
    s.ingestReleaseRun(run);
    expect(s.activeNotices).toHaveLength(0);
  });

  it("read/dismissed state survives a page reload (fresh pinia + store)", () => {
    const s = useNoticesStore();
    const run = succeededRun();
    s.ingestReleaseRun(run);
    const other = failedRun();
    s.ingestReleaseRun(other);
    s.markRead(s.notices[1].id); // succeeded
    s.dismiss(s.notices[0].id); // failed

    setActivePinia(createPinia());
    const reloaded = useNoticesStore();
    // Simulate the page-load poll hitting the same server state.
    reloaded.ingestReleaseRun(run);
    reloaded.ingestReleaseRun(other);
    expect(reloaded.notices).toHaveLength(1); // the dismissed one stays gone
    expect(reloaded.notices[0]).toMatchObject({ kind: "releaseSucceeded", read: true });
    expect(reloaded.unreadNotices).toHaveLength(0);
  });

  it("a NEW run (different identity) signals again after an old one was dismissed", () => {
    const s = useNoticesStore();
    const first = succeededRun();
    s.ingestReleaseRun(first);
    s.dismiss(s.notices[0].id);

    const next = succeededRun({
      startedAt: "2026-09-30T18:00:00.000Z",
      updatedAt: "2026-09-30T18:04:00.000Z",
    });
    const created = s.ingestReleaseRun(next);
    expect(created).not.toBeNull();
    expect(s.activeNotices).toHaveLength(1);
  });
});

describe("channel wiring", () => {
  it("a fresh notice fires push when its type + master toggle are on", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("releaseSucceeded", true);
    useNoticesStore().ingestReleaseRun(succeededRun());
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Release v0.5.59 finished");
  });

  it("does not push when the per-type toggle is off (three release types exist)", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("releaseFailed", true); // only the failed kind
    useNoticesStore().ingestReleaseRun(succeededRun());
    await flush();
    expect(FakeNotification.instances).toHaveLength(0);

    useNoticesStore().ingestReleaseRun(failedRun());
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
  });

  it("an already-read notice (reload case) does not re-fire the channels", async () => {
    const first = useNoticesStore();
    first.ingestReleaseRun(succeededRun());
    first.markRead(first.notices[0].id);

    setActivePinia(createPinia());
    useNoticesStore().ingestReleaseRun(succeededRun());
    await flush();
    expect(FakeNotification.instances).toHaveLength(0);
  });
});
