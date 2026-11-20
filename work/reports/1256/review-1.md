---
task: "1256"
pass: 1
at: "2026-11-20T00:42:37.075Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-remote-runners-page-add-test-and
state: ok
tree_identity: "519647b5a:1abd1ff957"
---
## Verdict
`needs some work` — one classifier ordering bug makes a real failure mode report the wrong cause; otherwise sound.

## Relevance
`still relevant` — add/test/remove failure UX was unguarded and unexplained; the diff addresses exactly that.

## Evidence
- The single handoff capture (`auto: matched src/ui-app/**`) shows the Mission Control dashboard, not the drawer's failure or remove-confirm states; no `## Shots` were declared. The WebKit overflow/text assertions at 375/768/1280 do run in the gated suite, so the width criterion is verified by tests — but the human has no PNG of the new states. Name one under Suggestions.

## Bugs
- **Class: unanchored ssh-stderr pattern wins over probe messages (classifier ordering)** — `describeHostProbeFailure` (`src/server/remote-validation.ts`) tests `/Permission denied/i` first, unanchored. That pattern also appears in *remote-side* command output: on an unwritable Bun cache the probe prints `touch: …: Permission denied` (stderr) **before** its own `bun cache dir … is not writable` line, and docker cache/run failures can emit `permission denied` too. Those hosts are then told "SSH refused the login as user@host — check authorized_keys", the wrong cause and next step for a cache-permission problem — precisely the failure class this task set out to explain. Fix: anchor the login check (e.g. `@<host>: Permission denied` / ssh stderr shape, or match `(publickey|password)`) or move it after the probe's own fixed messages. The Details block still shows the truth, so it's recoverable, but the headline is wrong.

No further findings of this class were found after grepping: `describeHostProbeFailure` sibling patterns (`/is not writable/`, `/image '.*' not found/`, missing-on-PATH regex), the test route in `server.ts` (single call site), the drawer (`RemoteValidationDrawer.vue`), and both new test files (their fixture rows use ssh-shaped `Permission denied (publickey)` so they don't catch the misordering).

## Edge cases
- `status.value?.tailscaleHosts` empty (status not yet loaded) skips the confirm and saves any list — minor, pre-existing trust in `refresh()`.
- Confirm panel left open while the user re-edits the input can confirm a stale removal set; harmless (saves the current list).
- Server-side PATCH still allows removal with no confirm — API-level, consistent with drawer-only guard.
- Probe spawn failure (`could not spawn ssh`) falls to the generic line via `code: null` — acceptable.

## Suggestions
- Declare a `## Shots` entry (e.g. route/state fixture showing the failure block and the remove-confirm panel) so handoff evidence shows the changed UI, not the dashboard.
- Consider classifier rows for the probe's `missing runner script` / `outdated runner script` messages, which currently get the generic line.
- The engineer's ssh-on-`thinkpad` gate question is for the human: no host was touched by the diff itself, which is read-only fixtures as required.

## Verdict
`needs some work` — fix the Permission-denied misclassification; everything else, including mergeability (own-task-file conflict only), is clean.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T00:40:44.082Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

