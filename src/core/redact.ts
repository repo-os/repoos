/**
 * Defensive redaction for the support bundle (#0453).
 *
 * This is deliberately stricter than the `redactSecrets` helpers used for
 * close-out reasons (`src/server/done.ts`) and the Debugger chat: those run on
 * text that stays on the user's machine, whereas a support bundle is meant to
 * be *shared* — attached to an issue, pasted into a forum. A miss here leaks a
 * credential or a home path to the world, so the bundle treats every miss as a
 * blocker (`assertRedacted`) rather than a best-effort warning.
 *
 * Two layers:
 *
 *  1. `redactText` rewrites known secret shapes and sensitive `key=value`
 *     assignments in free-form strings (log tails, error messages, versions).
 *  2. `sanitizePathText` rewrites home directories, the repo root and
 *     user-profile paths to stable placeholders.
 *
 * `scanSecrets`/`assertRedacted` are the verification pass: the support bundle
 * serializes every file, scans the bytes, and refuses to package anything that
 * still matches a secret pattern. There is no "warn and continue" mode — a
 * finding is a bug in the collector.
 */

/** Version of the redaction ruleset; stamped into every bundle manifest. */
export const REDACTION_VERSION = 1;

/** The marker every redacted value is replaced with. */
export const REDACTED = "[redacted]";

interface SecretPattern {
  /** Stable name reported when a leak is detected (never the value). */
  name: string;
  re: RegExp;
  /** Custom replacement preserving structural capture groups. */
  replace?: (...groups: string[]) => string;
}

/** Default replacement: drop the whole match. */
function drop(): string {
  return REDACTED;
}

/**
 * Known credential formats. Each pattern is a `g` regex so it is cloned before
 * use (a shared global regex carries `lastIndex` between calls, which makes
 * alternating `test`/`replace` calls silently skip matches).
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  // OpenAI / Anthropic / OpenRouter style keys (sk-…, sk-ant-…, sk-proj-…).
  { name: "sk-key", re: /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{16,}/g },
  // GitHub.
  { name: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  // Slack.
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  // AWS access key / session key.
  { name: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  // Google API key.
  { name: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  // Stripe secret/restricted key.
  { name: "stripe-key", re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  // npm automation token.
  { name: "npm-token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  // GitLab personal access token.
  { name: "gitlab-pat", re: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  // Hugging Face token.
  { name: "huggingface-token", re: /\bhf_[A-Za-z0-9]{20,}/g },
  // SendGrid API key.
  { name: "sendgrid-key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  // JWT (three base64url segments).
  {
    name: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  // Authorization headers.
  {
    name: "bearer",
    re: /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replace: (scheme) => `${scheme} ${REDACTED}`,
  },
  {
    name: "basic-auth",
    re: /\b(Basic)\s+[A-Za-z0-9+/=]{12,}/gi,
    replace: (scheme) => `${scheme} ${REDACTED}`,
  },
  // PEM private-key blocks (redact the whole block, not just the header).
  {
    name: "private-key-block",
    re: /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g,
  },
  { name: "private-key-header", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g },
  // Credentials embedded in a URL: scheme://user:pass@host.
  {
    name: "url-credentials",
    re: /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s:@]+@/gi,
    replace: (scheme) => `${scheme}${REDACTED}@`,
  },
  // A sensitive key assigned inside free-form text / JSON / code. Booleans and
  // the redaction placeholder are excluded so re-scanning already-redacted
  // content is stable. JSON's `"key": value` is naturally skipped because the
  // closing quote sits between the key and the separator.
  {
    name: "sensitive-assignment",
    re: /\b([A-Za-z0-9_.-]*(?:api[_-]?key|apikey|secret|token|password|passwd|passphrase|client[_-]?secret|access[_-]?key|private[_-]?key|authorization|auth[_-]?token|refresh[_-]?token|session[_-]?secret|webhook[_-]?secret)[A-Za-z0-9_.-]*)(\s*[:=]\s*)(?:"[^"]{4,}"|'[^']{4,}'|(?!true\b|false\b|null\b|undefined\b|\[redacted\])[^\s,;}"'=]{3,})/gi,
    replace: (key, sep) => `${key}${sep}${REDACTED}`,
  },
  // dotenv-style lines: an all-caps sensitive key assigned a free-form value.
  {
    name: "dotenv-assignment",
    re: /^([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|SESSION|AUTH)[A-Z0-9_]*)\s*=\s*(?!\[redacted\]).+$/gim,
    replace: (key) => `${key}=${REDACTED}`,
  },
];

/** Clone a pattern so per-call `lastIndex` state never leaks between uses. */
function clone(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags);
}

/** The stable names of every secret pattern that matches `text`. */
export function scanSecrets(text: string): string[] {
  const hits: string[] = [];
  for (const { name, re } of SECRET_PATTERNS) {
    if (clone(re).test(text)) hits.push(name);
  }
  return hits;
}

/**
 * Replace every known secret shape in `text` with {@link REDACTED}. Free-form
 * strings (log tails, error messages, detected versions) must pass through
 * here before they enter a bundle.
 */
export function redactText(text: string): string {
  let out = text;
  for (const { re, replace } of SECRET_PATTERNS) {
    const fn = replace ?? drop;
    out = out.replace(clone(re), (...args) => {
      // String.replace passes (match, ...captures, offset, string); keep only
      // the capture groups, which is all the replacers use.
      const captures = args.slice(1).filter((a): a is string => typeof a === "string");
      return fn(...captures);
    });
  }
  return out;
}

/**
 * Redact any secret *values* in a structured value, keyed by field name. The
 * support bundle builds its report from allowlists, so this is defence in
 * depth: if a future collector adds a field whose name marks it sensitive
 * (`apiKey`, `token`, …), its value is dropped here even if no secret pattern
 * would have caught it.
 */
export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redactValue(v);
    }
    return out;
  }
  return value;
}

/** The key fragments that mark a structured field as credential-bearing. */
const SENSITIVE_KEY =
  /(secret|token|password|passwd|passphrase|api[_-]?key|apikey|private[_-]?key|credential|authorization|cookie|sessionkey)/i;

/** Field-name prefixes that end in a sensitive word but are safe booleans. */
const SAFE_SUFFIX = /(?:present|configured|set|enabled|required|count|present)$/i;

/** Whether a structured field name carries a credential value. */
export function isSensitiveKey(key: string): boolean {
  if (!SENSITIVE_KEY.test(key)) return false;
  // `clientSecretPresent: true` describes a credential; it is not one.
  return !SAFE_SUFFIX.test(key);
}

// ── Path minimization ───────────────────────────────────────────────────────

export interface PathContext {
  /** Absolute repo root; replaced with `<repo>`. */
  root?: string;
  /** Home directory; replaced with `~`. */
  home?: string;
}

/** POSIX / macOS user profile prefixes. */
const USER_PATH_RE = /\/(?:Users|home|private\/var\/folders|var\/folders)\/[^/\s"'`;,)\]}]+/g;
/** Windows user profile prefix (`C:\Users\name`). */
const WIN_USER_PATH_RE = /[A-Za-z]:\\Users\\[^\\\s"'`;,)\]}]+/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Minimize paths in `text`: the repo root becomes `<repo>`, the home directory
 * and any user-profile path becomes `~`, and the bare username (which may recur
 * as an ordinary directory segment under the home dir, e.g.
 * `/Users/nick/code/nick/repo`) becomes `<user>`. Applied to every string that
 * enters a bundle so neither a username nor a project-specific absolute path
 * leaks by default.
 */
export function sanitizePathText(text: string, ctx: PathContext = {}): string {
  let out = text;
  // Longest, most specific first: the repo root sits under the home dir.
  if (ctx.root && ctx.root.length > 1) {
    out = out.split(ctx.root).join("<repo>");
  }
  const home = ctx.home?.replace(/[/\\]+$/, "");
  if (home && home.length > 1) {
    // Split on the stripped `home`, not the raw value: a HOME ending in `/`
    // would otherwise never match a path that Omits the trailing slash.
    out = out.split(home).join("~");
    const username = home.split(/[/\\]/).pop();
    if (username && username.length > 1) {
      const re = new RegExp(`(^|[/\\\\])${escapeRegExp(username)}([/\\\\]|$)`, "g");
      out = out.replace(re, (_m, pre: string, post: string) => `${pre}<user>${post}`);
    }
  }
  out = out.replace(USER_PATH_RE, "~");
  out = out.replace(WIN_USER_PATH_RE, "~");
  return out;
}

/** Read `$HOME`, tolerating an unset/odd value. */
export function homeDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const home = env.HOME ?? env.USERPROFILE;
  return home && home.length > 1 ? home : null;
}

// ── Verification ────────────────────────────────────────────────────────────

export class RedactionLeakError extends Error {
  readonly patterns: string[];
  constructor(patterns: string[]) {
    super(
      `refusing to write support bundle: redaction verification found ${patterns.join(", ")} ` +
        `in the generated content — this is a bug in the bundle collector, not something to share`,
    );
    this.name = "RedactionLeakError";
    this.patterns = patterns;
  }
}

/**
 * Throw when `text` still carries a secret shape after redaction. Used as the
 * final gate over every serialized bundle file, including the manifest.
 */
export function assertRedacted(text: string, label = "content"): void {
  const hits = scanSecrets(text);
  if (hits.length > 0) {
    throw new RedactionLeakError(hits.map((h) => `${label}:${h}`));
  }
}
