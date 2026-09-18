---
id: "0400"
title: "New task panel: show PM's real model (not Default) and pin close button upper-right"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: auto
pm_cli_override: cursor
pm_model_override: auto
review_cli_override: claude code
review_model_override: default
created_at: "2026-09-18T03:42:22Z"
updated_at: "2026-09-18T03:50:37Z"
---
## Problem

Opening **New task** (freeform) shows the agent picker as **`opencode + Default`**.

That is surprising because:

1. The Agents page / `repoos.toml` PM agent is already pinned to a concrete model (in this repo: `opencode` + `openrouter/z-ai/glm-5.3-flash`).
2. Elsewhere we treat a configured agent model as the thing to display and run — "Default" looks like a misconfigured Agents entry, not a deliberate choice.

Separately, the New task panel's **× close control sits beside the title**, not in the upper-right like the task detail drawer (and Tunnel / other drawers that wrap the title in a `flex: 1` block).

## Answers to the original questions

### Is "Default" a real model I need to change on the Agents page?

**No — not for the PM.** `"default"` (UI label **"Default"**) is a **sentinel**, not a concrete model id:

- Offered first in every non–Claude Code model list (`config.modelsFor` always `push("default")`).
- Means: *do not pass `--model`; let the coding agent's own default apply* (`modelArgs` returns `[]` when `model === "default"`).
- Documented in `docs/token-optimization.md` and guarded by `isModelOverridePinned()` so a per-task override of `"default"` does **not** overwrite an agent's configured model with the literal string `"default"`.

This repo's PM is already set to a real pin in `repoos.toml`:

```toml
[[agents]]
name = "pm"
cli = "opencode"
model = "openrouter/z-ai/glm-5.3-flash"
```

(The engineer agent *does* use `model = "default"` on purpose — that is unrelated to the New task PM picker.)

So the user does **not** need to change the Agents panel to "fix" the label. The New task panel is failing to surface the PM's configured model.

### Why does New task show Default anyway?

**Bug in `TaskDrawer.vue` init + CLI→model watch race.**

On open, `initFreeformOverrides()` correctly copies the PM base:

```ts
freeformOverride.cli = base?.cli || "";
freeformOverride.model = base?.model || "";
```

But a watcher on `freeformOverride.cli` resets the model whenever CLI changes:

```ts
watch(() => freeformOverride.cli, (newCli, oldCli) => {
  if (!newCli || newCli === oldCli) return;
  const opts = config.modelsFor(newCli);
  freeformOverride.model = opts.length > 0 ? opts[0].value : "default";
});
```

`modelsFor` always puts `"default"` first, so `opts[0].value === "default"`.

On first open, `cli` goes `"" → "opencode"`. Vue flushes the watch **after** the sync init assignments, so the correctly copied PM model is overwritten with `"default"`. Confirmed with a minimal Vue repro: sync assign keeps the pin; after `nextTick` the model is `"default"`.

Same watch pattern exists for per-task Dev / Review / PM override drafts in the same file (`overrideDraft` / `pmOverrideDraft` / `reviewOverrideDraft`). Those are less likely to hit the empty→value first-open path, but should be reviewed for the same class of wipe.

**Runtime impact is mostly display:** `freeformIsCustom` becomes true (model ≠ PM base), so Create may send `{ model: "default" }` as an override. The freeform route correctly treats `"default"` as unpinned (`isModelOverridePinned`) and still runs the PM's configured model. Misleading UI, not a silent model swap — but the control should still show the pin the run will use.

New Doc / New Skill panels init from the PM the same way but **do not** have this CLI watch, so they are less affected (they still share the close-button layout issue).

### Close button

Task detail:

```html
<div class="drawer-head">
  <div style="flex: 1">…title…</div>
  <DialogClose class="close-x" />
</div>
```

New task (and New doc / New skill): title + description + close are bare flex siblings with **no** `flex: 1` (or `margin-left: auto` on `.close-x`), so the × sits immediately after the title instead of the upper right. Tunnel drawer already uses `.tunnel-drawer-title { flex: 1 }` — match that pattern.

## Scope

1. **Fix New task freeform agent readout** so it opens showing the enabled PM agent's configured `cli + model` (the concrete pin from Agents / `repoos.toml`), not the `"default"` sentinel, unless the PM is genuinely configured as `default`.
2. **Stop the CLI-change watcher from wiping a just-initialized (or deliberately set) pin** on the empty→value transition used by init. Prefer recalling per-CLI memory (`useModelMemory` / `AgentModelModal.resolveModelForCli`) on real user CLI switches, consistent with #0342 / #0360 — do not blindly take `modelsFor(cli)[0]`.
3. **Audit sibling watches** in `TaskDrawer.vue` (Dev / Review / PM override drafts) for the same wipe-on-init class.
4. **Layout:** put the New task close control in the upper-right, matching task detail. Apply the same fix to New doc / New skill while touching drawer headers (same bug, same pattern).

Out of scope unless trivial while here: renaming the sentinel label ("Default" → "CLI default") — optional polish, not required to close this task.

## Acceptance criteria

- [ ] With PM configured as `opencode` + a concrete model id, opening **New task → Freeform** shows `opencode + <that model id>` (via `labelForModel` / raw id), **not** `opencode + Default`.
- [ ] If the PM is intentionally configured as `model = "default"`, the control may show Default — that is correct.
- [ ] Changing CLI in the New task picker still restores a remembered pin when one exists (#0342 / #0360); a true reset to Default still surfaces the existing reset notice when a real pin was discarded.
- [ ] Creating a freeform task without touching the picker does **not** mark the override as custom solely because init wiped the model to `"default"`.
- [ ] New task × is upper-right, aligned with task detail / Tunnel drawer.
- [ ] New doc and New skill × match (same header pattern).
- [ ] Regression coverage: unit/component test that `initFreeformOverrides` (or opening the New task drawer with a mocked PM pin) leaves `model` equal to the PM pin after a tick — i.e. the watch race cannot wipe it.
- [ ] `repoos check` green.

## Implementation notes

- Primary files: `src/ui-app/src/components/TaskDrawer.vue` (init + watches + New task header), `NewDocPanel.vue` / `NewSkillPanel.vue` (close layout), possibly `style.css` if introducing a shared `.drawer-head-title { flex: 1 }` instead of inline styles.
- Related prior art: #0342 / #0360 (`useModelMemory`, `AgentModelModal`), `isModelOverridePinned` in `src/server/agents.ts`, freeform override handling in `src/server/routes/tasks.ts` (~L231–257).
- Do **not** "fix" this by changing the PM's Agents entry unless the human actually wants a different model — the display bug is the task.

## Original prompt

when I open the "New task" panel why does it show the agent as "opencode + Default". I thought we should always show the actual model name? or is "Default" actually a model name being set somewhere (in agents panel or repoos.toml) that I need to change to another model? also on the New Task panel the close button should be in the upper right corner, like the other panels (e.g. task detail panel).

## Activity

- 2026-09-18T03:42:22Z · created · hello@repoos.org
- 2026-09-18T03:45:22Z · pm_cli_override, pm_model_override
- 2026-09-18T03:45:39Z · pm_cli_override
- 2026-09-18T03:45:40Z · pm_cli_override
- 2026-09-18T03:45:42Z · pm_cli_override
- 2026-09-18T03:45:44Z · pm_cli_override
- 2026-09-18T03:45:52Z · pm_model_override
- 2026-09-18T03:46:28Z · pm_model_override
- 2026-09-18T03:48:43Z · title, area, type, body
- 2026-09-18T03:50:19Z · model_override
- 2026-09-18T03:50:22Z · status draft→inbox
- 2026-09-18T03:50:23Z · status inbox→ready
- 2026-09-18T03:50:30Z · review_cli_override, review_model_override
- 2026-09-18T03:50:37Z · review_cli_override
