/**
 * Token-count display formatting, shared across the UI so the k/`K` shorthand
 * can't drift back into individual components (#0336). Every token count shown
 * in the UI renders in millions with 3 decimal places (e.g. `1.842M`,
 * `0.013M`). Values below the compact threshold stay raw integers (e.g. `842`)
 * because `0.001M` is unreadable and loses precision. Missing/unreported
 * values render as `—`.
 */

/** "1.842M" / "0.013M" / "842" — "—" when the CLI hasn't reported a token count. */
export function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1_000_000).toFixed(3)}M`;
  return String(n);
}

/** Context-window / token-count formatting using the same M shorthand as `fmtTokens`. */
export function fmtContext(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1_000_000).toFixed(3)}M`;
  return String(n);
}
