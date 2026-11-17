/** Canonical local Cursor CLI login command used by probes and recovery hints. */
export const CURSOR_LOGIN_COMMAND = "cursor-agent login";

/** Replace recognizable auth failures with safe guidance instead of raw stderr. */
export function cursorAuthErrorHint(text: string): string | null {
  if (
    !/\bnot (?:logged in|authenticated|signed in)\b|authentication required|unauthorized|\b401\b|\b403\b|invalid api key|run\s+['"`]agent login['"`]/i.test(
      text,
    )
  ) {
    return null;
  }
  return `Cursor Agent authentication required — run \`${CURSOR_LOGIN_COMMAND}\` and retry.`;
}
