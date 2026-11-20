# Remote runner add, test and remove flows with failures — QA pass, November 2026

Task #1256. Scope: the Remote validation runner drawer's host-pool editor
(add and remove hosts), the **Test connection** button, and what each failure
says when a host is unreachable, logs in as the wrong user, is missing a CLI,
or answers slowly. Method: fixtures and stubbed responses only, headless
Playwright WebKit; no ssh ran, no real runner was contacted or changed, no
visible browser was opened, and `repoos.toml` was not touched.

## Method

- Interaction assertions run on the real `RemoteValidationDrawer` in jsdom with
  `fetch` stubbed (`src/ui-app/tests/remote-runner-flows-qa-browser.test.ts`).
  The failure text is produced by the same `describeHostProbeFailure` the Test
  route calls, so the copy under test is the copy a user sees.
- The classifier is table-driven over the probe's own messages and ssh's
  stderr (`src/ui-app/tests/remote-probe-failures.test.ts`). A test also asserts
  `prereqProbeCommand` still prints the phrases the classifier matches, so a
  wording change in the probe fails the suite instead of silently degrading to
  the generic line.
- The same failure states are rendered in headless WebKit with the built global
  stylesheet and the drawer's own scoped CSS, at 375, 768 and 1280 px. Each
  render must not widen the document and must have no element outside the
  viewport, and must contain the plain-English cause and next step. The drawer
  scrolls internally, so the shot is taken at the state's block. `QA_SHOTS=<dir>`
  saves the shots.

## Findings and fixes

1. **Test connection reported the failing host with no cause or next step (fixed).**
   A host that failed the prerequisite probe showed `FAILED (exit 255): ssh: …`
   or `FAILED (exit 1): docker not found on PATH`, and the headline was the
   generic "One or more hosts failed the prerequisite check." A user could not
   tell which host, what was wrong, or what to do. `describeHostProbeFailure`
   (`src/server/remote-validation.ts`) now maps each failure to a cause and a
   next step: no answer within 15 s; SSH login refused (check the per-host user
   and its key); host name not resolvable; connection refused or timed out;
   Docker missing or stopped; git or bun missing from the login PATH; runner image
   missing or missing a tool; Bun cache not writable; and a generic line for
   anything else. The raw output stays under "Details". The headline names the
   failing hosts ("2 of 3 hosts failed the setup check: mac1, pi-den.").
2. **The failure details were discarded in the drawer (fixed).** On failure the
   drawer kept only `res.error`, so even the per-host output the server sent was
   dropped. It now shows the headline and the per-host details together.
3. **A slow pool took up to N × 15 s with no explanation (fixed).** Hosts were
   probed one after another, so three unreachable hosts held "Testing…" for 45 s.
   The probes now run in parallel (about 15 s total), and while the test runs the
   drawer says a host that does not answer is reported after 15 seconds.
4. **Removing a host saved immediately with no confirmation (fixed).** Save hosts
   treated a dropped host the same as an edit. Saving a list that drops hosts now
   shows an inline panel: "Remove mac1 from the host pool? New jobs will stop going
   to it. A job already running there will finish." with **Remove host** and
   **Keep it**. Nothing is sent until the user confirms; **Keep it** restores the
   saved list. Adding hosts still saves straight away.
5. **Hetzner messages stopped at the cause (fixed).** "HETZNER_API_TOKEN is not
   set." and "snapshotId is not configured." now say where to set the value and
   what to do next. A failed VM listing now says the token and connection to check.
6. **Empty pool message (kept).** Save hosts with an empty field still says to
   remove every host by editing `repoos.toml`. This is deliberate: the pool editor
   never writes an empty list.

Pinned by tests: the existing drawer tests still pass unchanged, including the
single-host failure string and the empty-pool guidance.

## Review round 2

- **A remote-side "Permission denied" was read as a login failure (fixed).**
  The login rule matched any `Permission denied`, so an unwritable Bun cache
  (`touch: …: Permission denied` printed before the probe's own message) was
  reported as an SSH login refusal. The login rule now matches only ssh's own
  shape (`user@host: Permission denied (publickey…)`), and the probe's fixed
  messages are checked first. Tests cover the cache case and a Docker socket
  `permission denied`, which falls to the generic line.
- **The probe's script messages got the generic line (fixed).** "missing runner
  script" and "outdated runner script" now have their own causes and next steps.
- **Save hosts could run with the pool unknown (defensive guard added).** The
  save path refuses while the status is not loaded. In the UI the pool editor is
  hidden when the status fails, so the guard is not reachable by typing; a test
  pins that the editor is absent.
- **A stale removal panel could confirm an old set (fixed).** Editing the host
  list clears the pending removal, so the panel only confirms what is on screen.
- **Shots not declared.** The failure block and the remove panel can only be
  reached by pressing Test (which probes real hosts from a preview) or by saving
  the pool (which writes `repoos.toml`). Both are off-limits for this QA, so a
  declared shot would show only the closed drawer. The fixture renders above are
  the evidence instead.
- **Server-side PATCH still removes hosts without a prompt (kept).** The guard is
  in the drawer, matching the other drawer-only controls. An API caller can still
  remove a host directly.

## Rendered checks (WebKit, 375 / 768 / 1280 px)

| State | 375 | 768 | 1280 |
| --- | --- | --- | --- |
| Test connection, three hosts (one passes, one wrong user, one timed out) | fits, no overflow; all three host sections and next steps readable | fits, no overflow | fits, no overflow |
| Remove confirmation (`bee, mac1` → `bee`) | fits; Remove host and Keep it stack inside the panel | fits | fits |

Shots from `QA_SHOTS` were checked by eye at 375 and 1280 px: the failure block
wraps inside its border, and the confirmation buttons do not overlap the text.

Not verified here: the drawer's existing config number inputs look oversized in
the 375 px shot. That comes from the drawer's Settings-style fields, is unchanged
by this task, and was not investigated.

## Limits

- No real runner was contacted. The timeout, wrong-user, missing-CLI and
  unreachable-host rows are fixtures and the classifier's own tests. A human must
  run Test connection against a real host to confirm the wording matches what ssh
  prints on that network. Real-host evidence is left blank here.
- The Test route (`/api/remote-validation/test`) is covered by type-checking and
  the classifier tests, not by a route-level test.
- Removing a host is still a text edit in the comma list. There is no per-host
  remove button, so the confirmation is the only guard on that path.
