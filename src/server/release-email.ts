/**
 * Release emails (#1071): one email per recipient when a stable release goes
 * out, sent through the shared provider (server/email.ts).
 *
 * Three decisions shape this module:
 *
 * - "Published" means GitHub serves the release with its assets. A git hook
 *   would fire on the tag push, before CI has built anything, and the email
 *   would link to a download that does not exist yet. So with a GitHub
 *   `[release].repository` we poll the public releases API (plain `fetch`, no
 *   token) and fall back to sending at the tag when there is no repository or
 *   no network.
 * - Sends are recorded per version in a gitignored file under the cache dir,
 *   so a restart or a retried cut never double-sends. Only the explicit Resend
 *   button sends again, and it only goes to recipients who did not get it.
 * - Nothing here can fail a release. Every entry point reports into the record
 *   instead of throwing.
 */

import { readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, ReleaseEmailConfig } from "../core/types.js";
import { projectDisplayName } from "../core/config.js";
import { readReleaseHistory, type ReleaseHistoryEntry } from "./release-history.js";
import { emailProviderConfigured, sendEmail } from "./email.js";
import {
  notifyAttentionReleaseEmail,
  notifyAttentionReleaseEmailCleared,
} from "./attention-notify.js";

export const RELEASE_EMAIL_LOG_FILE = "release-emails.json";

export type ReleaseEmailStatus = "pending" | "sent" | "failed" | "skipped";

/** One release's email state. Keyed by version in `release-emails.json`. */
export interface ReleaseEmailRecord {
  version: string;
  tag: string;
  status: ReleaseEmailStatus;
  /** The `when` in force when the record was written. */
  when: "published" | "tagged";
  /** Addresses the provider accepted. Resend only targets the rest. */
  sentTo: string[];
  /** Human-readable detail for pending, failed and skipped states. */
  reason?: string;
  /** ISO time the record last changed. */
  at: string;
}

/** Per-cut context the renderer needs that the release record does not carry. */
export interface ReleaseEmailContext {
  /** Shown as the upgrade step when the project ships its own CLI (`repoos upgrade`). */
  upgradeCommand?: string;
}

/** Injected seams so tests never touch the network or the clock. */
export interface ReleaseEmailDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** How long to wait for GitHub to publish before giving up. Default one hour. */
  publishTimeoutMs?: number;
  /** First wait after the first probe. Default one minute. */
  initialDelayMs?: number;
  /** Cap on the wait between probes. Default three minutes. */
  maxDelayMs?: number;
}

const GITHUB_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DEFAULT_PUBLISH_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 60 * 1000;
const DEFAULT_MAX_DELAY_MS = 3 * 60 * 1000;

/** Versions with a waiter or a send in progress, so one cut never runs twice. */
const inFlight = new Set<string>();

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** Prereleases carry a hyphen suffix: `0.6.0-beta.1`, `0.6.0-rc.2`, `0.6.0-canary.3`. */
export function isPrereleaseVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-/.test(version.trim());
}

/** The configured GitHub `owner/repo`, or null when it is absent or malformed. */
export function githubRepository(config: RepoOSConfig): string | null {
  const repo = config.release?.repository?.trim() ?? "";
  return GITHUB_REPO.test(repo) ? repo : null;
}

function releaseName(config: RepoOSConfig): string {
  return config.release?.name?.trim() || projectDisplayName(config.root);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline markdown on already-escaped text: code, bold, and http(s) links only. */
function inlineHtml(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * The release-notes subset of markdown the email understands: headings become
 * group labels, `-`/`*` lines become lists, anything else is a paragraph.
 * Everything is escaped before any tag is added, so notes cannot inject markup.
 */
export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let list: string[] | null = null;
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length) out.push(`<p>${inlineHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
    if (list) out.push(`<ul>${list.join("")}</ul>`);
    list = null;
  };
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = escapeHtml(raw.trim());
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (!line) {
      flush();
    } else if (heading) {
      flush();
      out.push(`<h3 style="margin: 20px 0 8px; font-size: 16px;">${inlineHtml(heading[1]!)}</h3>`);
    } else if (bullet) {
      if (paragraph.length) {
        out.push(`<p>${inlineHtml(paragraph.join(" "))}</p>`);
        paragraph = [];
      }
      list ??= [];
      list.push(`<li style="margin: 4px 0;">${inlineHtml(bullet[1]!)}</li>`);
    } else {
      if (list) {
        out.push(`<ul>${list.join("")}</ul>`);
        list = null;
      }
      paragraph.push(line);
    }
  }
  flush();
  return out.join("\n");
}

/** Plain-text alternative: the same structure without markup. */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^#{1,6}\s+(.*)$/, (_, title: string) => title.toUpperCase()))
    .map((line) => line.replace(/^\*\s+/, "- "))
    .map((line) => line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface RenderedReleaseEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Subject, HTML and plain-text bodies for one release. Pure: no I/O and no
 * clock, so the preview and the send render identically.
 */
export function renderReleaseEmail(
  config: RepoOSConfig,
  entry: ReleaseHistoryEntry,
  context: ReleaseEmailContext = {},
): RenderedReleaseEmail {
  const project = releaseName(config);
  const repo = githubRepository(config);
  const subject = `${project} v${entry.version} is out`;
  const notes = entry.notes.trim();
  const knownIssues = entry.knownIssues?.trim() ?? "";
  const links: { label: string; href: string }[] = [];
  if (repo) {
    links.push({
      label: "Release on GitHub",
      href: `https://github.com/${repo}/releases/tag/${entry.tag}`,
    });
    links.push({
      label: "Changelog",
      href: `https://github.com/${repo}/blob/${entry.tag}/CHANGELOG.md`,
    });
  }
  const prerelease = isPrereleaseVersion(entry.version);

  const linkHtml = links
    .map(
      (link) =>
        `<li style="margin: 4px 0;"><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`,
    )
    .join("");
  const upgradeHtml = context.upgradeCommand
    ? `<p style="margin: 20px 0 0;">To upgrade: <code>${escapeHtml(context.upgradeCommand)}</code></p>`
    : "";
  const html = [
    `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #222;">`,
    `<h1 style="margin: 0 0 8px; font-size: 24px;">${escapeHtml(subject)}</h1>`,
    `<p style="margin: 0 0 24px; color: #666; font-size: 14px;">Released ${escapeHtml(entry.date)}${prerelease ? " · prerelease" : ""}</p>`,
    `<h2 style="margin: 0 0 8px; font-size: 18px;">Release notes</h2>`,
    notes ? markdownToHtml(notes) : `<p>No release notes were written for this release.</p>`,
    `<h2 style="margin: 24px 0 8px; font-size: 18px;">Known issues</h2>`,
    knownIssues ? markdownToHtml(knownIssues) : `<p>None recorded.</p>`,
    links.length
      ? `<h2 style="margin: 24px 0 8px; font-size: 18px;">Links</h2><ul>${linkHtml}</ul>`
      : "",
    upgradeHtml,
    `<p style="margin-top: 32px; color: #999; font-size: 12px;">You are receiving this because you are on the ${escapeHtml(project)} release list.</p>`,
    `</div>`,
  ].join("\n");

  const textParts = [
    subject,
    `Released ${entry.date}${prerelease ? " (prerelease)" : ""}`,
    "",
    "RELEASE NOTES",
    notes ? markdownToText(notes) : "No release notes were written for this release.",
    "",
    "KNOWN ISSUES",
    knownIssues ? markdownToText(knownIssues) : "None recorded.",
  ];
  if (links.length) {
    textParts.push("", "LINKS", ...links.map((link) => `${link.label}: ${link.href}`));
  }
  if (context.upgradeCommand) {
    textParts.push("", `To upgrade: ${context.upgradeCommand}`);
  }
  textParts.push("", `You are receiving this because you are on the ${project} release list.`);
  return { subject, html, text: textParts.join("\n") };
}

// ---------------------------------------------------------------------------
// Publish detection
// ---------------------------------------------------------------------------

export type PublishOutcome =
  | { state: "published" }
  /** No network on the first look: caller falls back to sending at the tag. */
  | { state: "unavailable"; reason: string }
  /** Still not on GitHub after the timeout. */
  | { state: "timeout"; reason: string };

type Probe =
  | { state: "published" }
  | { state: "not-yet"; reason: string }
  /** GitHub answered with an error status (rate limit, outage): keep waiting. */
  | { state: "http-error"; reason: string }
  /** The request never got an answer: no network. */
  | { state: "unreachable"; reason: string };

/**
 * One public, unauthenticated look at the release. A published release is one
 * that is not a draft and has at least one asset, which is what CI uploads
 * last. A 404 means the release does not exist yet.
 */
async function probeRelease(
  repository: string,
  tag: string,
  fetchImpl: typeof fetch,
): Promise<Probe> {
  const url = `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`;
  // Only the request itself decides "no network". Anything GitHub or a proxy
  // sends back is an answer, and a non-JSON answer must not look unreachable.
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "repoos" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return {
      state: "unreachable",
      reason: `Could not reach GitHub: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (res.status === 404)
    return { state: "not-yet", reason: `GitHub has no release for ${tag} yet` };
  if (!res.ok) return { state: "http-error", reason: `GitHub answered ${res.status}` };
  let body: { draft?: unknown; assets?: unknown };
  try {
    body = (await res.json()) as { draft?: unknown; assets?: unknown };
  } catch {
    return { state: "http-error", reason: "GitHub answered with a body that is not JSON" };
  }
  if (body.draft !== true && Array.isArray(body.assets) && body.assets.length > 0) {
    return { state: "published" };
  }
  return { state: "not-yet", reason: `${tag} is on GitHub but its assets are not uploaded yet` };
}

/**
 * Wait until GitHub publishes `tag`. The first probe is immediate, so a repo
 * with no network falls back at once. Later probes back off to `maxDelayMs`
 * and stop at the timeout. An HTTP error (a rate limit, say) is not "no
 * network", so it never triggers the tag fallback, and no error after the first
 * look stops the wait, since the release may still be building.
 */
export async function waitForPublishedRelease(
  repository: string,
  tag: string,
  deps: ReleaseEmailDeps = {},
): Promise<PublishOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS;
  const maxDelayMs = deps.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const deadline = now() + timeoutMs;
  let delay = deps.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  let first = true;
  let lastReason = "";
  for (;;) {
    const probe = await probeRelease(repository, tag, fetchImpl);
    if (probe.state === "published") return { state: "published" };
    if (first && probe.state === "unreachable") {
      return { state: "unavailable", reason: probe.reason };
    }
    first = false;
    lastReason = probe.reason;
    const remaining = deadline - now();
    if (remaining <= 0) return { state: "timeout", reason: lastReason };
    await sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, maxDelayMs);
  }
}

// ---------------------------------------------------------------------------
// Record store
// ---------------------------------------------------------------------------

function logPath(config: RepoOSConfig): string {
  return join(config.root, config.cacheDir, RELEASE_EMAIL_LOG_FILE);
}

/**
 * Read the per-version email records. A malformed file throws rather than
 * reading as empty: an empty read would make an already-sent release look
 * unsent, and a cut would then mail the team twice.
 */
export function readReleaseEmailLog(config: RepoOSConfig): Record<string, ReleaseEmailRecord> {
  const path = logPath(config);
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not parse ${RELEASE_EMAIL_LOG_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${RELEASE_EMAIL_LOG_FILE} must be an object keyed by version.`);
  }
  return parsed as Record<string, ReleaseEmailRecord>;
}

/**
 * The record for `version`. A `pending` record with no waiter in this process
 * was left behind by a restart during the publish wait or mid-send. It can never finish, so
 * it reads as failed and offers Resend. The file is not rewritten here.
 */
export function getReleaseEmailRecord(
  config: RepoOSConfig,
  version: string,
): ReleaseEmailRecord | null {
  const record = readReleaseEmailLog(config)[version] ?? null;
  if (record?.status === "pending" && !inFlight.has(version)) {
    return {
      ...record,
      status: "failed",
      reason: `The server restarted before the email for ${record.tag} finished. Resend to send the rest.`,
    };
  }
  return record;
}

function writeRecord(config: RepoOSConfig, record: ReleaseEmailRecord): ReleaseEmailRecord {
  const log = readReleaseEmailLog(config);
  log[record.version] = record;
  const path = logPath(config);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(log, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  return record;
}

function recordFor(
  config: RepoOSConfig,
  entry: ReleaseHistoryEntry,
  patch: Pick<ReleaseEmailRecord, "status" | "sentTo" | "reason">,
): ReleaseEmailRecord {
  const when = config.release?.email?.when ?? "published";
  const record = writeRecord(config, {
    version: entry.version,
    tag: entry.tag,
    when,
    at: new Date().toISOString(),
    ...patch,
  });
  surfaceRecord(config, record);
  return record;
}

/**
 * Put a record on the bell: a failed send, or a skipped one caused by a missing
 * provider, needs a human. A sent record clears any earlier notice for it.
 */
function surfaceRecord(config: RepoOSConfig, record: ReleaseEmailRecord): void {
  if (record.status === "sent") {
    notifyAttentionReleaseEmailCleared(record.version);
  } else if (
    record.status === "failed" ||
    (record.status === "skipped" && !emailProviderConfigured(config))
  ) {
    notifyAttentionReleaseEmail(record);
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** The recipients who should get the release email now: configured minus already sent. */
function pendingRecipients(email: ReleaseEmailConfig, sentTo: readonly string[]): string[] {
  return (email.to ?? []).filter((address) => !sentTo.includes(address));
}

/**
 * Send to every outstanding recipient, one message each, and record the
 * outcome. Partial success is recorded as failed with the accepted addresses,
 * so Resend only retries the rest.
 */
async function sendAndRecord(
  config: RepoOSConfig,
  entry: ReleaseHistoryEntry,
  context: ReleaseEmailContext,
  deps: ReleaseEmailDeps,
  previouslySent: readonly string[],
  note?: string,
): Promise<ReleaseEmailRecord> {
  const email = config.release?.email ?? {};
  const targets = pendingRecipients(email, previouslySent);
  if (targets.length === 0) {
    return recordFor(config, entry, {
      status: "sent",
      sentTo: [...previouslySent],
      reason: "Already sent to every recipient",
    });
  }
  const message = renderReleaseEmail(config, entry, context);
  const sentTo = [...previouslySent];
  const failures: string[] = [];
  for (const to of targets) {
    const result = await sendEmail(
      config,
      { to, subject: message.subject, html: message.html, text: message.text },
      deps.fetchImpl,
    );
    if (!result.ok) {
      failures.push(`${to}: ${result.reason}`);
      continue;
    }
    sentTo.push(to);
    // Persist each accepted address before the next send. A restart after this
    // point must not mail this recipient again.
    recordFor(config, entry, {
      status: "pending",
      sentTo: [...sentTo],
      reason: `Sent to ${sentTo.length} of ${email.to?.length ?? targets.length}; sending the rest`,
    });
  }
  if (failures.length === 0) {
    return recordFor(config, entry, { status: "sent", sentTo, reason: note });
  }
  return recordFor(config, entry, {
    status: "failed",
    sentTo,
    reason: `Sent to ${sentTo.length} of ${email.to?.length ?? targets.length}. ${failures.join("; ")}`,
  });
}

/**
 * The automatic path, called once a stable cut has pushed its tag. Resolves
 * with the record it wrote (or null when nothing was decided). It never
 * rejects into the release; callers may still `.catch` for belt and braces.
 */
export async function deliverCutReleaseEmail(
  config: RepoOSConfig,
  entry: ReleaseHistoryEntry,
  context: ReleaseEmailContext = {},
  deps: ReleaseEmailDeps = {},
): Promise<ReleaseEmailRecord | null> {
  const email = config.release?.email;
  if (!email?.enabled) return null;
  if (inFlight.has(entry.version)) return null;
  inFlight.add(entry.version);
  let existing: ReleaseEmailRecord | null = null;
  try {
    existing = getReleaseEmailRecord(config, entry.version);
    if (existing?.status === "sent") return existing;
    const recipients = email.to ?? [];
    if (recipients.length === 0) {
      return recordFor(config, entry, {
        status: "skipped",
        sentTo: [],
        reason: "No recipients are set in [release.email] to.",
      });
    }
    if (isPrereleaseVersion(entry.version) && !email.includePrereleases) {
      return recordFor(config, entry, {
        status: "skipped",
        sentTo: [],
        reason: "A prerelease: not emailed. Turn on Email prereleases to send these.",
      });
    }
    if (!emailProviderConfigured(config)) {
      return recordFor(config, entry, {
        status: "skipped",
        sentTo: [],
        reason:
          "No email provider is configured. Set [auth.emailProvider] first (see Authentication).",
      });
    }
    const sentTo = existing?.sentTo ?? [];
    const repository = githubRepository(config);
    if ((email.when ?? "published") === "published" && repository) {
      recordFor(config, entry, {
        status: "pending",
        sentTo,
        reason: `Waiting for GitHub to publish ${entry.tag}`,
      });
      const outcome = await waitForPublishedRelease(repository, entry.tag, deps);
      if (outcome.state === "timeout") {
        return recordFor(config, entry, {
          status: "failed",
          sentTo,
          reason: `${entry.tag} was not on GitHub after an hour (${outcome.reason}). Resend once it is.`,
        });
      }
      if (outcome.state === "unavailable") {
        // No network: fall back to the tag, as documented. The record says so.
        return sendAndRecord(
          config,
          entry,
          context,
          deps,
          sentTo,
          `Sent at the tag: GitHub could not be checked (${outcome.reason})`,
        );
      }
    }
    return sendAndRecord(config, entry, context, deps, sentTo);
  } catch (err) {
    console.error(
      `Release email for ${entry.tag} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return recordFor(config, entry, {
      status: "failed",
      sentTo: existing?.sentTo ?? [],
      reason: err instanceof Error ? err.message : String(err),
    });
  } finally {
    inFlight.delete(entry.version);
  }
}

/** Start the automatic path after a cut without holding the release on it. */
export function startCutReleaseEmail(
  config: RepoOSConfig,
  entry: ReleaseHistoryEntry,
  context: ReleaseEmailContext = {},
  deps: ReleaseEmailDeps = {},
): void {
  void deliverCutReleaseEmail(config, entry, context, deps).catch((err) => {
    // Only reached when the record itself cannot be read or written (a corrupt
    // release-emails.json). The release is already out, so log it and raise the bell.
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Release email for ${entry.tag} could not be recorded: ${reason}`);
    notifyAttentionReleaseEmail({ version: entry.version, tag: entry.tag, reason });
  });
}

/**
 * The explicit Resend button: sends to every configured recipient who does
 * not have it yet. Ignores the prerelease toggle, since a human asked. Throws
 * with a reason the UI can show when it cannot start.
 */
export async function resendReleaseEmail(
  config: RepoOSConfig,
  version: string,
  context: ReleaseEmailContext = {},
  deps: ReleaseEmailDeps = {},
): Promise<ReleaseEmailRecord> {
  const email = config.release?.email;
  if (!email?.enabled) throw new Error("Release emails are off. Turn them on in Settings first.");
  if (!emailProviderConfigured(config)) {
    throw new Error("No email provider is configured. Set [auth.emailProvider] first.");
  }
  const entry = findHistoryEntry(config, version);
  if (!entry) throw new Error(`No release notes are recorded for version ${version}.`);
  if (inFlight.has(version)) throw new Error(`An email for ${entry.tag} is already in progress.`);
  inFlight.add(version);
  try {
    const sentTo = getReleaseEmailRecord(config, version)?.sentTo ?? [];
    return await sendAndRecord(config, entry, context, deps, sentTo);
  } finally {
    inFlight.delete(version);
  }
}

export function findHistoryEntry(
  config: RepoOSConfig,
  version: string,
): ReleaseHistoryEntry | null {
  return readReleaseHistory(config.root).releases.find((r) => r.version === version) ?? null;
}

/** The rendered message for `version`, with no send: what the preview button shows. */
export function previewReleaseEmail(
  config: RepoOSConfig,
  version: string,
  context: ReleaseEmailContext = {},
): RenderedReleaseEmail & { recipients: string[] } {
  const entry = findHistoryEntry(config, version);
  if (!entry) throw new Error(`No release notes are recorded for version ${version}.`);
  return {
    ...renderReleaseEmail(config, entry, context),
    recipients: config.release?.email?.to ?? [],
  };
}
