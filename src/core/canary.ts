export const CANARY_FILENAME = "canary.txt";

/** Repo-relative path to the managed repo's flow-test counter file. */
export function canaryRelPath(cacheDir = ".repoos"): string {
  const base = cacheDir.replace(/\/$/, "");
  return `${base}/${CANARY_FILENAME}`;
}

/** Gitignore glob that ignores cache contents but allows a negation for canary.txt. */
export function canaryGitignoreIgnore(cacheDir: string): string {
  const base = cacheDir.replace(/\/$/, "");
  return `${base}/*`;
}

/** Gitignore negation line so `canary.txt` stays tracked inside the cache dir. */
export function canaryGitignoreNegation(cacheDir: string): string {
  return `!${canaryRelPath(cacheDir)}`;
}

/**
 * Upgrade legacy `${cacheDir}/` directory ignores to `${cacheDir}/*` and ensure
 * the canary negation is present. A directory-only ignore prevents git from
 * ever tracking `canary.txt` inside it.
 */
export function patchGitignoreForCanary(
  raw: string,
  cacheDir: string,
): { content: string; changed: boolean } {
  const base = cacheDir.replace(/\/$/, "");
  const ignoreGlob = canaryGitignoreIgnore(cacheDir);
  const negation = canaryGitignoreNegation(cacheDir);
  const legacyDir = `${base}/`;

  const lines = raw.length > 0 ? raw.split(/\r?\n/) : [];
  let changed = false;

  const mapped = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === legacyDir || trimmed === base) {
      changed = true;
      return line.replace(trimmed, ignoreGlob);
    }
    return line;
  });

  const hasIgnore = mapped.some((line) => line.trim() === ignoreGlob);
  const hasNegation = mapped.some((line) => line.trim() === negation);

  const out = [...mapped];
  if (!hasIgnore || !hasNegation) {
    changed = true;
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
    if (!hasIgnore) {
      out.push("# RepoOS derived index cache");
      out.push(ignoreGlob);
    }
    if (!hasNegation) {
      out.push("# RepoOS canary flow-test counter (tracked)");
      out.push(negation);
    }
  }

  let content = out.join("\n");
  if (content.length > 0 && !content.endsWith("\n")) content += "\n";
  if (raw !== content) changed = true;
  return { content, changed };
}

export function parseCanaryDigit(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.length !== 1 || !/[0-9]/.test(trimmed)) return 0;
  return Number(trimmed);
}

export function nextCanaryDigit(current: number): number {
  return (current + 1) % 10;
}

/** Stable prefix — used to recognize canary freeform creates server-side. */
export const CANARY_TASK_MARKER =
  "This is the RepoOS canary task: a deliberately trivial change used to smoke-test the full flow ";

export function isCanaryTaskExplanation(explanation: string): boolean {
  return (
    explanation.startsWith(CANARY_TASK_MARKER) ||
    explanation.startsWith("This is the repoos canary task:")
  );
}

export function buildCanaryPrompt(canaryPath: string): string {
  return (
    CANARY_TASK_MARKER +
    "(draft, inbox, ready, active, review, merge, done) end to end. " +
    `The only change to make is in ${canaryPath}: replace the single digit with the next value, ` +
    "incrementing by 1 and wrapping from 9 back to 0. " +
    "Do not touch anything else, do not add tests or comments, and do not change the canary prompt text."
  );
}

/** Default prompt when cacheDir is `.repoos` — UI imports this for the freeform body. */
export const CANARY_PROMPT = buildCanaryPrompt(canaryRelPath());
