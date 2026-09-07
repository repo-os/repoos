---
id: "0332"
title: "Model playground rejects valid OpenRouter ids (~ aliases, : variants) — widen RUNIDPATTERN"
type: bug
status: done
priority: p2
area: api
assigned_to: ai
created_by: hello@repoos.org
branch: feat/model-playground-rejects-valid-openroute
created_at: "2026-09-07T18:40:25Z"
updated_at: "2026-09-07T18:51:10Z"
---
## Problem

The model playground sidebar can contain catalog entries that the server's own validator rejects. `RUNIDPATTERN` in `src/server/routes/playground.ts:26` allows only `[\w./-]` after the provider slash, but OpenRouter's live catalog now ships two id shapes it doesn't cover:

- `~`-prefixed alias ids (e.g. `openrouter/~z-ai/glm-flash-latest`) — 3 of the 12 entries currently in the sidebar fail;
- `:`-suffixed variant ids (e.g. `:batch`) — the curator only filters `:free`, so other variants survive into the sidebar.

Clicking one sends a `runId` the validator rejects with `400 "runId must be a known provider/model id"`. Verified against the live OpenRouter API by replicating the curator + validator logic.

## Desired UX

Every entry shown in the playground sidebar is clickable and runnable. Selecting `openrouter/~z-ai/glm-flash-latest` or `openrouter/openai/gpt-6-astra:batch` starts a normal chat run instead of returning a 400.

## Acceptance criteria

- [ ] `RUNIDPATTERN` in `src/server/routes/playground.ts` is widened to `/^[a-zA-Z0-9][\w.-]*\/[\w.:/~-]+$/`
- [ ] Test positives added in `playground-chat.test.ts`: `openrouter/~z-ai/glm-flash-latest` and `openrouter/openai/gpt-6-astra:batch`
- [ ] All existing negative test cases still pass unchanged
- [ ] `repoos check` passes

## Notes for AI

- Security posture is unchanged: `runId` still goes via argv, and the provider-segment allowlist remains the real gate. Do not weaken the provider-segment allowlist.
- Do not change the curator's `:free` filtering behavior.
- Files to touch: `src/server/routes/playground.ts` (the pattern, ~line 26), `playground-chat.test.ts` (positives), and optionally `src/core/providers/openrouter.ts:61` (same character filter as hygiene).
- Assumption: the "optional hygiene" change in `src/core/providers/openrouter.ts` is nice-to-have; it may be dropped if it complicates anything and is not a blocker for done.
- Zero runtime dependencies — hard repo constraint.

## Scope

In scope: widening the validator pattern in `src/server/routes/playground.ts`, adding the two test positives in `playground-chat.test.ts`, and optionally mirroring the same character filter in `src/core/providers/openrouter.ts`. Deferred: any broader runId normalization, curator changes beyond the existing `:free` filter, and changes to the provider-segment allowlist.

## Original prompt

Title: Model playground rejects valid OpenRouter ids (~ aliases, : variants) — widen RUNIDPATTERN

Body: The playground sidebar can contain catalog entries the server's own validator rejects: src/server/routes/playground.ts:26 allows only [\w./-] after the provider slash, but OpenRouter's live catalog now ships ~-prefixed alias ids (~z-ai/glm-flash-latest — 3 of 12 current sidebar entries fail) and :-suffixed variants (:batch etc., curator only filters :free). Clicking one → 400 "runId must be a known provider/model id". Verified against the live API by replicating curator + validator.

Fix: widen the pattern to /^[a-zA-Z0-9][\w.-]*\/[\w.:/~-]+$/; add test positives openrouter/~z-ai/glm-flash-latest and openrouter/openai/gpt-6-astra:batch in playground-chat.test.ts (all existing negatives still hold). Optional hygiene: same char filter in src/core/providers/openrouter.ts:61. Security unchanged — runId goes via argv and the provider-segment allowlist is the real gate.

Once filed, an engineer agent can pick it up — it's a one-line change plus tests.

## Activity

- 2026-09-07T18:40:25Z · created · hello@repoos.org
- 2026-09-07T18:41:10Z · status draft→inbox, title, area, type, body
- 2026-09-07T18:41:50Z · status inbox→ready
- 2026-09-07T18:42:08Z · status ready→active, branch
- 2026-09-07T18:46:26Z · status active→review
- 2026-09-07T18:51:10Z · status review→done, release:success
