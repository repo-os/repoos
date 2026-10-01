# The rendered contrast audit (#0596)

Build context for RepoOS's **rendered** contrast gate — what it measures, why
it exists next to `theme-contrast`, and what #0596 triaged. User-facing setup
lives in `user-docs/check.md`; this page is for whoever touches the audit or
its fallout.

## Why a second contrast guard

`[[check.contrastPairs]]` measures nine *named token pairs* per theme scope.
That is a whole-app invariant, and it is blind to anything a component does
itself: a scoped `<style>` block that sets `background: rgba(255,255,255,0.04)`
and `color: #c9d1d9` overrides the tokens entirely, and renders near-white on
near-white in every light theme. That exact bug shipped in the task drawer's
Changes-tab file header and went unnoticed until someone eyeballed a light
theme (#0596's motivating example). No token-pair check can see it — only
rendering can.

So there are now two halves:

| | `theme-contrast` (static) | rendered audit (this doc) |
| --- | --- | --- |
| Input | the stylesheet, the token vocabulary in `repoos.toml` | the built app in headless WebKit |
| Measures | declared token pairs + gradient tokens | every visible text node, as composited |
| Sees component hard-coding | no | yes |
| Cost | ~0s | ~9–14s (measured on mini) |
| Config | `[check]` vocabulary | same `[[check.themeScopes]]`, plus `[[check.contrastExempts]]` |

The static half's companion is the `hardcoded-colors` **source guard** (a
`kind` step): it flags `#hex`/`rgba(255,…)` literals in component `<style>`
blocks unless the rule carries `/* hardcode-ok: <reason> */`. The rendered
audit catches what is already on screen; the source guard stops the next
regression at the source.

## How the rendered audit works

Entry point: `bun run contrast:audit` → `scripts/ui-contrast-audit.mjs` →
`cmdContrastAudit()` in `src/commands/ui-contrast-audit.ts`. It shares the
server + headless-WebKit harness with the smoke test (`ui-harness.ts`) and
boots a throwaway fixture repo: two tasks, and a **real git repo with one
uncommitted change** so the drawer's Changes tab renders actual file rows.

1. **Scopes come from `[[check.themeScopes]]`** — the same list the static
   guard checks, so the two can never drift. Each scope selector is decoded
   into `<html data-ui-theme>` / `data-theme` attributes
   (`scopeAttributes()`).
2. **Screens**: dashboard, board, drawer (Task/Changes/Tokens/Review/PM tabs),
   Agents, Settings, Context/Docs, the new-task drawer, and a raised toast.
   Navigating once per screen, then flipping the theme attributes for every
   scope, keeps the whole matrix at ~10s.
3. **The probe** (`contrastProbe`, serialized into the page — it must stay
   self-contained, no module-scope references) walks every visible text node
   under the open dialog (or the body), and records: computed `color`, the
   backdrop as an ordered layer list (image then colour per element, stopping
   at the first opaque colour), font size/weight, and accumulated opacity.
4. **The judge** (`judgeSample`, Node-side so it is unit-tested) folds those
   layers bottom-up and measures the worst ratio against the WCAG floor:
   **4.5:1 body text, 3:1 large text** (≥24px, or ≥18.66px bold).

### Deliberate judgment calls

- **Gradients are judged on their worst stop** — the same convention
  `user-docs/check.md` documents for the static guard. This app's `body` and
  the task drawer both paint with gradients; skipping gradient-backed text
  (the naive reading of "report images as unchecked") would have blinded the
  audit exactly where the Changes-tab bug lives, and would have left the
  acceptance criterion unmeetable. Multi-layer gradients branch: every
  stop-combination is evaluated, the worst decides.
- **Only raster images (`url(…)`) and `background-clip: text` report as
  *unchecked*** — no DOM value can say what pixel sits behind them. The
  gradient-clip case is the hypercolor animated wordmark.
- **WCAG's incidental exceptions are honoured**: `:disabled` /
  `aria-disabled` components (this app's `disabled:opacity-50` buttons were
  ~45 of the first run's failures — correct behaviour, not a bug) and
  fully-transparent text (a toast mid-entrance measured fg == bg).
- **`color(srgb …)` must be parsed with its alpha.** WebKit serializes
  `color-mix()` computed values that way; a legacy `rgba()`-only match reads
  them as opaque, truncates the chain and composites the rest over white —
  phantom "light background in a dark theme" failures. That bug was the single
  most confusing hour of #0596; the unit tests now pin the format.
- **Theme flips race the app's async config load — and its 200ms cross-fade.**
  `index.html` sets `data-theme` pre-paint but nothing sets `data-ui-theme`
  until the config store's `load()` resolves — so the audit waits for that
  attribute as a barrier before flipping, and writes `localStorage` alongside
  the attributes so both application paths converge. That one-time barrier is
  not enough on its own. The Node-side flip and the probe are two separate
  `page.evaluate` round trips, so a config-store apply that lands between them
  could leave the page half-flipped — dark text on a light card — and report
  failures no run reproduces. And `--txt-faint` is a custom property that never
  itself transitions, so the attributes can look settled in ~3 frames while the
  app's `theme-anim` `transition` (200ms) is still mid-fade, letting a probe read
  a color between themes. #0617 closes both windows:
  - the audit's motion freeze uses **`transition: none !important`** (not just a
    zero duration), so a scope flip is instant and no cross-fade can be sampled;
  - `settleScopeInPage` re-asserts the scope on every animation frame until the
    `<html>` attributes and the resolved `--txt-faint` are stable for two
    consecutive frames **and** `document.getAnimations()` reports no running CSS
    transitions (it waits out any fade that started before the freeze, bounded at
    ~2s, and warns if transitions never settle); and
  - `contrastProbe` re-asserts the scope inside its own evaluate, finishes any
    still-running transition, and forces a synchronous style flush, so the flip
    and the reading happen in one task with no interleaving.
- **One bar for everything: WCAG AA.** Faint/dim tokens that landed at
  2.6–4.0:1 were *raised*, not exempted — the audit measures the same floor
  everywhere so an exemption stays meaningful.

## The allowlist

`[[check.contrastExempts]]` rows (`selector` + `reason`, both required — a row
without either is dropped by the parser) or a `data-contrast-ok` attribute on
the element/ancestor. Exemptions live here, centrally, never as scattered
ignores in component styles.

One entry exists today: `.board-col.collapsed .col-label/.col-cap-count` —
text layered on the per-column status band, a gradient whose colour varies by
column and fades down the capsule, so no single colour clears 4.5:1 along its
whole length (the count already picks its own per-band colour in
`BoardColumn.vue#barTextColor`). **Redesigning that capsule is the open
follow-up**; until then the exemption's reason is the contract.

## What #0596 changed in the product

The audit's first full run found 462 failing pairs across all 14 scopes (7
themes × light/dark). Triage:

- **Tokens raised** (mechanically, by solving for the measured worst
  background with the same math the audit uses): `--txt-faint` in every theme
  block (the dominant cluster — 60%+ of failures), `--txt-dim` once, and the
  light-scope accents (`--cyan`/`--green`/`--amber`/`--red`/`--violet`/
  `--primary`/`--ring`/`--accent-foreground`/`--btn-new-color`/…).
  **Catppuccin is generator-owned** (`style.css` must be exactly what
  `scripts/gen-catppuccin-theme.mjs` emits), so Latte's fixes went into the
  generator as `latteWcagOverrides()` — solved against Latte `surface1`, the
  darkest surface its text renders on — and the block was regenerated, never
  hand-edited. Mocha keeps the canonical palette.
- **Component fixes**: `.copyable-number` focus/hover used `var(--accent)` —
  a translucent tint — as *text* colour, i.e. contrast 1.00; now
  `--accent-foreground`. `.canary-egg`'s count was `--txt-faint` at `opacity:
  0.45` (1.5–2.9:1 in light themes); now `--txt` at `0.85`, keeping the fade.
  The Changes-tab diff badges/deltas used hard-coded `#ffc107`/`#4ef0a8`/
  `#ff6b6b`; now `--amber`/`--green`/`--red` + their tints.
- **gruvbox-light accent buttons**: no single text colour clears 4.5:1 across
  that mid-luminance gradient (`#b57614`→`#af3a03`), so the first stop was
  darkened to `#8a5809` and the cream text kept.
- **Exempted**: the collapsed-column band label (above).

**Known follow-ups** (worth separate tasks, not blockers):
1. Redesign the collapsed-column capsule so its label can be exempted *and*
   readable (see above).
2. Convert `hardcode-ok`-annotated literals in component styles to tokens over
   time — the annotations are honest triage, not a blessing.
3. Widen screen coverage (fullscreen `DiffView`, release/deployment pages).

## Running it

```bash
bun run contrast:audit     # ~9–14s; exit 1 lists every offender with
                           # theme, screen, selector, fg/bg, ratio, need
```

`repoos check` runs it as the `rendered-contrast` step (`whenChanged =
src/ui-app/**`; full profile, so close-out always runs it). It skips with
install advice when Playwright/WebKit is missing, exactly like the smoke step.

Acceptance check you can re-run in a minute: add
`color: #c9d1d9; background: rgba(255, 255, 255, 0.04);` to
`.diff-file-name` in `TaskDrawer.vue`, rebuild, and the audit fails with
`#c9d1d9 on #ffffff = 1.54` across seven light scopes — the original bug,
caught.
