# Settings tabs QA, round 2 — November 2026

Task #1222. Second pass over all seven Settings tabs (General, Notifications,
Security, Advanced, Import/Export, Support, repoos.toml) after the November
round-1 audit (`docs/qa/2026-11-settings-agents.md`,
`docs/qa/2026-11-settings-mobile.md`). The round-1 fixes are still holding: this
round re-verified persistence, validation and small-screen fit against the
current build and found no product defects.

## Method

Everything ran headless WebKit against the built app (`dist/ui`) served from a
throwaway fixture repo via the same in-process harness the `repoos check` UI
smoke gate uses (`startPreviewServer` + `makeSmokeFixture` in
`src/commands/ui-harness.ts` / `src/commands/ui-smoke.ts`). No server process
was spawned, no visible browser was opened, and every config write — including
raw TOML edits — landed in the fixture's scratch `repoos.toml` under a temp
directory. The worktree's real `repoos.toml` was never read or written.

The walkers in `docs/qa/` reproduce the pass:

- `settings-tabs-qa2-walk.mjs` — layout walk over every tab at three widths;
- `settings-tabs-qa2-audit.mjs` — per-tab save → reload → verify audit of all
  visible, editable schema-backed controls, with below-minimum probes;
- `settings-tabs-qa2-array-errors.mjs` — invalid-entry error visibility for the
  validated array fields, captured before any reload;
- `settings-tabs-qa2-flows.mjs`, `settings-tabs-qa2-panels.mjs`,
  `settings-tabs-qa2-event-toggles.mjs` — raw-TOML, Notifications, Security,
  General, Import/Export and Support flows.

## Findings

### Layout at 375 / 768 / 1280 px — clean (21/21)

All seven tabs were walked at 375, 768 and 1280 CSS px. Every tab×width
combination had zero horizontal document overflow and zero visible controls
spilling outside their scrollport or the viewport. The round-1 phone fixes
(Support action wrapping, search overlay, development-target editor) hold.

### Schema controls: 114 audited — valid edits save and survive reload

Every visible, editable schema-backed control was changed, left for the
debounced auto-save, reloaded and compared against the restored UI value: 90 on
General and 24 on Advanced (Notifications exposes no editable schema fields —
its 28 event toggles are hand-rendered, see below). 108 of 114 restored
byte-identically; the other 6 rows are probe artifacts, not product defects,
and are covered by the two notes below and by the dedicated walkers.

Three duration fields initially flagged a display-only mismatch: with a
deliberately fractional millisecond value in the scratch config the seconds
input shows the value rounded to six decimals (`45.033333` for
`45033.333333…ms`). The persisted value is exact and a user typing whole values
never sees it — recorded, not a defect.

Three array-typed controls (`model_routing.roles`,
`uiVerification.viewportWidths`, `release.email.to`) render a single text input,
so the audit probed them as strings by appending `-x`; the server correctly
rejected those entries, and the audit's error check ran after a reload that had
already cleared the save message. The array walkers below verify them directly.

### Numeric validation: below-minimum rejected with plain-English errors

Every probed number field received `min − 1`; each showed a visible
plain-English error and left the persisted value untouched. Examples:
"Local check queue timeout must be a number at least 0", "Pressure guard: max
load per CPU must be …", "Phantom runner detect window must be a number greater
than 15000", "Idle nudge cooldown …".

### Array fields: invalid entries rejected with visible errors

Checked with the error still on screen (a reload resets the save message, so
error capture must happen before reloading):

- `release.email.to` + "not-an-email" → "not-an-email is not an email address";
- `model_routing.roles` + "not-a-role" → "Unknown routing role: not-a-role";
- `uiVerification.viewportWidths` + "-5" → "…must contain positive whole pixel
  widths";
- `reviewVerification.testGlobs` + blank → "…must be a non-empty array".

`remoteValidation.tailscaleHosts` is visibility-gated and does not render on a
bare fixture (covered when configured, round 1). `areas` is free-form by design:
arbitrary text saves, as documented in round 1.

### Notifications, Security, General hand-rendered controls

- Notifications: 28 event switches render labelled and enabled; the last one
  ("Git index lock left open") toggled off→on and stuck across a reload. The
  spend-alert threshold rejects `-1` with its own field-level alert ("Spend
  alert threshold must be zero or more.").
- Security: the session-duration number field saved 31 and restored 31.
- General: the floating-agent-buttons switch toggled and stuck across reload
  (restored afterwards).

### Raw repoos.toml tab — save, reload and validation all correct

- An appended marker comment saved to the scratch file and the editor reported
  "In sync"; after a full reload the textarea showed the saved content.
- Malformed TOML (`not = [valid toml`) was rejected with a plain-English error
  ("Invalid TOML on line 1 …") and the file on disk stayed byte-identical — a
  malformed edit never reaches disk.

### Import/Export and Support

- Import/Export: the five export-category switches, the "Download export"
  action and the import file picker render labelled.
- Support: the report-type cards, "Generate editable bug report with AI" and
  "Write it manually" render; the manual composer opens with a title field and
  typable notes. Nothing was submitted, no bundle was created, and no AI
  generation was triggered.

### No genuine page errors

The layout walk recorded zero `pageerror` events across all 21 tab loads. The
save-and-reload walkers record large volumes of benign WebKit fetch noise
("… due to access control checks") against the ephemeral fixture server under
rapid programmatic navigation; filtering that out, no thrown page error
occurred in any run.

## Outcome

No product defects were found in this round: every Settings tab saves,
validates with plain-English errors, survives reload, and fits at 375, 768 and
1280 px. The walkers are committed so the next QA round can re-run the pass in
minutes.

## Known limitations

- Selects were verified by choosing the first alternative option; option lists
  were not exhaustively enumerated.
- Actions with external side effects (ntfy/Telegram "Send test", the
  push-permission request, AI report generation, applying an export to a real
  project) were not triggered, matching round 1.
- Credentials and account-dependent Security actions (invites, Telegram
  linking) remain unverified for the same reason as round 1: no administrator
  session in the auth-less fixture, and the actions have external effects.
