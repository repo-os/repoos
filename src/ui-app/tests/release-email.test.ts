import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteContext } from "../../server/routes/types.js";
import {
  getReleaseEmail,
  getReleaseEmailPreview,
  sendReleaseEmailNow,
} from "../../server/routes/release.js";
import type { RepoOSConfig } from "../../core/types.js";
import { parseReleaseEmailConfig } from "../../core/config.js";
import {
  deliverCutReleaseEmail,
  escapeHtml,
  getReleaseEmailRecord,
  isPrereleaseVersion,
  markdownToHtml,
  previewReleaseEmail,
  readReleaseEmailLog,
  renderReleaseEmail,
  resendReleaseEmail,
  startCutReleaseEmail,
  waitForPublishedRelease,
  type ReleaseEmailDeps,
} from "../../server/release-email.js";
import { readReleaseHistory, type ReleaseHistoryEntry } from "../../server/release-history.js";
import { wireAttentionNotifications } from "../../server/attention-notify.js";
import type { AttentionEventStore } from "../../server/attention-events.js";
import type { RecordedAttentionEvent } from "../../core/attention.js";

// Fake values only: no real key, no real address, and no network. Every test
// passes its own fetch so nothing reaches Resend or GitHub.
const FAKE_KEY = "re_test_fake_key";
const FAKE_FROM = "releases@example.test";
const RECIPIENTS = ["team-a@example.test", "team-b@example.test"];

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "release-email-"));
  mkdirSync(join(root, ".repoos"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function entry(overrides: Partial<ReleaseHistoryEntry> = {}): ReleaseHistoryEntry {
  return {
    version: "0.6.0",
    tag: "v0.6.0",
    date: "2026-11-10",
    notes: "### Features\n\n- Faster boot\n- New **release** page",
    ...overrides,
  };
}

function writeHistory(entries: ReleaseHistoryEntry[]): void {
  writeFileSync(join(root, "release-history.json"), JSON.stringify({ releases: entries }), "utf8");
}

function makeConfig(
  email: Partial<NonNullable<RepoOSConfig["release"]>["email"]> = {},
  options: { repository?: string; provider?: boolean } = {},
): RepoOSConfig {
  const provider =
    options.provider === false
      ? undefined
      : {
          type: "resend" as const,
          apiKey: FAKE_KEY,
          fromAddress: FAKE_FROM,
          fromName: "RepoOS",
        };
  return {
    root,
    cacheDir: ".repoos",
    release: {
      enabled: true,
      name: "RepoOS",
      ...(options.repository ? { repository: options.repository } : {}),
      email: { enabled: true, to: RECIPIENTS, when: "tagged", ...email },
    },
    auth: { enabled: false, ...(provider ? { emailProvider: provider } : {}) },
  } as unknown as RepoOSConfig;
}

/** A fetch double: Resend accepts every send unless `failFor` says otherwise. */
function fakeFetch(
  options: {
    github?: (call: number) => Response | Promise<Response>;
    resendFailFor?: string;
  } = {},
) {
  const resendTo: string[] = [];
  const githubUrls: string[] = [];
  let githubCalls = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://api.resend.com/emails") {
      const body = JSON.parse(String(init?.body)) as { to: string[] };
      const to = body.to[0]!;
      if (to === options.resendFailFor) {
        return new Response("rejected", { status: 422 });
      }
      resendTo.push(to);
      return new Response("{}", { status: 200 });
    }
    githubUrls.push(url);
    githubCalls++;
    if (options.github) return options.github(githubCalls);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, resendTo, githubUrls, githubCalls: () => githubCalls };
}

/** Sleep that resolves at once and records the requested delays. */
function instantSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

function publishedResponse(): Response {
  return new Response(JSON.stringify({ draft: false, assets: [{ name: "repoos.tgz" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("isPrereleaseVersion", () => {
  it("flags beta, canary and rc tags and passes stable versions", () => {
    expect(isPrereleaseVersion("0.6.0-beta.1")).toBe(true);
    expect(isPrereleaseVersion("0.6.0-canary.3")).toBe(true);
    expect(isPrereleaseVersion("0.6.0-rc.2")).toBe(true);
    expect(isPrereleaseVersion("0.6.0")).toBe(false);
  });
});

describe("renderReleaseEmail", () => {
  it("uses the project and version in the subject", () => {
    const out = renderReleaseEmail(makeConfig(), entry());
    expect(out.subject).toBe("RepoOS v0.6.0 is out");
  });

  it("escapes release notes and known issues so they cannot inject markup", () => {
    const out = renderReleaseEmail(
      makeConfig(),
      entry({
        notes: '<script>alert(1)</script> & "quotes"',
        knownIssues: "<img src=x onerror=alert(1)>",
      }),
    );
    expect(out.html).not.toContain("<script>");
    expect(out.html).not.toContain("<img");
    expect(out.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;");
    expect(out.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("only links http and https targets from notes", () => {
    const html = markdownToHtml("[docs](https://example.test/a) and [bad](javascript:alert(1))");
    expect(html).toContain('<a href="https://example.test/a">docs</a>');
    expect(html).not.toContain('href="javascript:');
  });

  it("says so when the release has no notes", () => {
    const out = renderReleaseEmail(makeConfig(), entry({ notes: "   " }));
    expect(out.html).toContain("No release notes were written for this release.");
    expect(out.text).toContain("No release notes were written for this release.");
  });

  it("renders 'None recorded' when there are no known issues", () => {
    const out = renderReleaseEmail(makeConfig(), entry({ knownIssues: "  " }));
    expect(out.html).toContain("None recorded.");
    expect(out.text).toContain("None recorded.");
  });

  it("renders known issues when the operator recorded them", () => {
    const out = renderReleaseEmail(
      makeConfig(),
      entry({ knownIssues: "- Tray icon flickers on macOS 27" }),
    );
    expect(out.html).toContain("Tray icon flickers on macOS 27");
    expect(out.html).not.toContain("None recorded.");
  });

  it("keeps every line of long notes", () => {
    const long = Array.from({ length: 400 }, (_, i) => `- change ${i}`).join("\n");
    const out = renderReleaseEmail(makeConfig(), entry({ notes: long }));
    expect(out.html).toContain("change 0</li>");
    expect(out.html).toContain("change 399</li>");
    expect(out.text).toContain("- change 399");
  });

  it("adds GitHub and changelog links only when a repository is configured", () => {
    const without = renderReleaseEmail(makeConfig(), entry());
    expect(without.html).not.toContain("github.com");
    const withRepo = renderReleaseEmail(makeConfig({}, { repository: "repo-os/repoos" }), entry());
    expect(withRepo.html).toContain("https://github.com/repo-os/repoos/releases/tag/v0.6.0");
    expect(withRepo.html).toContain("https://github.com/repo-os/repoos/blob/v0.6.0/CHANGELOG.md");
    expect(withRepo.text).toContain("Release on GitHub: https://github.com/repo-os/repoos");
  });

  it("shows the upgrade command only when one is supplied", () => {
    const plain = renderReleaseEmail(makeConfig(), entry());
    expect(plain.html).not.toContain("To upgrade");
    const upgrade = renderReleaseEmail(makeConfig(), entry(), { upgradeCommand: "repoos upgrade" });
    expect(upgrade.html).toContain("<code>repoos upgrade</code>");
    expect(upgrade.text).toContain("To upgrade: repoos upgrade");
  });

  it("marks a prerelease in the body", () => {
    const out = renderReleaseEmail(
      makeConfig(),
      entry({ version: "0.6.0-rc.1", tag: "v0.6.0-rc.1" }),
    );
    expect(out.html).toContain("prerelease");
    expect(out.text).toContain("(prerelease)");
  });

  it("escapes the HTML helper on its own", () => {
    expect(escapeHtml(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;");
  });
});

describe("parseReleaseEmailConfig", () => {
  it("returns undefined when no release.email key is set", () => {
    expect(parseReleaseEmailConfig({})).toBeUndefined();
  });

  it("keeps valid addresses, drops invalid ones, and dedupes", () => {
    const email = parseReleaseEmailConfig({
      "release.email.enabled": true,
      "release.email.to": ["hello@repoos.org", "not-an-address", "hello@repoos.org", " "],
      "release.email.when": "tagged",
      "release.email.includePrereleases": true,
    });
    expect(email).toEqual({
      enabled: true,
      to: ["hello@repoos.org"],
      when: "tagged",
      includePrereleases: true,
    });
  });

  it("accepts a comma-separated recipient string", () => {
    const email = parseReleaseEmailConfig({
      "release.email.to": "a@example.test, b@example.test",
    });
    expect(email?.to).toEqual(["a@example.test", "b@example.test"]);
  });

  it("falls back to published for an unknown when value", () => {
    const email = parseReleaseEmailConfig({ "release.email.when": "soon" });
    expect(email?.when).toBe("published");
  });
});

describe("waitForPublishedRelease", () => {
  it("reports published once a release with assets appears", async () => {
    const { fetchImpl, githubUrls } = fakeFetch({
      github: (call) => (call < 3 ? new Response("", { status: 404 }) : publishedResponse()),
    });
    const { sleep, waits } = instantSleep();
    const outcome = await waitForPublishedRelease("repo-os/repoos", "v0.6.0", {
      fetchImpl,
      sleep,
    });
    expect(outcome).toEqual({ state: "published" });
    expect(githubUrls[0]).toBe("https://api.github.com/repos/repo-os/repoos/releases/tags/v0.6.0");
    expect(waits.length).toBe(2);
  });

  it("does not count a draft or an asset-less release as published", async () => {
    const { fetchImpl } = fakeFetch({
      github: (call) =>
        call === 1
          ? new Response(JSON.stringify({ draft: true, assets: [{}] }), { status: 200 })
          : new Response(JSON.stringify({ draft: false, assets: [] }), { status: 200 }),
    });
    let now = 0;
    const outcome = await waitForPublishedRelease("repo-os/repoos", "v0.6.0", {
      fetchImpl,
      sleep: async (ms) => {
        now += ms;
      },
      now: () => now,
      publishTimeoutMs: 1000,
      initialDelayMs: 400,
      maxDelayMs: 400,
    });
    expect(outcome.state).toBe("timeout");
  });

  it("times out when GitHub never publishes the release", async () => {
    const { fetchImpl } = fakeFetch({ github: () => new Response("", { status: 404 }) });
    let now = 0;
    const outcome = await waitForPublishedRelease("repo-os/repoos", "v0.6.0", {
      fetchImpl,
      sleep: async (ms) => {
        now += ms;
      },
      now: () => now,
      publishTimeoutMs: 10_000,
      initialDelayMs: 4_000,
      maxDelayMs: 4_000,
    });
    expect(outcome.state).toBe("timeout");
    if (outcome.state === "timeout") expect(outcome.reason).toMatch(/no release/);
  });

  it("is unavailable when the first look cannot reach GitHub", async () => {
    const fetchImpl = (async () => {
      throw new Error("getaddrinfo ENOTFOUND api.github.com");
    }) as typeof fetch;
    const outcome = await waitForPublishedRelease("repo-os/repoos", "v0.6.0", {
      fetchImpl,
      sleep: instantSleep().sleep,
    });
    expect(outcome.state).toBe("unavailable");
  });
});

describe("deliverCutReleaseEmail", () => {
  it("sends one email per recipient when tagged, then never again for that version", async () => {
    writeHistory([entry()]);
    const config = makeConfig({ when: "tagged" });
    const fake = fakeFetch();
    const deps: ReleaseEmailDeps = { fetchImpl: fake.fetchImpl };

    const first = await deliverCutReleaseEmail(config, entry(), {}, deps);
    expect(first?.status).toBe("sent");
    expect(fake.resendTo).toEqual(RECIPIENTS);

    const second = await deliverCutReleaseEmail(config, entry(), {}, deps);
    expect(second?.status).toBe("sent");
    expect(fake.resendTo).toEqual(RECIPIENTS);
  });

  it("sends nothing when the feature is off", async () => {
    const config = makeConfig({ enabled: false });
    const fake = fakeFetch();
    const record = await deliverCutReleaseEmail(config, entry(), {}, { fetchImpl: fake.fetchImpl });
    expect(record).toBeNull();
    expect(fake.resendTo).toEqual([]);
    expect(fake.githubCalls()).toBe(0);
  });

  it("skips prereleases unless includePrereleases is on", async () => {
    const pre = entry({ version: "0.6.0-beta.1", tag: "v0.6.0-beta.1" });
    const fake = fakeFetch();
    const skipped = await deliverCutReleaseEmail(
      makeConfig({ when: "tagged" }),
      pre,
      {},
      { fetchImpl: fake.fetchImpl },
    );
    expect(skipped?.status).toBe("skipped");
    expect(fake.resendTo).toEqual([]);

    const sent = await deliverCutReleaseEmail(
      makeConfig({ when: "tagged", includePrereleases: true }),
      pre,
      {},
      { fetchImpl: fake.fetchImpl },
    );
    expect(sent?.status).toBe("sent");
  });

  it("explains rather than sends when no email provider is configured", async () => {
    const fake = fakeFetch();
    const record = await deliverCutReleaseEmail(
      makeConfig({ when: "tagged" }, { provider: false }),
      entry(),
      {},
      { fetchImpl: fake.fetchImpl },
    );
    expect(record?.status).toBe("skipped");
    expect(record?.reason).toMatch(/email provider/i);
    expect(fake.resendTo).toEqual([]);
  });

  it("waits for GitHub to publish before sending when a repository is set", async () => {
    const fake = fakeFetch({
      github: (call) => (call < 2 ? new Response("", { status: 404 }) : publishedResponse()),
    });
    const { sleep } = instantSleep();
    const record = await deliverCutReleaseEmail(
      makeConfig({ when: "published" }, { repository: "repo-os/repoos" }),
      entry(),
      {},
      { fetchImpl: fake.fetchImpl, sleep },
    );
    expect(record?.status).toBe("sent");
    expect(fake.resendTo).toEqual(RECIPIENTS);
    expect(fake.githubCalls()).toBe(2);
  });

  it("records a failure and sends nothing when GitHub never publishes", async () => {
    const fake = fakeFetch({ github: () => new Response("", { status: 404 }) });
    let now = 0;
    const record = await deliverCutReleaseEmail(
      makeConfig({ when: "published" }, { repository: "repo-os/repoos" }),
      entry(),
      {},
      {
        fetchImpl: fake.fetchImpl,
        sleep: async (ms) => {
          now += ms;
        },
        now: () => now,
        publishTimeoutMs: 5_000,
        initialDelayMs: 2_000,
        maxDelayMs: 2_000,
      },
    );
    expect(record?.status).toBe("failed");
    expect(record?.reason).toMatch(/not on GitHub/);
    expect(fake.resendTo).toEqual([]);
  });

  it("falls back to sending at the tag when there is no repository", async () => {
    const fake = fakeFetch();
    const record = await deliverCutReleaseEmail(
      makeConfig({ when: "published" }),
      entry(),
      {},
      { fetchImpl: fake.fetchImpl },
    );
    expect(record?.status).toBe("sent");
    expect(fake.githubCalls()).toBe(0);
  });

  it("falls back to sending at the tag when GitHub cannot be reached at all", async () => {
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://api.resend.com/emails") {
        return new Response("{}", { status: 200 });
      }
      void init;
      throw new Error("offline");
    }) as typeof fetch;
    const record = await deliverCutReleaseEmail(
      makeConfig({ when: "published" }, { repository: "repo-os/repoos" }),
      entry(),
      {},
      { fetchImpl, sleep: instantSleep().sleep },
    );
    expect(record?.status).toBe("sent");
    expect(record?.reason).toMatch(/could not be checked/);
  });

  it("records a partial failure and lets Resend retry only the rest", async () => {
    writeHistory([entry()]);
    const config = makeConfig({ when: "tagged" });
    const flaky = fakeFetch({ resendFailFor: RECIPIENTS[1] });
    const first = await deliverCutReleaseEmail(config, entry(), {}, { fetchImpl: flaky.fetchImpl });
    expect(first?.status).toBe("failed");
    expect(first?.sentTo).toEqual([RECIPIENTS[0]]);
    expect(first?.reason).toMatch(/Sent to 1 of 2/);
    expect(flaky.resendTo).toEqual([RECIPIENTS[0]]);

    const healthy = fakeFetch();
    const retried = await resendReleaseEmail(config, "0.6.0", {}, { fetchImpl: healthy.fetchImpl });
    expect(retried.status).toBe("sent");
    expect(healthy.resendTo).toEqual([RECIPIENTS[1]]);
    expect(readReleaseEmailLog(config)["0.6.0"]?.sentTo).toEqual(RECIPIENTS);
  });

  it("stores the release entry's known issues in the rendered email", async () => {
    writeHistory([entry({ knownIssues: "- Dark mode toggle lags" })]);
    const config = makeConfig({ when: "tagged" });
    const preview = previewReleaseEmail(config, "0.6.0");
    expect(preview.html).toContain("Dark mode toggle lags");
    expect(preview.recipients).toEqual(RECIPIENTS);
  });
});

describe("resendReleaseEmail", () => {
  it("refuses when the feature is off, so a stray click cannot send", async () => {
    writeHistory([entry()]);
    await expect(
      resendReleaseEmail(
        makeConfig({ enabled: false }),
        "0.6.0",
        {},
        { fetchImpl: fakeFetch().fetchImpl },
      ),
    ).rejects.toThrow(/turn them on/i);
  });

  it("refuses a version with no recorded release notes", async () => {
    writeHistory([entry()]);
    await expect(
      resendReleaseEmail(makeConfig(), "9.9.9", {}, { fetchImpl: fakeFetch().fetchImpl }),
    ).rejects.toThrow(/No release notes/);
  });

  it("does nothing on the wire when every recipient already has the email", async () => {
    writeHistory([entry()]);
    const config = makeConfig({ when: "tagged" });
    const fake = fakeFetch();
    await deliverCutReleaseEmail(config, entry(), {}, { fetchImpl: fake.fetchImpl });
    const again = await resendReleaseEmail(config, "0.6.0", {}, { fetchImpl: fake.fetchImpl });
    expect(again.status).toBe("sent");
    expect(fake.resendTo).toEqual(RECIPIENTS);
  });
});

describe("restart and failure recovery", () => {
  it("reads a pending record left by a restart as failed, and Resend recovers it", async () => {
    writeHistory([entry()]);
    writeFileSync(
      join(root, ".repoos", "release-emails.json"),
      JSON.stringify({
        "0.6.0": {
          version: "0.6.0",
          tag: "v0.6.0",
          status: "pending",
          when: "published",
          sentTo: [],
          reason: "Waiting for GitHub to publish v0.6.0",
          at: "2026-11-10T00:00:00.000Z",
        },
      }),
      "utf8",
    );
    const config = makeConfig({ when: "published" }, { repository: "repo-os/repoos" });
    const record = getReleaseEmailRecord(config, "0.6.0");
    expect(record?.status).toBe("failed");
    expect(record?.reason).toMatch(/restarted/);

    const fake = fakeFetch({ github: () => publishedResponse() });
    const resent = await resendReleaseEmail(config, "0.6.0", {}, { fetchImpl: fake.fetchImpl });
    expect(resent.status).toBe("sent");
    expect(fake.resendTo).toEqual(RECIPIENTS);
  });

  it("keeps waiting through an HTTP error on the first look instead of sending early", async () => {
    const fake = fakeFetch({
      github: (call) =>
        call === 1 ? new Response("rate limited", { status: 403 }) : publishedResponse(),
    });
    const outcome = await waitForPublishedRelease("repo-os/repoos", "v0.6.0", {
      fetchImpl: fake.fetchImpl,
      sleep: instantSleep().sleep,
    });
    expect(outcome.state).toBe("published");
    expect(fake.githubCalls()).toBe(2);
  });

  it("bounds each Resend call with an abort signal so a hung provider cannot stall the send", async () => {
    writeHistory([entry()]);
    const signals: Array<AbortSignal | undefined> = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await deliverCutReleaseEmail(makeConfig({ when: "tagged" }), entry(), {}, { fetchImpl });
    expect(signals.length).toBe(RECIPIENTS.length);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("puts a failed send on the bell and clears it when Resend succeeds", async () => {
    writeHistory([entry()]);
    const store = memoryAttentionStore();
    wireAttentionNotifications(store, () => undefined);
    const config = makeConfig({ when: "tagged" });
    await deliverCutReleaseEmail(
      config,
      entry(),
      {},
      { fetchImpl: fakeFetch({ resendFailFor: RECIPIENTS[1] }).fetchImpl },
    );
    const raised = store.list();
    expect(raised.map((e) => e.kind)).toEqual(["releaseEmailFailed"]);
    expect(raised[0]?.message).toBe("v0.6.0 email not sent");
    expect(raised[0]?.detail).toMatch(/team-b/);

    await resendReleaseEmail(config, "0.6.0", {}, { fetchImpl: fakeFetch().fetchImpl });
    expect(store.list()).toEqual([]);
  });

  it("puts a missing provider on the bell rather than failing silently", async () => {
    writeHistory([entry()]);
    const store = memoryAttentionStore();
    wireAttentionNotifications(store, () => undefined);
    await deliverCutReleaseEmail(makeConfig({ when: "tagged" }, { provider: false }), entry());
    expect(store.list().map((e) => e.kind)).toEqual(["releaseEmailFailed"]);
  });

  it("surfaces a record that cannot be read when the detached start runs", async () => {
    writeHistory([entry()]);
    const store = memoryAttentionStore();
    wireAttentionNotifications(store, () => undefined);
    writeFileSync(join(root, ".repoos", "release-emails.json"), "{not json", "utf8");
    const errors = console.error;
    console.error = () => undefined;
    try {
      startCutReleaseEmail(
        makeConfig({ when: "tagged" }),
        entry(),
        {},
        {
          fetchImpl: fakeFetch().fetchImpl,
        },
      );
      for (let i = 0; i < 50 && store.list().length === 0; i++) {
        await new Promise((done) => setTimeout(done, 0));
      }
    } finally {
      console.error = errors;
    }
    const raised = store.list();
    expect(raised.map((e) => e.kind)).toEqual(["releaseEmailFailed"]);
    expect(raised[0]?.detail).toMatch(/Could not parse/);
  });
});

/** An in-memory attention store, so the bell lifecycle can be asserted without disk. */
function memoryAttentionStore(): AttentionEventStore & { list(): RecordedAttentionEvent[] } {
  const events = new Map<string, RecordedAttentionEvent>();
  return {
    record(event) {
      const full = {
        ...event,
        id: event.id ?? `${event.kind}:${event.at}`,
      } as RecordedAttentionEvent;
      events.set(full.id, full);
      return full;
    },
    remove(id) {
      events.delete(id);
    },
    list() {
      return [...events.values()];
    },
  };
}

describe("release history round trip", () => {
  it("keeps knownIssues through readReleaseHistory and drops empty ones", () => {
    writeHistory([
      entry({ knownIssues: "- one" }),
      entry({ version: "0.5.9", tag: "v0.5.9", knownIssues: "   " }),
    ]);
    const releases = readReleaseHistory(root).releases;
    expect(releases[0]?.knownIssues).toBe("- one");
    expect(releases[1]?.knownIssues).toBeUndefined();
  });
});

describe("Settings placement", () => {
  it("renders every release.email key under the Release emails section", async () => {
    const { generalSectionForKey, GENERAL_FIELD_SECTIONS, GENERAL_SECTIONS } =
      await import("../src/settings-location");
    for (const key of [
      "release.email.enabled",
      "release.email.to",
      "release.email.when",
      "release.email.includePrereleases",
    ]) {
      expect(generalSectionForKey(key)).toBe("release-emails");
    }
    expect(GENERAL_SECTIONS.map((s: { id: string }) => s.id)).toContain("release-emails");
    expect(GENERAL_FIELD_SECTIONS).toContain("release-emails");
  });
});

describe("release email routes", () => {
  // The handlers take a plain request and response. Every send path stays off
  // the network: the tests only reach refusals, previews and recorded state.
  function fakeReq(url: string, body?: unknown): IncomingMessage {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    return Object.assign(req, { url }) as unknown as IncomingMessage;
  }
  function fakeRes() {
    const out = { status: 0, body: undefined as unknown };
    const res = {
      writeHead(status: number) {
        out.status = status;
        return res;
      },
      end(payload: string) {
        out.body = JSON.parse(payload);
      },
    };
    return { res: res as unknown as ServerResponse, out };
  }
  function ctxFor(config: RepoOSConfig): RouteContext {
    return { config } as unknown as RouteContext;
  }

  it("reports the recorded email state for a version", async () => {
    writeHistory([entry()]);
    const config = makeConfig({ when: "tagged" });
    await deliverCutReleaseEmail(config, entry(), {}, { fetchImpl: fakeFetch().fetchImpl });
    const { res, out } = fakeRes();
    await getReleaseEmail(ctxFor(config), fakeReq("/api/release/email?version=0.6.0"), res, {});
    expect(out.status).toBe(200);
    const body = out.body as {
      enabled: boolean;
      providerConfigured: boolean;
      record: { status: string };
    };
    expect(body.enabled).toBe(true);
    expect(body.providerConfigured).toBe(true);
    expect(body.record?.status).toBe("sent");
  });

  it("renders the preview for a recorded version without sending", async () => {
    writeHistory([entry()]);
    const { res, out } = fakeRes();
    await getReleaseEmailPreview(
      ctxFor(makeConfig()),
      fakeReq("/api/release/email/preview?version=0.6.0"),
      res,
      {},
    );
    expect(out.status).toBe(200);
    expect((out.body as { subject: string }).subject).toMatch(/v0\.6\.0 is out/);
  });

  it("answers 404 to a preview for a version with no release notes", async () => {
    writeHistory([entry()]);
    const { res, out } = fakeRes();
    await getReleaseEmailPreview(
      ctxFor(makeConfig()),
      fakeReq("/api/release/email/preview?version=9.9.9"),
      res,
      {},
    );
    expect(out.status).toBe(404);
  });

  it("requires a version on the Resend route", async () => {
    const { res, out } = fakeRes();
    await sendReleaseEmailNow(
      ctxFor(makeConfig()),
      fakeReq("/api/release/email/send", {}),
      res,
      {},
    );
    expect(out.status).toBe(400);
  });

  it("refuses a Resend while the feature is off, before anything is sent", async () => {
    writeHistory([entry()]);
    const { res, out } = fakeRes();
    await sendReleaseEmailNow(
      ctxFor(makeConfig({ enabled: false })),
      fakeReq("/api/release/email/send", { version: "0.6.0" }),
      res,
      {},
    );
    expect(out.status).toBe(409);
    expect((out.body as { error: string }).error).toMatch(/turn them on/i);
  });
});

describe("Settings recipient list", () => {
  it("rejects a malformed address in release.email.to and names it", async () => {
    const { patchConfig } = await import("../../server/routes/config.js");
    const out = { status: 0, body: undefined as unknown };
    const res = {
      writeHead(status: number) {
        out.status = status;
        return res;
      },
      end(payload: string) {
        out.body = JSON.parse(payload);
      },
    } as unknown as ServerResponse;
    const req = Readable.from([
      Buffer.from(JSON.stringify({ "release.email.to": ["team at example"] })),
    ]);
    await patchConfig(
      { config: makeConfig(), repoos: {}, index: {} } as unknown as RouteContext,
      Object.assign(req, { url: "/api/config" }) as unknown as IncomingMessage,
      res,
      {},
    );
    expect(out.status).toBe(400);
    expect((out.body as { error: string }).error).toMatch(
      /team at example is not an email address/,
    );
  });

  it("rejects a recipient list that is not an array", async () => {
    const { patchConfig } = await import("../../server/routes/config.js");
    const out = { status: 0, body: undefined as unknown };
    const res = {
      writeHead(status: number) {
        out.status = status;
        return res;
      },
      end(payload: string) {
        out.body = JSON.parse(payload);
      },
    } as unknown as ServerResponse;
    const req = Readable.from([
      Buffer.from(JSON.stringify({ "release.email.to": "team@example.test" })),
    ]);
    await patchConfig(
      { config: makeConfig(), repoos: {}, index: {} } as unknown as RouteContext,
      Object.assign(req, { url: "/api/config" }) as unknown as IncomingMessage,
      res,
      {},
    );
    expect(out.status).toBe(400);
    expect((out.body as { error: string }).error).toMatch(/must be an array of addresses/);
  });
});
