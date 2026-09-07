---
id: "0332"
title: "Title: Model playground rejects valid OpenRouter ids (~ a…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-07T18:40:25Z"
updated_at: "2026-09-07T18:40:25Z"
---
Title: Model playground rejects valid OpenRouter ids (~ aliases, : variants) — widen RUNIDPATTERN

Body: The playground sidebar can contain catalog entries the server's own validator rejects: src/server/routes/playground.ts:26 allows only [\w./-] after the provider slash, but OpenRouter's live catalog now ships ~-prefixed alias ids (~z-ai/glm-flash-latest — 3 of 12 current sidebar entries fail) and :-suffixed variants (:batch etc., curator only filters :free). Clicking one → 400 "runId must be a known provider/model id". Verified against the live API by replicating curator + validator.

Fix: widen the pattern to /^[a-zA-Z0-9][\w.-]*\/[\w.:/~-]+$/; add test positives openrouter/~z-ai/glm-flash-latest and openrouter/openai/gpt-6-astra:batch in playground-chat.test.ts (all existing negatives still hold). Optional hygiene: same char filter in src/core/providers/openrouter.ts:61. Security unchanged — runId goes via argv and the provider-segment allowlist is the real gate.

Once filed, an engineer agent can pick it up — it's a one-line change plus tests.

## Original prompt

Title: Model playground rejects valid OpenRouter ids (~ aliases, : variants) — widen RUNIDPATTERN

Body: The playground sidebar can contain catalog entries the server's own validator rejects: src/server/routes/playground.ts:26 allows only [\w./-] after the provider slash, but OpenRouter's live catalog now ships ~-prefixed alias ids (~z-ai/glm-flash-latest — 3 of 12 current sidebar entries fail) and :-suffixed variants (:batch etc., curator only filters :free). Clicking one → 400 "runId must be a known provider/model id". Verified against the live API by replicating curator + validator.

Fix: widen the pattern to /^[a-zA-Z0-9][\w.-]*\/[\w.:/~-]+$/; add test positives openrouter/~z-ai/glm-flash-latest and openrouter/openai/gpt-6-astra:batch in playground-chat.test.ts (all existing negatives still hold). Optional hygiene: same char filter in src/core/providers/openrouter.ts:61. Security unchanged — runId goes via argv and the provider-segment allowlist is the real gate.

Once filed, an engineer agent can pick it up — it's a one-line change plus tests.

## Activity

- 2026-09-07T18:40:25Z · created · hello@repoos.org
