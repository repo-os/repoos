<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useUiStore } from "../stores/ui";
import { Bug, Check, Copy, FileClock, RotateCcw, Sparkles, X } from "lucide-vue-next";
import { copyToClipboard } from "../lib/clipboard";
import ActivityIndicator from "../components/ActivityIndicator.vue";
import Button from "../components/ui/button.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import Dialog from "../components/ui/dialog/root.vue";
import DialogClose from "../components/ui/dialog/close.vue";
import DialogContent from "../components/ui/dialog/content.vue";
import DialogDescription from "../components/ui/dialog/description.vue";
import DialogOverlay from "../components/ui/dialog/overlay.vue";
import DialogTitle from "../components/ui/dialog/title.vue";
import { api, JSON_OPTS } from "../api";
import { parseAnsi, stripAnsi } from "../lib/ansi";
import FailedTestsList from "../components/FailedTestsList.vue";
import { nextReleaseVersion } from "../releases";

interface ReleaseStatus {
  enabled: boolean;
  supported: boolean;
  name: string;
  provider: string | null;
  branch: string;
  version: string | null;
  tag: string | null;
  latestTag: string | null;
  latestTagAt: string | null;
  latestTagSha: string | null;
  /** Commits landed on the release branch since the latest tag; null if unknown. */
  commitsBehindMain: number | null;
  latestStableTag: string | null;
  head: string | null;
  clean: boolean;
  onReleaseBranch: boolean;
  tagExists: boolean;
  released: boolean;
  ready: boolean;
  blockers: string[];
  releaseUrl: string | null;
  workflowUrl: string | null;
}

type ReleasePhase =
  | "preparing"
  | "committing"
  | "building"
  | "checking"
  | "pushing_main"
  | "tagging"
  | "pushing_tag";

interface ReleaseRun {
  state: "idle" | "running" | "succeeded" | "failed";
  phase: ReleasePhase | null;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  failedTests?: string[];
  tldr?: string | null;
  tldrPending?: boolean;
}

/** One configured `[[distribution]]` destination and its live version state. */
interface DistributionChannel {
  name: string;
  kind: string | null;
  url: string | null;
  install: string[];
  version: string | null;
  state: "matching" | "out-of-sync" | "unverified" | "unavailable" | "failed";
  detail: string | null;
}

interface DistributionSummary {
  ciFailure?: { runUrl: string; failedStep: string | null; jobName: string | null } | null;
  releaseVersion: string | null;
  releaseTag: string | null;
  channels: DistributionChannel[];
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

const status = ref<ReleaseStatus | null>(null);
const loading = ref(true);
/** Page-level failure fetching `/api/release` — separate from run failures so
 *  a status refresh can never clear a promoted run-failure banner (#0622). */
const loadError = ref("");
const running = ref(false);
const ui = useUiStore();
const confirmOpen = ref(false);
/**
 * The version being typed survives a page/app reload (the panel itself already
 * keeps it across close/reopen, #0621). Cleared once a cut succeeds.
 */
const VERSION_STORAGE_KEY = "repoos.release.newVersion";
function readStoredVersion(): string {
  try {
    return localStorage.getItem(VERSION_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
const newVersion = ref(readStoredVersion());
watch(newVersion, (value) => {
  try {
    if (value) localStorage.setItem(VERSION_STORAGE_KEY, value);
    else localStorage.removeItem(VERSION_STORAGE_KEY);
  } catch {
    // Storage unavailable: the field simply won't survive a reload.
  }
});
const message = ref("");
const error = ref("");
/** Optional release notes; empty means the cut ships with none (the default). */
const notes = ref("");
const generatingNotes = ref(false);
const notesError = ref("");
/** Short hint that a generate returned saved notes instead of a fresh draft. */
const notesHint = ref("");
/** Full command output from a failed release phase (repoos check log, build errors). */
const runLog = ref("");
const debuggerSending = ref(false);
const debuggerSent = ref(false);
const debuggerErr = ref("");
const run = ref<ReleaseRun | null>(null);
const now = ref(Date.now());

/**
 * Server-tracked AI-draft run (#0605): the generate button starts the run and
 * the view polls `GET /api/release/notes/run` while it's in flight, so
 * closing the modal mid-draft no longer loses the result and a second click
 * can't spawn a duplicate agent run.
 */
interface ReleaseNotesRun {
  state: "idle" | "running" | "succeeded" | "failed";
  startedAt: string | null;
  updatedAt: string | null;
  error: string | null;
  key: string | null;
  /** HEAD snapshot from when the run started; staleness follows the cache key. */
  head?: string | null;
  notes: string | null;
  sinceTag: string | null;
  commitCount: number;
  truncated: boolean;
  /** Server-computed: this terminal run describes an older commit context (#0630). */
  stale?: boolean;
}

/**
 * The newest AI draft that was generated but never pushed with a release
 * (#0641). Rendered as a card below the notes field so an operator can decide
 * whether to reuse it for a retry after a failed cut.
 */
interface UnpushedReleaseNotes {
  notes: string;
  createdAt: string;
  head: string;
  headShort: string;
  sinceTag: string | null;
  commitsBehind: number | null;
  commits: string[];
  currentHead: string | null;
  currentHeadShort: string | null;
}
const notesRun = ref<ReleaseNotesRun | null>(null);
/**
 * The newest AI draft that was generated but never pushed with a release
 * (#0641). Shown as a card below the notes field so an operator can decide
 * whether to reuse it for a retry after a failed cut.
 */
const unpushedNotes = ref<UnpushedReleaseNotes | null>(null);
/**
 * A pending replace-notes confirmation, or null. Generate and "Use these
 * notes" both can discard operator text, so each asks through the shared
 * designed dialog rather than a native `confirm()` (AGENTS.md).
 */
const pendingNotesReplace = ref<"generate" | "use-saved" | null>(null);
const notesReplaceTitle = computed(() =>
  pendingNotesReplace.value === "use-saved"
    ? "Replace notes with the saved draft?"
    : "Replace notes with an AI draft?",
);
const notesReplaceDesc = computed(() =>
  pendingNotesReplace.value === "use-saved"
    ? "The saved draft from the last generate replaces what you've typed in the release notes field."
    : "The AI draft replaces what you've typed in the release notes field. You can edit it afterwards.",
);
/**
 * The draft run this page session owns: set while a run is observed running
 * (live or via reopening during one). Only runs this session watched may
 * backfill the notes field — a stale succeeded run from before the page even
 * loaded must never silently fill fresh typing context.
 */
const observedNotesKey = ref<string | null>(null);
/** The run that already placed a draft — blocks duplicate fills per poll tick. */
const placedNotesKey = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;
/**
 * Poll sequence numbers: each issued poll increments its counter, and a
 * response may only be applied while it is still the most recent request.
 * A slow earlier request must never overwrite newer state — e.g. re-showing
 * a failure after a newer poll already applied a success (#0622).
 */
let runPollSeq = 0;
/**
 * True while the release POST is awaiting its response. A poll answered in
 * that window can only carry the PREVIOUS run's terminal snapshot (the new run
 * is not created yet), and `runPollSeq` can't undo a response that is already
 * applied — so `pollRun` ignores terminal snapshots while this is set (#0622).
 */
let releasePosting = false;
let notesPollSeq = 0;
/** Orders distribution lookups: only the latest one may apply or settle loading. */
let distributionSeq = 0;

/** "Published to" destinations for the release being viewed (empty when none). */
const distribution = ref<DistributionChannel[]>([]);
const distributionReleaseVersion = ref<string | null>(null);
const distributionLoading = ref(false);
const distributionCiFailure = ref<DistributionSummary["ciFailure"]>(null);
const copiedCommand = ref("");
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const distributionSync = computed(() => {
  if (!distribution.value.length) return null;
  if (distribution.value.every((channel) => channel.state === "matching")) {
    return { state: "matching", label: "All distribution destinations in sync" };
  }
  return { state: "attention", label: "Some distribution destinations need attention" };
});

function stopPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

/**
 * One shared 1s tick for both tracked runs (release cut and notes draft).
 * It keeps ticking while either run is in flight; otherwise it stops the
 * loop — the same single-shot-after-mount behavior the release run had
 * before the notes run joined the tick.
 */
function tickStopIfNeeded(): void {
  if (run.value?.state === "running" || notesRun.value?.state === "running") return;
  // The Debugger's tl;dr lands after the failure does — keep polling for it.
  if (run.value?.state === "failed" && run.value.tldrPending) return;
  if (generatingNotes.value) return; // a POST may be in flight — don't drop polling
  stopPolling();
}

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    now.value = Date.now();
    void pollRun();
    void pollNotesRun();
  }, 1000);
}

/** "v" or whatever prefix the configured tag uses, derived from tag vs version. */
const tagPrefix = computed(() => {
  const tag = status.value?.tag;
  const version = status.value?.version;
  return tag && version && tag.endsWith(version) ? tag.slice(0, -version.length) : "v";
});

/** The version already shipped (tag exists for the current manifest version). */
const publishedVersion = computed(() =>
  status.value?.released ? (status.value.version ?? null) : null,
);
const publishedTag = computed(() =>
  publishedVersion.value
    ? `${tagPrefix.value}${publishedVersion.value}`
    : (status.value?.latestTag ?? null),
);
/** A semver "-" introduces a prerelease identifier (beta/canary/rc/...). */
const isPrerelease = computed(() => !!publishedTag.value?.includes("-"));
/** Only worth a separate line when the shown tag IS a prerelease and there's a different stable one to point at. */
const lastStableTag = computed(() =>
  isPrerelease.value && status.value?.latestStableTag !== publishedTag.value
    ? (status.value?.latestStableTag ?? null)
    : null,
);

/**
 * How far the running code is ahead of the latest release, in commits — the
 * number a human needs to judge whether cutting again is worthwhile. Null when
 * there's no tag yet or git couldn't read the range.
 */
const commitsBehindMain = computed(() => status.value?.commitsBehindMain ?? null);
/** "12 commits behind main" / "1 commit behind main", or "" when unknown. */
const commitsBehindLabel = computed(() => {
  const n = commitsBehindMain.value;
  if (n === null) return "";
  return `${n} ${n === 1 ? "commit" : "commits"} behind ${status.value?.branch ?? "main"}`;
});
/**
 * Secondary line under the freshness pills: names where the shown tag points
 * from, without repeating the branch (that is already in `rel-context`).
 */
const shippedMeta = computed(() => {
  const s = status.value;
  if (!s) return "";
  const verb = s.released ? "shipped" : "last tag";
  return s.latestTagSha ? `${verb} from ${s.latestTagSha}` : verb;
});
/** Freshness tone for the age/behind pill: fresh, aging, or stale. */
const releaseFreshness = computed<"fresh" | "aging" | "stale">(() => {
  const n = commitsBehindMain.value ?? 0;
  if (n === 0) return "fresh";
  return n < 25 ? "aging" : "stale";
});

/** A manifest version bumped but not yet tagged — ready to cut as-is. */
const pendingVersion = computed(() =>
  status.value && !status.value.released && status.value.tag && !status.value.tagExists
    ? status.value.version
    : null,
);

const suggestedVersion = computed(
  () => pendingVersion.value ?? nextReleaseVersion(status.value?.version ?? null),
);
const suggestedTag = computed(() =>
  suggestedVersion.value ? `${tagPrefix.value}${suggestedVersion.value}` : null,
);

const newTag = computed(() => (newVersion.value ? `${tagPrefix.value}${newVersion.value}` : ""));
/** The version being typed carries a prerelease identifier (-beta.N / -canary.N / -rc.N / …). */
const newIsPrerelease = computed(() => newVersion.value.includes("-"));
const newVersionValid = computed(
  () =>
    SEMVER.test(newVersion.value) &&
    newVersion.value !== publishedVersion.value &&
    newTag.value !== status.value?.latestTag,
);

const blockers = computed(() => {
  // The manifest-version-already-tagged "blocker" is the normal resting state
  // right after a release — it's not something to fix, so don't alarm on it.
  const raw = status.value?.blockers ?? [];
  return status.value?.released ? raw.filter((b) => !/ already exists\.$/.test(b)) : raw;
});

type Phase = "releasing" | "blocked" | "prerelease" | "published" | "ready";
const phase = computed<Phase>(() => {
  if (running.value) return "releasing";
  if (blockers.value.length) return "blocked";
  if (status.value?.released) return isPrerelease.value ? "prerelease" : "published";
  return "ready";
});
const phaseLabel = computed(
  () =>
    ({
      releasing: "Releasing…",
      blocked: "Blocked",
      prerelease: "Prerelease",
      published: "Published",
      ready: "Ready",
    })[phase.value],
);

// Mid-cut this must stay true (#0621): closing the panel is safe now, so the
// button doubles as the way back in — it relabels to "View progress" while a
// run is in flight.
const canOpen = computed(
  () => !!status.value?.supported && status.value.clean && status.value.onReleaseBranch,
);

/** Wall-clock of the last completed run, from the route's run timestamps. */
const lastRunDuration = computed(() => {
  const r = run.value;
  if (!r?.startedAt || !r.updatedAt || r.state === "idle" || r.state === "running") return "";
  return formatSpan(new Date(r.updatedAt).getTime() - new Date(r.startedAt).getTime());
});

function formatSpan(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = now.value - new Date(iso).getTime();
  if (diff < 0 || Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    status.value = await api<ReleaseStatus>("/api/release");
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

/**
 * Load the distribution summary separately from the release status. Its
 * lookups can be slow or fail, and neither must affect the page, so a failure
 * simply hides the section.
 */
async function loadDistribution(): Promise<void> {
  // A release landing while the mount-time lookup is still in flight starts a
  // second lookup; the older response must not overwrite the newer one or
  // clear the loading indicator while the newer lookup is still pending.
  const seq = ++distributionSeq;
  distributionLoading.value = true;
  try {
    const data = await api<DistributionSummary>("/api/release/distribution");
    if (seq !== distributionSeq) return;
    distribution.value = data.channels ?? [];
    distributionReleaseVersion.value = data.releaseVersion ?? null;
    distributionCiFailure.value = data.ciFailure ?? null;
  } catch {
    if (seq !== distributionSeq) return;
    distribution.value = [];
    distributionReleaseVersion.value = null;
    distributionCiFailure.value = null;
  } finally {
    if (seq === distributionSeq) distributionLoading.value = false;
  }
}

const CHANNEL_STATE_LABELS: Record<DistributionChannel["state"], string> = {
  matching: "Up to date",
  "out-of-sync": "Out of sync",
  unverified: "Unverified",
  unavailable: "Not published yet",
  failed: "Check failed",
};

function channelStateLabel(channel: DistributionChannel): string {
  return CHANNEL_STATE_LABELS[channel.state] ?? "Unverified";
}

/** A one-line, honest status for a channel — never claims a version it can't confirm. */
function channelSummary(channel: DistributionChannel): string {
  switch (channel.state) {
    case "matching":
      return channel.version ? `${channel.version} · matches this release` : "Matches this release";
    case "out-of-sync":
      return channel.version
        ? `${channel.version} · release is ${distributionReleaseVersion.value ?? "different"}`
        : "Out of sync with this release";
    case "unavailable":
      return channel.detail ?? "No version published on this channel yet";
    case "failed":
      return channel.detail ?? "The registry couldn't be reached";
    default:
      return channel.version
        ? `${channel.version} · not compared to a release`
        : "No automatic version check for this channel";
  }
}

/** Derive a short tab label from the command itself (npm, bun, curl, …). */
function installLabel(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

async function copyCommand(command: string): Promise<void> {
  if (!(await copyToClipboard(command))) return;
  copiedCommand.value = command;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copiedCommand.value = ""), 1600);
}

/**
 * Open the cut-a-release panel. Closing the panel is never a reset (#0621):
 * version, notes, run log, errors and run tracking all live at the view level
 * and survive close/reopen, so an operator can step away mid-cut or mid-draft
 * and come back to the same state. A freshly opened panel re-syncs both
 * server-tracked runs immediately (an in-flight draft or cut is picked up
 * where it stands), and the form is only cleared once a cut succeeds (see the
 * success path in `pollRun`) so the *next* cut starts from a clean form.
 */
function openConfirm(): void {
  generatingNotes.value = notesRun.value?.state === "running";
  confirmOpen.value = true;
  void syncNotesRunAtOpen();
  void fillSavedNotes();
  void loadUnpushedNotes();
  void pollRun();
}

/**
 * Load the newest generated-but-unreleased draft, if any. Best effort: an
 * absent card must never block the cut panel, so a failure leaves it hidden.
 */
async function loadUnpushedNotes(): Promise<void> {
  try {
    const data = await api<UnpushedReleaseNotes | null>("/api/release/notes/unpushed");
    unpushedNotes.value = data && data.notes?.trim() ? data : null;
  } catch {
    // Best effort only.
  }
}

/**
 * The card duplicates the editor once its text is already there (for example
 * when the cache lookup auto-filled the draft for the current commits), so
 * hide it in that case rather than showing the same notes twice.
 */
const showUnpushedCard = computed(() => {
  const saved = unpushedNotes.value;
  if (!saved?.notes.trim() || running.value) return false;
  return notes.value.trim() !== saved.notes.trim();
});

/**
 * Drop the saved draft into the editor for a retry. Only asks before
 * discarding text the operator actually typed; placing an identical draft is
 * a no-op.
 */
function useUnpushedNotes(): void {
  const saved = unpushedNotes.value;
  if (!saved) return;
  if (notes.value.trim() && notes.value.trim() !== saved.notes.trim()) {
    pendingNotesReplace.value = "use-saved";
    return;
  }
  applyUnpushedNotes(saved);
}

/** Place the saved draft in the editor and say where it came from. */
function applyUnpushedNotes(saved: UnpushedReleaseNotes): void {
  notes.value = saved.notes;
  notesError.value = "";
  notesHint.value = `Reused the saved draft from ${relativeTime(saved.createdAt) || "earlier"}.`;
}

/** Run the confirmed replace, then close the dialog. */
function confirmNotesReplace(): void {
  const action = pendingNotesReplace.value;
  pendingNotesReplace.value = null;
  if (action === "use-saved") {
    const saved = unpushedNotes.value;
    if (saved) applyUnpushedNotes(saved);
  } else if (action === "generate") {
    void runGenerateNotes();
  }
}

/**
 * On open, drop an already-saved AI draft for the current commits into an
 * empty notes field — no agent run, no click. Never overwrites typing, and a
 * miss or error is silent (the Generate button still works as before).
 */
async function fillSavedNotes(): Promise<void> {
  if (notes.value.trim() || generatingNotes.value || running.value) return;
  try {
    const result = await api<{
      notes?: string | null;
      cached?: boolean;
      cachedAt?: string | null;
      run?: unknown;
    }>("/api/release/notes", JSON_OPTS("POST", { cachedOnly: true }));
    if (result.run || !result.cached || !result.notes?.trim()) return;
    if (notes.value.trim()) return; // typed while the lookup was in flight
    notes.value = result.notes;
    const age = result.cachedAt ? relativeTime(result.cachedAt) : "";
    notesHint.value = `Reused saved notes${age ? ` (${age})` : ""} — no new AI run.`;
  } catch {
    // Best effort only.
  }
}

/**
 * First notes-run sync for a freshly opened modal: picks up a draft already
 * in flight ("Drafting…" on reopen, #0605) and keeps polling until it
 * lands, or, when this page session watched the run, backfills the finished
 * draft or surfaces its failure.
 */
async function syncNotesRunAtOpen(): Promise<void> {
  // Same ordering scheme as pollNotesRun: an open sync is one more request
  // in the same sequence, so a slow response can never overwrite newer poll
  // state — e.g. re-showing a terminal snapshot after a poll already applied
  // `running` (which would also let tickStopIfNeeded drop the poll loop)
  // — #0630 review.
  const seq = ++notesPollSeq;
  try {
    const latest = await api<ReleaseNotesRun>("/api/release/notes/run");
    if (seq !== notesPollSeq) return;
    // `atOpen`: the operator is looking at the notes field right now, so a
    // run that finished while the panel was closed must still be visible —
    // its failure surfaces as an error, its draft as a ready-to-reuse hint
    // (the text itself only lands via the cache lookup, #0630).
    applyNotesRun(latest, true);
  } catch {
    // Keep whatever was set optimistically; the next poll corrects it.
  }
}

/**
 * Apply a notes-run snapshot: drive the draft-in-progress flags, and on a
 * terminal state watched by this session place (or offer) the draft.
 */
function applyNotesRun(next: ReleaseNotesRun, atOpen = false): void {
  const prev = notesRun.value;
  notesRun.value = next;
  if (next.state === "running") {
    if (next.key) observedNotesKey.value = next.key;
    generatingNotes.value = true;
    notesError.value = "";
    notesHint.value = "";
    startPolling();
    return;
  }
  generatingNotes.value = false;
  // A terminal run may have written (or retired) a cache entry, so the
  // unpushed card must track the newest one — otherwise a fresh draft B would
  // leave the card showing the older draft A. Refresh on the transition (#0641).
  void loadUnpushedNotes();
  const live = prev?.state === "running";
  const owned =
    !!next.key && next.key === observedNotesKey.value && next.key !== placedNotesKey.value;
  if (next.state === "succeeded" && next.notes?.trim() && (live || owned)) {
    placedNotesKey.value = next.key;
    if (!notes.value.trim()) {
      notes.value = next.notes;
    } else {
      // The operator typed while the draft ran — never drop it silently.
      notesHint.value = "Your AI draft is ready — Generate with AI will replace what you've typed.";
    }
  } else if (next.state === "failed" && (live || owned || (atOpen && !next.stale))) {
    // Watched runs surface their failure on the transition; an un-watched one
    // only at open, and only while it still describes the current commits —
    // the server keeps its last terminal run forever, so a stale failure is
    // about a draft context that no longer exists (#0630 review).
    notesError.value = next.error || "The agent returned no release notes.";
  } else if (
    atOpen &&
    next.state === "succeeded" &&
    next.notes?.trim() &&
    !next.stale &&
    !notes.value.trim()
  ) {
    // A draft that finished while the panel was closed (or before this page
    // loaded): don't drop text into the field — a run this session never
    // watched must not silently fill fresh typing context (#0605) — but say
    // it's ready, so the reopen never reads as a silent empty form (#0630).
    notesHint.value = "An AI draft finished while you were away — Generate with AI will reuse it.";
  } else if (atOpen && next.stale && (next.state === "succeeded" || next.state === "failed")) {
    // The run predates the current commits: neither "ready" nor its failure
    // applies. Name the real situation instead of promising reuse (#0630 review).
    notesHint.value =
      "Your last AI draft is out of date for the current commits — Generate with AI will draft fresh.";
  }
  tickStopIfNeeded();
}

async function pollNotesRun(): Promise<void> {
  // Same ordering guard as pollRun: drop superseded responses.
  const seq = ++notesPollSeq;
  try {
    const latest = await api<ReleaseNotesRun>("/api/release/notes/run");
    if (seq !== notesPollSeq) return;
    applyNotesRun(latest);
  } catch {
    // Keep the current state visible through a short server hiccup.
  }
}

/**
 * Stop tracking a notes draft whose cut consumed it: once a release is
 * started, the field's notes belong to that cut, and re-opening the modal
 * afterwards must not backfill the same draft for the *next* cut — the range
 * the notes describe has already shipped.
 */
function dropNotesRun(): void {
  observedNotesKey.value = null;
  placedNotesKey.value = null;
  notesRun.value = null;
}

/**
 * The shortcut path: apply the suggested next version without typing it. The
 * field stays the single source of truth afterwards, so Publish, the tag
 * preview and every validation rule behave exactly as if it had been typed —
 * and a custom semver typed later simply replaces it.
 */
function cutNext(): void {
  if (!suggestedVersion.value || running.value) return;
  newVersion.value = suggestedVersion.value;
}

/**
 * Start an AI draft of the notes from the commits since the last release.
 * Never cuts a release. The server runs the draft detached (#0605): the POST
 * returns the run state immediately, and the poll machinery above fills the
 * field the moment the run succeeds — a failure surfaces in `notesError`
 * with whatever the operator typed untouched. When the server already holds
 * a draft for this exact commit context it answers synchronously with the
 * stored text and `cached` marks it, so a retry after a failed cut doesn't
 * wait on the agent again. Generation replaces the field, so confirm first
 * when that would discard something the operator typed.
 */
async function generateNotes(): Promise<void> {
  if (generatingNotes.value || running.value) return;
  if (notes.value.trim()) {
    pendingNotesReplace.value = "generate";
    return;
  }
  await runGenerateNotes();
}

/** The actual draft request, once any replace confirmation has been settled. */
async function runGenerateNotes(): Promise<void> {
  if (generatingNotes.value || running.value) return;
  generatingNotes.value = true;
  notesError.value = "";
  notesHint.value = "";
  startPolling(); // the POST answers in milliseconds; keep the tick alive meanwhile
  try {
    const result = await api<{
      run?: ReleaseNotesRun;
      notes?: string | null;
      sinceTag?: string | null;
      commitCount?: number;
      cached?: boolean;
      cachedAt?: string | null;
    }>(
      "/api/release/notes",
      JSON_OPTS("POST", { version: newVersion.value || suggestedVersion.value || undefined }),
    );
    if (result.run) {
      // 202: the run is tracked server-side now — fill the field when it
      // lands (the poll was started above and `applyNotesRun` re-arms it).
      applyNotesRun(result.run);
      return;
    }
    if (result.notes && result.notes.trim()) {
      notes.value = result.notes;
      if (result.cached) {
        const age = result.cachedAt ? relativeTime(result.cachedAt) : "";
        notesHint.value = `Reused saved notes${age ? ` (${age})` : ""} — no new AI run.`;
      }
      void loadUnpushedNotes();
    } else if (result.run === undefined) {
      notesError.value = result.sinceTag
        ? `No commits since ${result.sinceTag} to draft from.`
        : "No commits to draft from.";
    }
  } catch (err) {
    notesError.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (notesRun.value?.state !== "running") {
      generatingNotes.value = false;
      tickStopIfNeeded();
    }
  }
}

async function release(): Promise<void> {
  if (!canOpen.value || !newVersionValid.value || running.value || generatingNotes.value) return;
  running.value = true;
  // A prior failure stays promoted while the retry runs — it is replaced by
  // a new failure or cleared by success in pollRun (#0622). Under #0621 the
  // drawer shows the still-unresolved failure inline as well.
  notesError.value = "";
  // Whatever draft this session produced is now the cut's payload — stop
  // tracking the run so re-opening the modal can't backfill it again (#0605).
  dropNotesRun();
  debuggerSent.value = false;
  debuggerErr.value = "";
  // Invalidate every poll already in flight for the previous run. A stale
  // pre-retry response landing after this POST accepts would otherwise
  // overwrite the new running state with the prior terminal run, clear the
  // releasing flag, and stop the poll loop before this attempt's own outcome
  // is ever observed (review finding on #0622).
  runPollSeq++;
  releasePosting = true;
  try {
    const result = await api<{ run: ReleaseRun }>(
      "/api/release",
      JSON_OPTS("POST", {
        version: newVersion.value,
        confirmTag: newTag.value,
        notes: notes.value.trim() || undefined,
      }),
    );
    releasePosting = false;
    run.value = result.run;
    // Re-assert the releasing flag (kept only when the returned run is still
    // in flight) and drop polls issued while the POST was in flight — they
    // raced the run's creation server-side and may carry the previous run's
    // snapshot. Polls issued after this point see the new run.
    running.value = result.run.state === "running";
    runPollSeq++;
    startPolling();
  } catch (err) {
    releasePosting = false;
    // The attempt died before a run was created (e.g. the push was rejected):
    // surface this error and drop the previous run's log, which describes an
    // earlier failure, not this one. `load()` no longer touches run errors.
    error.value = err instanceof Error ? err.message : String(err);
    runLog.value = "";
    await load();
  } finally {
    releasePosting = false;
    if (run.value?.state !== "running") running.value = false;
  }
}

/**
 * Turn a failed `repoos check` / build log into a one-line headline that names
 * the likely cause, so the operator doesn't have to scan the raw output to know
 * whether it's worth a retry or a real regression.
 */
function failureSummary(phaseName: string | null, msg: string): string {
  const where = phaseName ? `during ${phaseName.replace(/_/g, " ")}` : "during the run";
  if (/Test timed out in \d+\s*ms/i.test(msg))
    return `Release failed ${where} — a test timed out. This is usually the known check-gate flake under memory pressure, not a regression; try cutting again before sending it to the Debugger.`;
  if (/\bFAIL\b|\b\d+ failed\b/.test(msg))
    return `Release failed ${where} — one or more tests failed. See output below.`;
  if (/error TS\d+|\bType error\b|\btsc:/i.test(msg))
    return `Release failed ${where} — TypeScript did not compile. See output below.`;
  if (/build is stale|staleness|dist .*out of date/i.test(msg))
    return `Release failed ${where} — the build is stale. See output below.`;
  return `Release failed ${where} — see output below.`;
}

async function pollRun(): Promise<void> {
  const seq = ++runPollSeq;
  let prev: ReleaseRun | null = null;
  try {
    prev = run.value;
    const latest = await api<ReleaseRun>("/api/release/run");
    // Superseded: a newer poll was issued while this one was in flight, and
    // its response (already applied or still coming) is the newer truth.
    if (seq !== runPollSeq) return;
    // A terminal snapshot while our own release POST is pending is the
    // previous run's: applying it would flip `running` off and let Publish
    // (and the poll loop) stop before this attempt even exists (#0622).
    if (releasePosting && latest.state !== "running") return;
    const wasRunning = prev?.state === "running";
    run.value = latest;
    if (latest.state === "running") {
      // Sync from the server, not just from this session's own POST (#0621):
      // a run started elsewhere (or before a reopen) must show as live too.
      running.value = true;
      return;
    }
    running.value = false;
    // The Debugger's tl;dr lands after the failure does — keep polling for it.
    if (latest.state === "failed" && latest.tldrPending) startPolling();
    // Apply the outcome once — on the first observation (a finished run from
    // before this page load owns the "survives until the next one" banner), on
    // a watched running→terminal transition, or when the terminal run is a
    // different one than we last saw (another client's whole run fit between
    // two polls, so we never observed it running) — not on every tick.
    const newTerminalRun = prev !== null && prev.startedAt !== latest.startedAt;
    if (prev === null || wasRunning || newTerminalRun) {
      if (latest.state === "succeeded") {
        message.value = latest.message;
        confirmOpen.value = false;
        dropNotesRun();
        // The cut shipped — clear the form and the promoted failure so the
        // next open starts fresh. This is the one reset: closing the panel
        // mid-run never clears it.
        newVersion.value = "";
        notes.value = "";
        error.value = "";
        runLog.value = "";
        notesError.value = "";
        notesHint.value = "";
        debuggerSent.value = false;
        debuggerErr.value = "";
        await Promise.all([load(), loadDistribution()]);
      } else if (latest.state === "failed" && latest.message) {
        // A failed phase reports its full command output (repoos check log, build
        // errors). Classify the common causes into the headline, then show the
        // full log in a scrollable block.
        const lines = latest.message.split("\n").filter((l) => l.trim());
        error.value =
          lines.length > 1 ? failureSummary(latest.phase, latest.message) : latest.message;
        runLog.value = lines.length > 1 ? stripAnsi(latest.message) : "";
      }
      // A terminal cut changes what is "unpushed": success retires the draft,
      // failure promotes the freshly generated one. Refresh the card (#0641).
      void loadUnpushedNotes();
    }
  } catch {
    // Keep the existing stage visible through a short server reload.
  }
  tickStopIfNeeded();
}

/**
 * Hand the failed release run to the Debugger agent with enough context to
 * investigate without re-deriving it (phase, target tag, current commit, and
 * the full check/build output), then open the Debugger chat. Mirrors the
 * move-to-done "Fix" handoff in DoneErrorCard.vue.
 */
async function sendToDebugger(): Promise<void> {
  if (debuggerSending.value) return;
  debuggerSending.value = true;
  debuggerErr.value = "";
  try {
    const detail = runLog.value || run.value?.message || error.value;
    await api(
      "/api/debugger/message",
      JSON_OPTS("POST", {
        text: [
          `The "Cut a release" flow failed for version ${newVersion.value || status.value?.version || "?"} (tag ${newTag.value || suggestedTag.value || "?"}).`,
          `Phase: ${run.value?.phase ?? "unknown"}.`,
          `Current commit: ${status.value?.head ?? "unknown"} on ${status.value?.branch ?? "main"}.`,
          `Output:\n${detail}`,
          "Identify the concrete cause and the smallest safe repair so the release can be retried.",
        ].join("\n"),
      }),
    );
    debuggerSent.value = true;
    window.dispatchEvent(new CustomEvent("repoos:open-debugger"));
  } catch (err) {
    debuggerErr.value =
      err instanceof Error && /disabled/i.test(err.message)
        ? "Enable the Debugger on the Agents page to send it this failure."
        : err instanceof Error
          ? err.message
          : String(err);
  } finally {
    debuggerSending.value = false;
  }
}

/** Live elapsed time while a release runs. */
const PHASE_STEPS: { phase: ReleasePhase; label: string }[] = [
  { phase: "preparing", label: "Preparing the release" },
  { phase: "committing", label: "Committing the version bump" },
  { phase: "building", label: "Building" },
  { phase: "checking", label: "Running checks" },
  { phase: "pushing_main", label: "Pushing main" },
  { phase: "tagging", label: "Creating the tag" },
  { phase: "pushing_tag", label: "Pushing the tag" },
];

/** "Step 4 of 7 · Running checks" for the live run's current phase. */
const phaseHeading = computed(() => {
  const idx = PHASE_STEPS.findIndex((p) => p.phase === run.value?.phase);
  if (idx < 0) return "Release in progress";
  return `Step ${idx + 1} of ${PHASE_STEPS.length} · ${PHASE_STEPS[idx].label}`;
});

/** Latest streamed output, ANSI colors parsed, trimmed to its recent tail. */
const progressOutput = computed(() => {
  const raw = run.value?.message ?? "";
  const tail = raw.trimEnd().split("\n").slice(-9).join("\n");
  return parseAnsi(tail.trimEnd());
});

function elapsed(): string {
  if (!run.value?.startedAt) return "";
  return `${formatSpan(now.value - new Date(run.value.startedAt).getTime())} elapsed`;
}

onMounted(() => {
  // Deep link for shots/docs (`/releases?drawer=cut`): opens the panel without
  // a click. It is view-only on a dirty tree or off the release branch — the
  // publish button and release() are still gated on `canOpen`.
  if (new URLSearchParams(window.location.search).get("drawer") === "cut") confirmOpen.value = true;
  void load();
  void loadDistribution();
  void pollRun();
  void pollNotesRun();
  startPolling();
});
onBeforeUnmount(() => {
  stopPolling();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <div class="releases-page">
    <header class="rel-head">
      <div>
        <h1 class="rel-title">Releases</h1>
        <p class="rel-sub">Cut and track tagged releases of this repository.</p>
      </div>
      <div class="rel-actions rel-head-actions">
        <a
          class="rel-link"
          href="https://docs.repoos.org/deployments-and-releases"
          target="_blank"
          rel="noreferrer"
          >Release guide ↗</a
        >
        <a class="rel-link" href="/settings?tab=toml">Edit release config</a>
        <Button variant="ghost" size="sm" :disabled="loading" @click="load">Refresh</Button>
      </div>
    </header>

    <div v-if="loading" class="spin"></div>
    <p v-else-if="loadError && !status" class="rel-error">{{ loadError }}</p>

    <template v-else-if="status">
      <div v-if="!status.enabled" class="rel-card rel-empty">
        Releases aren't configured for this repository. Add a <code>[release]</code> block in
        <a class="rel-link" href="/settings?tab=toml">repoos.toml</a> to turn this page on.
      </div>

      <template v-else>
        <section class="rel-card">
          <div class="rel-card-head">
            <div>
              <div class="rel-provider-name">{{ status.name }}</div>
              <div class="rel-provider-meta">{{ status.provider }} · {{ status.branch }}</div>
            </div>
            <span class="rel-pill" :data-phase="phase">{{ phaseLabel }}</span>
          </div>

          <div class="rel-current-release">
            <div class="rel-current-version">
              <span class="rel-current-label">Current release</span>
              <span class="rel-current-number">{{ publishedTag ?? "Not released yet" }}</span>
              <template v-if="status.latestTag">
                <span class="rel-fresh-line">
                  <span class="rel-fresh" :data-state="releaseFreshness">
                    {{ isPrerelease ? "cut" : "released" }}
                    {{ relativeTime(status.latestTagAt) || "—" }}
                  </span>
                  <span v-if="commitsBehindLabel" class="rel-behind" :data-state="releaseFreshness">
                    {{ commitsBehindLabel }}
                  </span>
                </span>
                <span class="rel-current-meta">{{ shippedMeta }}</span>
              </template>
              <span v-if="lastStableTag" class="rel-current-meta">
                last stable · <code>{{ lastStableTag }}</code>
              </span>
            </div>
            <span
              v-if="distributionSync"
              class="rel-current-sync"
              :data-state="distributionSync.state"
              >{{ distributionSync.label }}</span
            >
          </div>

          <div class="rel-context">
            <template v-if="status.head">
              from <code>{{ status.head }}</code> on <code>{{ status.branch }}</code>
            </template>
          </div>

          <div v-if="blockers.length" class="rel-blockers" role="status">
            <div v-for="b in blockers" :key="b">{{ b }}</div>
          </div>

          <div class="rel-next-release">
            <div>
              <span class="rel-next-label">Next release</span>
              <strong>{{ suggestedTag ?? "—" }}</strong>
              <span class="rel-next-hint">{{
                pendingVersion ? "ready to cut" : "suggested when ready"
              }}</span>
            </div>
            <div class="rel-actions rel-next-actions">
              <Button
                variant="accent"
                data-test-id="cut-release-open"
                :disabled="!canOpen"
                @click="openConfirm"
              >
                {{
                  running
                    ? "View progress"
                    : suggestedVersion
                      ? "Cut next release"
                      : "Cut a release"
                }}
              </Button>
              <a
                v-if="status.workflowUrl"
                class="rel-link"
                :href="status.workflowUrl"
                target="_blank"
                rel="noreferrer"
                >CI workflow ↗</a
              >
              <a
                v-if="status.releaseUrl"
                class="rel-link"
                :href="status.releaseUrl"
                target="_blank"
                rel="noreferrer"
                >GitHub release ↗</a
              >
            </div>
          </div>
        </section>

        <!-- Outcome of the most recent successful run (survives until the next
             one); shown above "Published to" so the current state is visible without scrolling, like a failure. -->
        <section v-if="message && !error" class="rel-outcome rel-outcome--ok" aria-live="polite">
          <div class="rel-outcome-line">
            <strong>{{ message }}</strong>
            <span v-if="lastRunDuration" class="rel-outcome-span">took {{ lastRunDuration }}</span>
          </div>
          <a
            v-if="status.workflowUrl"
            class="rel-link"
            :href="status.workflowUrl"
            target="_blank"
            rel="noreferrer"
            >Watch the build ↗</a
          >
        </section>

        <!-- Most recent run failed: shown ABOVE "Published to" until the next
             successful release, so a failure is visible without scrolling. -->
        <section v-if="error && !confirmOpen" class="rel-outcome rel-outcome--fail" role="alert">
          <strong>{{ error }}</strong>
          <div v-if="run?.state === 'failed' && (run.tldr || run.tldrPending)" class="rel-tldr">
            <span class="rel-tldr-label">tl;dr</span>
            <span v-if="run.tldr">{{ run.tldr }}</span>
            <span v-else class="rel-dim">Debugger is working out what happened…</span>
          </div>
          <div v-if="run?.state === 'failed' && run.failedTests?.length" class="rel-failed-tests">
            <span class="rel-tldr-label">Failed tests</span>
            <FailedTestsList :tests="run.failedTests" />
          </div>
          <pre v-if="runLog" class="rel-log">{{ runLog }}</pre>
          <div class="rel-debugger">
            <Button
              variant="outline"
              size="sm"
              :disabled="debuggerSending || debuggerSent"
              @click="sendToDebugger"
            >
              <Bug class="btn-ico" aria-hidden="true" />
              {{
                debuggerSent
                  ? "Sent to Debugger"
                  : debuggerSending
                    ? "Sending…"
                    : "Send to Debugger"
              }}
            </Button>
            <span v-if="debuggerErr" class="rel-debugger-err">{{ debuggerErr }}</span>
          </div>
        </section>

        <!-- Where users install this release. Rendered only when the project
             declares [[distribution]] destinations; stays up (with a loading
             indicator) while the first lookup is in flight. -->
        <section v-if="distribution.length || distributionLoading" class="rel-card rel-dist">
          <div class="rel-dist-head">
            <div class="rel-dist-title-row">
              <h2 class="rel-dist-title">Published to</h2>
              <Button
                variant="outline"
                size="sm"
                :disabled="distributionLoading"
                @click="loadDistribution"
              >
                {{ distributionLoading ? "Checking…" : "Check again" }}
              </Button>
            </div>
            <p class="rel-dist-sub">
              Where people can install this release.
              <template v-if="distributionReleaseVersion">
                Comparing each channel to <code>{{ distributionReleaseVersion }}</code
                >.
              </template>
              Registry and package-manager updates can take several minutes after CI succeeds.
            </p>
          </div>

          <!-- While the lookup is in flight show the spinner: alone on the
               first load (the card would otherwise look broken-empty), and
               alongside the channels during a "Check again" recheck. -->
          <div v-if="distributionLoading" class="rel-dist-loading" role="status">
            <span class="rel-dist-loading-spin" aria-hidden="true"></span>
            Checking distribution channels…
          </div>
          <p v-if="distributionCiFailure" class="ff-error" role="alert">
            The release workflow failed<template v-if="distributionCiFailure.failedStep">
              at “{{ distributionCiFailure.failedStep }}”</template
            >, so some channels below may not update on their own.
            <a :href="distributionCiFailure.runUrl" target="_blank" rel="noreferrer"
              >View the failed run ↗</a
            >
          </p>
          <div v-if="distribution.length" class="rel-dist-channels">
            <article v-for="channel in distribution" :key="channel.name" class="rel-channel">
              <header class="rel-channel-head">
                <a
                  v-if="channel.url"
                  class="rel-channel-name"
                  :href="channel.url"
                  target="_blank"
                  rel="noreferrer"
                  >{{ channel.name }} ↗</a
                >
                <span v-else class="rel-channel-name">{{ channel.name }}</span>
                <span class="rel-channel-state" :data-state="channel.state">{{
                  channelStateLabel(channel)
                }}</span>
              </header>
              <p class="rel-channel-detail">{{ channelSummary(channel) }}</p>
              <ul v-if="channel.install.length" class="rel-installs">
                <li v-for="command in channel.install" :key="command" class="rel-install">
                  <span class="rel-install-label">{{ installLabel(command) }}</span>
                  <code class="rel-install-cmd">{{ command }}</code>
                  <button
                    type="button"
                    class="rel-copy"
                    :aria-label="`Copy ${channel.name} install command`"
                    @click="copyCommand(command)"
                  >
                    <Check
                      v-if="copiedCommand === command"
                      class="rel-copy-ico"
                      aria-hidden="true"
                    />
                    <Copy v-else class="rel-copy-ico" aria-hidden="true" />
                    {{ copiedCommand === command ? "Copied" : "Copy" }}
                  </button>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <Dialog :open="confirmOpen" @update:open="confirmOpen = $event">
          <DialogOverlay />
          <DialogContent
            class="release-drawer"
            :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
          >
            <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
            <div class="drawer-head">
              <div class="drawer-head-title">
                <DialogTitle>Cut a release</DialogTitle>
              </div>
              <DialogClose class="close-x" aria-label="Close"
                ><X class="size-[15px]"
              /></DialogClose>
            </div>
            <div class="drawer-body">
              <DialogDescription class="release-drawer-desc">
                Runs <code>repoos check</code>, pushes <code>{{ status.branch }}</code
                >, then pushes a tag. CI builds and publishes from that tag.
              </DialogDescription>

              <p v-if="!canOpen && !running" class="ff-notice" role="status">
                Publishing is disabled: the working tree must be clean and on
                <code>{{ status.branch }}</code
                >.
              </p>

              <dl class="rel-panel-facts">
                <div>
                  <dt>Currently published</dt>
                  <dd>{{ publishedTag ?? "nothing yet" }}</dd>
                </div>
                <div>
                  <dt>Suggested next</dt>
                  <dd>{{ suggestedTag ?? "—" }}</dd>
                </div>
              </dl>

              <template v-if="running && run">
                <h3 class="release-progress-heading">{{ phaseHeading }}</h3>
                <div class="release-progress" aria-live="polite">
                  <span>{{ elapsed() }}</span>
                  <small v-if="run.phase === 'building'"
                    >Rebuilding so the check runs against fresh output.</small
                  >
                  <small v-else-if="run.phase === 'checking'"
                    >Full verification usually takes a few minutes.</small
                  >
                  <small>You can leave this page — progress shows here when you return.</small>
                </div>
                <!-- Output goes LAST and has a fixed height, so streaming text never
                     shifts the heading, timer, or hints above it. -->
                <pre class="release-progress-output" aria-label="Latest output"><span
                  v-for="(seg, i) in progressOutput"
                  :key="i"
                  :style="{
                    color: seg.color ? `var(--${seg.color})` : undefined,
                    fontWeight: seg.bold ? 700 : undefined,
                    opacity: seg.dim ? 0.7 : undefined,
                  }"
                  >{{ seg.text }}</span></pre>
              </template>

              <div v-if="error && !running" class="release-drawer-error" role="alert">
                <strong>{{ error }}</strong>
                <div
                  v-if="run?.state === 'failed' && (run.tldr || run.tldrPending)"
                  class="rel-tldr"
                >
                  <span class="rel-tldr-label">tl;dr</span>
                  <span v-if="run.tldr">{{ run.tldr }}</span>
                  <span v-else class="rel-dim">Debugger is working out what happened…</span>
                </div>
                <div
                  v-if="run?.state === 'failed' && run.failedTests?.length"
                  class="rel-failed-tests"
                >
                  <span class="rel-tldr-label">Failed tests</span>
                  <FailedTestsList :tests="run.failedTests" />
                </div>
                <pre v-if="runLog" class="rel-log">{{ runLog }}</pre>
                <div class="rel-debugger">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="debuggerSending || debuggerSent"
                    @click="sendToDebugger"
                  >
                    <Bug class="btn-ico" aria-hidden="true" />
                    {{
                      debuggerSent
                        ? "Sent to Debugger"
                        : debuggerSending
                          ? "Sending…"
                          : "Send to Debugger"
                    }}
                  </Button>
                  <span v-if="debuggerErr" class="rel-debugger-err">{{ debuggerErr }}</span>
                </div>
              </div>

              <div v-if="!running" class="rel-version-field">
                <label class="rel-field-label" for="rel-version">New version</label>
                <div class="rel-version-row">
                  <div class="rel-version-input">
                    <input
                      id="rel-version"
                      v-model.trim="newVersion"
                      :placeholder="suggestedVersion ?? '0.0.0'"
                      inputmode="text"
                      autocapitalize="none"
                      autocorrect="off"
                      spellcheck="false"
                      autofocus
                      @keyup.enter="release"
                    />
                    <span
                      class="rel-version-tag"
                      :class="{ dim: !newVersion, pre: newIsPrerelease }"
                    >
                      → {{ newTag || `${tagPrefix}${suggestedVersion ?? "0.0.0"}` }}
                      <template v-if="newIsPrerelease"> · prerelease</template>
                    </span>
                  </div>
                  <span class="rel-version-or" aria-hidden="true">or</span>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    :disabled="!suggestedVersion"
                    @click="cutNext"
                  >
                    Cut Next
                  </Button>
                </div>
                <div class="rel-field-hint">
                  <span>Just the number — no “{{ tagPrefix }}”.</span>
                  <span>
                    <b>Prerelease channel:</b> append <code>-beta.1</code> /
                    <code>-canary.1</code> / <code>-rc.1</code>.
                  </span>
                  <span>
                    CI flags it pre-release — users opt in with
                    <code>repoos upgrade --channel &lt;name&gt;</code>.
                  </span>
                </div>
              </div>

              <div v-if="!running" class="rel-notes-field">
                <div class="rel-notes-head">
                  <label class="rel-field-label" for="rel-notes">
                    Release notes <span class="rel-optional">optional</span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    :disabled="generatingNotes"
                    @click="generateNotes"
                  >
                    <Sparkles class="btn-ico" aria-hidden="true" />
                    {{ generatingNotes ? "Drafting…" : "Generate with AI" }}
                  </Button>
                </div>
                <textarea
                  id="rel-notes"
                  v-model="notes"
                  class="rel-notes-input"
                  rows="6"
                  placeholder="What's in this release? Type it here, generate a draft from the commits since the last release, or leave empty."
                ></textarea>
                <div v-if="generatingNotes" class="rel-notes-drafting" aria-live="polite">
                  <ActivityIndicator size="sm" label="Drafting release notes…" />
                  <span>
                    Drafting release notes from the commits since the last release… you can keep
                    editing meanwhile.
                  </span>
                </div>
                <div v-if="notesHint" class="rel-notes-hint">{{ notesHint }}</div>
                <div v-if="notesError" class="rel-notes-error" role="alert">{{ notesError }}</div>
              </div>

              <!-- The newest generated draft that never made it out with a
                   release (#0641): enough context to decide whether to reuse it
                   for a retry after a failed cut. -->
              <article
                v-if="showUnpushedCard && unpushedNotes"
                class="rel-notes-stale"
                data-test-id="unpushed-release-notes"
              >
                <div class="rel-notes-stale-head">
                  <div class="rel-notes-stale-title">
                    <FileClock class="rel-notes-stale-ico" aria-hidden="true" />
                    <strong>Saved AI draft not yet released</strong>
                  </div>
                  <Button variant="outline" size="sm" type="button" @click="useUnpushedNotes">
                    <RotateCcw class="btn-ico" aria-hidden="true" />
                    Use these notes
                  </Button>
                </div>
                <p class="rel-notes-stale-meta">
                  Generated {{ relativeTime(unpushedNotes.createdAt) || "earlier" }}
                  <template v-if="unpushedNotes.headShort">
                    from <code>{{ unpushedNotes.headShort }}</code>
                  </template>
                  <template v-if="unpushedNotes.commitsBehind !== null">
                    · {{ unpushedNotes.commitsBehind }}
                    {{ unpushedNotes.commitsBehind === 1 ? "commit" : "commits" }} behind
                    <code>{{ unpushedNotes.currentHeadShort ?? "main" }}</code>
                  </template>
                  · never pushed with a release
                </p>
                <p v-if="unpushedNotes.commits.length" class="rel-notes-stale-commits">
                  New since this draft:
                  <span v-for="commit in unpushedNotes.commits" :key="commit">{{ commit }}</span>
                  <span
                    v-if="
                      unpushedNotes.commitsBehind !== null &&
                      unpushedNotes.commitsBehind > unpushedNotes.commits.length
                    "
                  >
                    and
                    {{ unpushedNotes.commitsBehind - unpushedNotes.commits.length }} more
                  </span>
                </p>
                <pre class="rel-notes-stale-body">{{ unpushedNotes.notes }}</pre>
              </article>

              <div v-if="!running" class="rel-field-hint rel-async-hint">
                <span>
                  <b>Generate with AI</b> usually takes 1–3 minutes. You can close this panel and
                  come back — your draft and edits are waiting, and clicking Generate again reuses
                  the saved draft.
                </span>
                <span>
                  <b>Publish</b> usually takes a few minutes (about 5). It's safe to leave while it
                  runs; check progress on this Releases page.
                </span>
              </div>
            </div>
            <div class="release-drawer-actions">
              <Button
                variant="accent"
                :disabled="!canOpen || !newVersionValid || running || generatingNotes"
                @click="release"
              >
                {{ running ? "Publishing…" : newTag ? `Publish ${newTag}` : "Publish" }}
              </Button>
              <DialogClose as-child
                ><Button variant="ghost">{{ running ? "Close" : "Cancel" }}</Button></DialogClose
              >
            </div>
          </DialogContent>
        </Dialog>
      </template>
    </template>

    <ConfirmDialog
      :open="pendingNotesReplace !== null"
      :title="notesReplaceTitle"
      confirm-label="Replace notes"
      @update:open="
        (v) => {
          if (!v) pendingNotesReplace = null;
        }
      "
      @confirm="confirmNotesReplace"
    >
      {{ notesReplaceDesc }}
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.rel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 22px;
}
.rel-head-actions {
  margin: 0;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.rel-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
}
.rel-sub {
  color: var(--txt-dim);
  font-size: 13px;
  margin: 3px 0 0;
}
.rel-error {
  color: var(--red);
  margin: 12px 0;
}

.rel-card {
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 22px;
}
.rel-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.rel-provider-name {
  font-size: 15px;
  font-weight: 700;
}
.rel-provider-meta {
  color: var(--txt-faint);
  font-family: var(--mono);
  font-size: 12px;
  margin-top: 2px;
}
.rel-pill {
  flex-shrink: 0;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.rel-pill[data-phase="published"] {
  color: var(--green);
  background: var(--green-tint);
  border-color: var(--green-border-tint);
}
.rel-pill[data-phase="prerelease"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
}
.rel-pill[data-phase="ready"] {
  color: var(--cyan);
  background: var(--cyan-dim);
  border-color: color-mix(in srgb, var(--cyan) 30%, transparent);
}
.rel-pill[data-phase="blocked"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
}
.rel-pill[data-phase="releasing"] {
  color: var(--violet);
  background: var(--violet-dim);
  border-color: var(--violet-border-tint);
}

/* The page answers "what is live now?" before offering the next cut. */
.rel-current-release {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin: 26px 0 14px;
  flex-wrap: wrap;
}
.rel-current-version {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rel-current-label,
.rel-next-label {
  color: var(--txt-faint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rel-current-number {
  font-family: var(--mono);
  font-weight: 700;
  line-height: 1;
  color: var(--txt);
  font-size: clamp(32px, 5vw, 48px);
}
.rel-current-meta {
  font-size: 11.5px;
  color: var(--txt-faint);
}
.rel-current-meta code {
  font-family: var(--mono);
  color: var(--txt-dim);
}
/* Age + commit distance: the two facts a human weighs before cutting again,
   so they sit together and read louder than the surrounding meta. */
.rel-fresh-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.rel-fresh,
.rel-behind {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12.5px;
  font-weight: 700;
}
.rel-fresh {
  background: color-mix(in srgb, var(--border) 45%, transparent);
  color: var(--txt-dim);
}
.rel-behind {
  font-variant-numeric: tabular-nums;
}
/* Fresh release: up to date with main, nothing to cut. */
.rel-fresh[data-state="fresh"],
.rel-behind[data-state="fresh"] {
  color: var(--green);
  background: var(--green-tint);
  border-color: var(--green-border-tint);
}
/* Aging: a handful of commits have landed since the release. */
.rel-fresh[data-state="aging"],
.rel-behind[data-state="aging"] {
  color: var(--cyan);
  background: var(--cyan-dim);
  border-color: color-mix(in srgb, var(--cyan) 35%, transparent);
}
/* Stale: a release is likely overdue. */
.rel-fresh[data-state="stale"],
.rel-behind[data-state="stale"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
}
.rel-current-sync {
  margin-top: 8px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.rel-current-sync[data-state="matching"] {
  color: var(--green);
  background: var(--green-tint);
  border-color: var(--green-border-tint);
}
.rel-current-sync[data-state="attention"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
}

.rel-context {
  color: var(--txt-faint);
  font-size: 12px;
  min-height: 1em;
}
.rel-context code {
  font-family: var(--mono);
  color: var(--txt-dim);
}

.rel-blockers {
  margin-top: 16px;
  border: 1px solid var(--amber-border-tint);
  background: var(--amber-tint);
  color: var(--amber);
  border-radius: 12px;
  padding: 10px 14px;
  display: grid;
  gap: 5px;
  font-size: 13px;
}

.rel-next-release {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 22px;
  padding: 15px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-2);
}
.rel-next-release > div:first-child {
  display: grid;
  align-items: baseline;
  gap: 2px 10px;
  grid-template-columns: auto auto;
}
.rel-next-release strong {
  color: var(--txt-dim);
  font-family: var(--mono);
  font-size: 17px;
}
.rel-next-hint {
  grid-column: 1 / -1;
  color: var(--txt-faint);
  font-size: 11.5px;
}

.rel-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 22px;
  flex-wrap: wrap;
}
.rel-next-actions {
  margin-top: 0;
  justify-content: flex-end;
}
.rel-link {
  color: var(--cyan);
  font-size: 12.5px;
  text-decoration: none;
}
.rel-link:hover {
  text-decoration: underline;
}

.rel-outcome {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  display: grid;
  gap: 8px;
}
.rel-outcome--ok {
  border-color: var(--green-border-tint);
  background: var(--green-tint);
}
.rel-outcome--fail {
  border-color: var(--red-border-tint);
  background: var(--red-tint);
}
.rel-outcome-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.rel-outcome--ok strong {
  color: var(--green);
  font-size: 13.5px;
}
.rel-outcome--fail strong {
  color: var(--red);
  font-size: 13.5px;
  line-height: 1.45;
}
.rel-outcome-span {
  color: var(--txt-faint);
  font-family: var(--mono);
  font-size: 12px;
}

.rel-tldr {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel-solid);
  color: var(--txt);
  font-size: 13px;
  line-height: 1.5;
}
.rel-tldr-label {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cyan);
}
.rel-dim {
  color: var(--txt-dim);
}
.rel-failed-tests {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
}
.rel-log {
  max-width: 100%;
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--txt-dim);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
}
.rel-log::-webkit-scrollbar-corner {
  background: transparent;
}
.rel-debugger {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.rel-debugger-err {
  color: var(--txt-dim);
  font-size: 12px;
}

.rel-empty {
  color: var(--txt-faint);
}

/* "Published to" — distribution destinations, quiet beside the release card. */
.rel-dist {
  margin-top: 16px;
}
.rel-dist-head {
  margin-bottom: 16px;
}
.rel-dist-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rel-dist-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  letter-spacing: 0.01em;
}
.rel-dist-sub {
  color: var(--txt-faint);
  font-size: 12px;
  margin: 4px 0 0;
}
.rel-dist-sub code {
  font-family: var(--mono);
  color: var(--txt-dim);
}
.rel-dist-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--txt-faint);
  font-size: 12.5px;
  padding: 4px 0 2px;
}
/* Small inline variant of the shared `.spin` indicator (same keyframes). */
.rel-dist-loading-spin {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border: 2px solid var(--border);
  border-top-color: var(--cyan);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.rel-dist-channels {
  display: grid;
  gap: 12px;
}
.rel-channel {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--bg-2);
}
.rel-channel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rel-channel-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--txt);
  text-decoration: none;
}
a.rel-channel-name:hover {
  color: var(--cyan);
  text-decoration: underline;
}
.rel-channel-state {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.rel-channel-state[data-state="matching"] {
  color: var(--green);
  background: var(--green-tint);
  border-color: var(--green-border-tint);
}
.rel-channel-state[data-state="out-of-sync"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
}
.rel-channel-state[data-state="failed"] {
  color: var(--red);
  background: var(--red-tint);
  border-color: var(--red-border-tint);
}
.rel-channel-state[data-state="unavailable"],
.rel-channel-state[data-state="unverified"] {
  color: var(--btn-new-color);
  background: var(--btn-new-bg);
  border-color: var(--border);
}
.rel-channel-detail {
  color: var(--txt-faint);
  font-size: 12px;
  margin: 5px 0 0;
}
.rel-installs {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.rel-install {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rel-install-label {
  flex-shrink: 0;
  width: 46px;
  font-size: 11px;
  font-weight: 700;
  color: var(--txt-faint);
}
.rel-install-cmd {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--txt-dim);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 6px 9px;
}
.rel-copy {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: var(--btn-new-bg);
  color: var(--btn-new-color);
  border-radius: 7px;
  padding: 5px 9px;
  font-size: 11px;
  cursor: pointer;
}
.rel-copy:hover {
  border-color: var(--border-bright);
  filter: brightness(1.1);
}
.rel-copy-ico {
  width: 12px;
  height: 12px;
}

@media (max-width: 560px) {
  .rel-current-release,
  .rel-next-release {
    flex-direction: column;
    align-items: stretch;
  }
  .rel-current-sync {
    align-self: flex-start;
    margin-top: 0;
  }
  .rel-next-actions {
    justify-content: flex-start;
  }
}
</style>
