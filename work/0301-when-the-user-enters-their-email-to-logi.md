---
id: "0301"
title: Animate the login email submission while awaiting passcode
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-08-26T15:47:48Z"
updated_at: "2026-08-26T15:48:18Z"
---
## Problem

When the user enters their email on the login screen and clicks the submit
button, nothing visibly happens for a few seconds while the passcode email is
sent and the next step (passcode entry) is prepared. During this gap the UI
appears unresponsive, and the user cannot tell whether their email was actually
sent or whether the click even registered. This is awkward and erodes
confidence in the login flow.

## Desired UX

After the user clicks the login/submit button, the UI should immediately show
some form of animation or progress indicator while the passcode-request is in
flight, so the user knows the action was acknowledged and work is happening.
Once the passcode screen is ready, the animation stops and the passcode entry
step is shown as it is today.

The animation should:
- Start the moment the button is clicked (feedback is instant, no dead air).
- Persist until the passcode entry view is displayed.
- Make it clear the email was sent / the request is being handled.

## Acceptance criteria

- [ ] Clicking the login submit button immediately triggers a visible animation/indicator on the login form.
- [ ] The animation is not dependent on any manual dismiss; it ends naturally when the passcode entry step renders.
- [ ] The existing login flow (email → passcode entry) otherwise behaves exactly as before.
- [ ] The animation plays against both successful sends and (where applicable) error states, with the indicator stopping once the flow advances or an error is surfaced.
- [ ] No console errors, and the UI smoke test still passes.

## Notes for AI

- This is a UI-only change in the login flow; do not alter the server-side
  passcode-send logic or any API behavior.
- Locate the login email-submission handler and the point where the passcode
  entry view mounts; the animation should live between these two moments.
- Prefer a lightweight indicator consistent with the existing UI/SFC patterns;
  do not introduce a runtime dependency (zero-runtime-dependencies constraint).
- Assumption: a lightweight inline spinner/progress state on the submit control
  is an acceptable default for "some animation"; no specific animation style
  was specified by the user.
- The animation should also cover the full time until the error/success
  resolution is known, so the user is never left staring at an inert button.

## Related

- `docs/native-auth.md` (login/passcode flow)

## Original prompt

When the user enters their email to login there should be some animation while waiting for passcode entry to show, because currently nothing happens for a few seconds and it's awkward and not clear if the email was sent after clicking the button

## Activity

- 2026-08-26T15:48:18Z · status draft→inbox, title, area, body
