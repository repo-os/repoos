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
  /** Counts oscillator creations so tests can assert whether the bell rang. */
  static oscillators = 0;
  currentTime = 0;
  destination = {};
  createOscillator() {
    FakeAudioContext.oscillators++;
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
  FakeAudioContext.oscillators = 0;
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

/** A durable close-out outcome as the server records it (#0640). */
function closeOut(
  over: Partial<import("../src/types").CloseOutOutcomeEvent> = {},
): import("../src/types").CloseOutOutcomeEvent {
  return {
    taskId: "0633",
    outcome: "succeeded",
    finishedAt: "2026-10-03T17:00:00.000Z",
    reason: "",
    ...over,
  };
}

describe("ingestCloseOutOutcome (#0640)", () => {
  it("creates exactly one notice per finished run, no matter how often it is delivered", () => {
    const s = useNoticesStore();
    const event = closeOut();
    const created = s.ingestCloseOutOutcome(event);
    expect(created).not.toBeNull();
    // The list endpoint backfill and the live SSE frame both deliver the same
    // event — identity keyed on taskId+finishedAt keeps it at exactly one.
    s.ingestCloseOutOutcome(event);
    s.ingestCloseOutOutcome(event);
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]).toMatchObject({
      kind: "closeOutSucceeded",
      title: "Move to done: #0633 landed",
      detail: "Merged and published to main.",
      link: "/work?task=0633",
      createdAt: "2026-10-03T17:00:00.000Z",
      read: false,
      dismissed: false,
    });
  });

  it("uses the server finish time, not the ingest time, as createdAt", () => {
    const s = useNoticesStore();
    const finishedAt = "2026-09-01T12:34:56.000Z";
    s.ingestCloseOutOutcome(closeOut({ finishedAt }));
    expect(s.notices[0].createdAt).toBe(finishedAt);
  });

  it("names the failure with the first reason line and a distinct failure kind", () => {
    const s = useNoticesStore();
    s.ingestCloseOutOutcome(
      closeOut({
        outcome: "failed",
        reason: "check failed: 2 tests failed\n  - one\n  - two",
      }),
    );
    expect(s.notices[0]).toMatchObject({
      kind: "closeOutFailed",
      title: "Move to done: #0633 failed",
      detail: "check failed: 2 tests failed",
    });
  });

  it("keeps timeout separate and puts the budget + hint in the title/detail", () => {
    const s = useNoticesStore();
    s.ingestCloseOutOutcome(
      closeOut({
        outcome: "timedOut",
        reason:
          "close-out timed out after 6m — increase closeOut.timeoutMs or retry when the runner is less loaded",
      }),
    );
    expect(s.notices[0].kind).toBe("closeOutTimedOut");
    expect(s.notices[0].title).toBe("Move to done: #0633 timed out after 6m");
    expect(s.notices[0].detail).toContain("increase closeOut.timeoutMs");
  });

  it("orders notices newest first by finishedAt", () => {
    const s = useNoticesStore();
    s.ingestCloseOutOutcome(closeOut({ finishedAt: "2026-10-03T17:00:00.000Z" }));
    s.ingestCloseOutOutcome(closeOut({ taskId: "0644", finishedAt: "2026-10-03T18:00:00.000Z" }));
    expect(s.activeNotices).toHaveLength(2);
    expect(s.activeNotices[0].title).toBe("Move to done: #0644 landed");
    expect(s.activeNotices[1].title).toBe("Move to done: #0633 landed");
  });

  it("a dismissed run stays gone when re-delivered, but a retry with a new finish time is new", () => {
    const s = useNoticesStore();
    const first = closeOut();
    s.ingestCloseOutOutcome(first);
    s.dismiss(s.notices[0].id);
    s.ingestCloseOutOutcome(first);
    expect(s.activeNotices).toHaveLength(0);

    const retry = closeOut({
      finishedAt: "2026-10-03T18:30:00.000Z",
      reason: "",
    });
    expect(s.ingestCloseOutOutcome(retry)).not.toBeNull();
    expect(s.activeNotices).toHaveLength(1);
  });

  it("read/dismissed markers survive a page reload (fresh pinia + store)", () => {
    const s = useNoticesStore();
    const succeeded = closeOut();
    const failed = closeOut({
      taskId: "0644",
      outcome: "failed",
      finishedAt: "2026-10-03T18:00:00.000Z",
      reason: "boom",
    });
    s.ingestCloseOutOutcome(succeeded);
    s.ingestCloseOutOutcome(failed);
    s.markRead(s.notices.find((n) => n.kind === "closeOutSucceeded")!.id);
    s.dismiss(s.notices.find((n) => n.kind === "closeOutFailed")!.id);

    setActivePinia(createPinia());
    const reloaded = useNoticesStore();
    reloaded.ingestCloseOutOutcome(succeeded);
    reloaded.ingestCloseOutOutcome(failed);
    expect(reloaded.notices).toHaveLength(1);
    expect(reloaded.notices[0]).toMatchObject({ kind: "closeOutSucceeded", read: true });
    expect(reloaded.unreadNotices).toHaveLength(0);
  });

  it("ignores malformed / unknown events instead of throwing", () => {
    const s = useNoticesStore();
    expect(s.ingestCloseOutOutcome(null)).toBeNull();
    expect(
      s.ingestCloseOutOutcome(
        closeOut({ outcome: "cancelled" as unknown as import("../src/types").CloseOutOutcome }),
      ),
    ).toBeNull();
    expect(s.notices).toHaveLength(0);
  });
});

describe("close-out channel wiring (#0640)", () => {
  it("a fresh close-out notice fires push when its type + master toggle are on", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("closeOutSucceeded", true);
    useNoticesStore().ingestCloseOutOutcome(closeOut());
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Move to done: #0633 landed");
  });

  it("does not push when the per-type toggle is off (independent from release kinds)", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("releaseSucceeded", true);
    useNoticesStore().ingestCloseOutOutcome(closeOut());
    await flush();
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("an already-read outcome (reload backfill) does not re-fire the channels", async () => {
    const first = useNoticesStore();
    first.ingestCloseOutOutcome(closeOut());
    first.markRead(first.notices[0].id);

    setActivePinia(createPinia());
    useNoticesStore().ingestCloseOutOutcome(closeOut());
    await flush();
    expect(FakeNotification.instances).toHaveLength(0);
  });
});

describe("close-out sound toggle suppression (#0640)", () => {
  const cases = [
    ["closeOutSucceeded", closeOut()],
    ["closeOutFailed", closeOut({ outcome: "failed" as const, reason: "boom" })],
    [
      "closeOutTimedOut",
      closeOut({
        outcome: "timedOut" as const,
        reason: "close-out timed out after 6m — increase closeOut.timeoutMs",
      }),
    ],
  ] as const;

  it.each(cases)(
    "disabling %s keeps the bell notice but suppresses the sound",
    async (type, event) => {
      const n = useNotificationsStore();
      n.setSoundEnabled(true);
      n.setTypeEnabled(type, false);
      const s = useNoticesStore();
      s.ingestCloseOutOutcome(event);
      await flush();
      // The per-type toggle only gates the channel; the notice stays in the feed.
      expect(s.activeNotices).toHaveLength(1);
      expect(FakeAudioContext.oscillators).toBe(0);
    },
  );

  it("rings the bell when the close-out type's sound toggle is on", async () => {
    const n = useNotificationsStore();
    n.setSoundEnabled(true);
    n.setTypeEnabled("closeOutSucceeded", true);
    useNoticesStore().ingestCloseOutOutcome(closeOut());
    await flush();
    expect(FakeAudioContext.oscillators).toBeGreaterThan(0);
  });
});
