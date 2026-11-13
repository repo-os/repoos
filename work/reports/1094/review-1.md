---
task: "1094"
pass: 1
at: "2026-11-13T12:23:24.574Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/release-email-rich-templates
state: ok
tree_identity: "8dbbbdd90:"
---
## Verdict
`good to go` — Grouped templates, host-aware links, and per-recipient unsubscribe meet the acceptance criteria; no blocking defects in the diff.

## Relevance
`still relevant` — #1071 left grouped notes, unsubscribe, and non-GitHub links unimplemented; this branch delivers that deferred scope.

## Evidence
None

## Bugs
None found

## Edge cases
- Automatic cut sends (`startCutReleaseEmail` in `release.ts`) pass no `publicOrigin`; unsubscribe links appear only when `webOrigin` resolves (`REPOOS_PUBLIC_URL`, tunnel, or manual Resend with `requestOrigin`). Emails still send without a link.
- `groupedNotes` drops section headings from the body; notes that are headings-only can render an empty “Release notes” block without the empty-state paragraph.
- Unsubscribe state is read-modify-write without locking (same pattern as `release-emails.json`); parallel Resend requests could race.

## Suggestions
- Add tests that `pendingRecipients` / `deliverCutReleaseEmail` skips unsubscribed addresses and that sent HTML includes an unsubscribe URL when origin is configured.
- Mention in user-facing release-email docs that a public app URL (env or tunnel) is required for unsubscribe links on automatic cuts.
- Preview correctly omits unsubscribe (no token side effects); no change needed.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

