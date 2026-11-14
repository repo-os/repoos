# ADR 0011: Purpose-built mobile web UI

- **Status:** Accepted
- **Date:** 2026-11-14
- **Decision owners:** Product direction from Nick; implementation split into follow-up tasks

## Context

RepoOS currently serves its desktop SPA on phones and relies on scattered
`max-width` rules to squeeze dense desktop surfaces into a narrow viewport.
That leaves the Work board, task drawer and secondary pages with desktop
information density and pointer-oriented controls. The connected-server UX in
[`mobile-ux-strategy.md`](../mobile-ux-strategy.md) describes a second native
screen composition. The Capacitor host architecture in
[`mobile-architecture.md`](../mobile-architecture.md) remains valid: it
provides the multi-server picker, lock screen, and isolated WebView security
boundary. **This ADR supersedes only the connected-server shell and mobile
screen-composition direction in the UX strategy.**

The direction is deliberately incremental. The first follow-up tasks build a
responsive navigation shell within the server-served web app, a Work queue,
task detail, Settings and touch affordances. This ADR and those task specs do
not change runtime behavior or replace the Capacitor host shell.

## Decision

### One SPA, distinct compositions

Keep one Vue SPA, router, authentication flow, stores, API clients and task
mutations. Select purpose-built mobile page compositions at a viewport
breakpoint; do not fork the app, deploy a second mobile bundle, or infer the
layout solely from touch capability. A small layout composable should expose a
reactive `isNarrow` value based on `matchMedia` and be shared by the app shell
and routed views.

Use **720 CSS px** as the initial composition boundary. Below it, the
server-served SPA renders its mobile navigation and mobile-specific views under
`src/ui-app/src/views/` and `components/`; at and above it, preserve the
existing desktop composition. This same narrow-screen web UI must work in a
plain phone browser, inside the Capacitor shell's isolated WebView, and as an
installed home-screen web app. The native host continues to select and isolate
servers; it does not provide a second connected-server screen composition.
Touch-capable laptops and tablets keep the desktop layout when wide enough.

At **768 px tablet width**, use the desktop composition with the existing
responsive rules and allow its normal tablet adaptations. This avoids an abrupt
phone navigation model on landscape tablets and compact laptop windows. The
720 px threshold is an initial product boundary, not a device classifier;
future evidence may tune it without changing the one-SPA architecture.

### Navigation and page model

Inside the server-served SPA on narrow screens, use a persistent
four-destination bottom navigation:

1. **Work** — default, primary task queue.
2. **Search** — existing search destination, sized for touch.
3. **More** — opens secondary destinations such as Agents, Context, Activity
   and Releases where configured.
4. **Settings** — settings pages.

More is a menu/sheet, not a fifth tab. Route changes remain URL-addressable and
browser Back returns through page history. Opening a task from Work uses a
mobile detail page or bottom sheet; it must retain the queue's filters, sort
and scroll position on return. Use existing stores and mutations. Any new
floating layer follows shared dialog conventions, including body teleportation
and `data-overlay-layer`.

The mobile Work page is a single-column queue with readable cards, compact
filter/sort controls and a prominent New task action. Mobile pages must have
no horizontal page scroll, no hover-only actions, and touch targets sized for
comfortable use. Desktop remains unchanged.

### Existing responsive CSS

Keep responsive rules that provide useful adaptations within the desktop
composition, including tablet layouts, overflow containment for genuinely wide
content, and shared safe spacing. As each mobile composition lands, remove or
retire narrow-screen overrides that merely compress desktop columns, hide
desktop chrome without replacing its navigation, shrink controls, or depend on
hover. Do not perform a global CSS cleanup ahead of those replacements. The
follow-up work should inventory each affected selector and remove obsolete
rules alongside the mobile component that supersedes them. Preserve the
desktop and 768 px tablet behavior.

## Current UI inventory

The current UI was captured through `repoos shot` at **390×844** and
**768×1024** for Work, task detail, Settings, Releases and the dashboard's
Live activity feed (`/`, since Activity has no standalone route). The captures
are stored with task #1110 as the baseline for the follow-up slices. These
screens share the following concrete design constraints and risks:

- **Work:** its multi-column board and dense status columns compete for the
  narrow viewport; task metadata and column controls can wrap or compress, and
  card actions include hover/focus affordances that are not discoverable by
  touch alone.
- **Task detail:** the desktop drawer shares space with the board and can leave
  the task content squeezed at phone width; dense tab/action rows and small
  close or icon controls are difficult to use one-handed.
- **Settings:** desktop navigation plus a multi-column label/control layout
  consumes width; long configuration values and grouped controls risk cramped
  labels and horizontal overflow.
- **Releases:** wide release metadata and action groups rely on desktop spacing;
  status and action controls may become crowded or require pointer hover.
- **Activity feed:** the dashboard's live event list shares space with other
  dashboard panels instead of owning a focused phone destination; event
  metadata and timestamps can wrap into narrow fragments.

These are design risks to validate against the saved baseline images, not a
claim that every listed page exhibited every failure at both viewport sizes.
Follow-up implementation should test document-level horizontal overflow,
minimum touch target size, and visibility of every action at phone width.

## PWA install basics

PWA support is an install layer over the same web app, not a separate client.
Keep the app usable in a plain browser whether or not it is installed. Add or
maintain a valid web app manifest with RepoOS name, icons, `start_url`, `scope`
and `display: standalone`; provide appropriate theme/background colors and
mobile viewport metadata. Serve the app over HTTPS in production. Test the same
layout in a phone browser, standalone home-screen install, and the Capacitor
shell's isolated WebView. The Capacitor server picker and security boundary
remain governed by mobile-architecture.md. Offline task mutations, background
sync, and push notifications are not part of this decision.

## Follow-up task plan

The RepoOS tasks filed with this ADR are ordered by dependency:

1. **#1112** — web app mobile navigation and bottom navigation (layout
   composable and route shell; distinct from the Capacitor host shell).
2. **#1113** — single-column Work queue, dependent on the shell.
3. **#1114** — mobile task detail page/sheet, dependent on the queue.
4. **#1115** — mobile Settings composition, dependent on the shell.
5. **#1116** — touch and narrow-screen affordances across existing surfaces,
   including integrating the completed #1069 recency-trigger touch behavior
   where needed.

Each task is intended to fit within one engineering day and has its own
acceptance criteria. No follow-up implementation is included here.

## Existing task disposition for Nick

- **#0300 — keep:** native testing remains relevant to the Capacitor server
  picker, lock screen, WebView isolation, and platform lifecycle. Extend its
  browser coverage to the same narrow-screen web UI where useful.
- **#0302 — rewrite or close:** remove the proposed second native
  connected-server shell and Ionic screen compositions. The web app owns its
  narrow-screen navigation; preserve picker/host responsibilities under the
  existing mobile architecture rather than duplicating them here.
- **#0303 — rewrite or close:** its single-column Work and detail UX can be
  rewritten for the server-served SPA and shared stores; close it if #1113 and
  #1114 fully replace its intended scope.
- **#0304 — rewrite or close:** per-server sessions may still matter to the
  Capacitor host's isolated server picker, but the connected server's mobile
  screen composition belongs to its own web UI. Keep only host/session
  requirements that remain distinct from ordinary browser sessions.

These are recommendations only. **Do not change #0300, #0302, #0303 or #0304**
as part of this ADR task. The native picker and WebView isolation remain in
scope; #1112–#1116 cover the shared server-served web experience.

## Consequences

- Mobile-specific UI work remains in the main web application and shares its
  data and behavior with desktop.
- The desktop composition remains the reference above 720 px; 768 px tablets
  retain desktop navigation and tablet responsive rules.
- The connected-server sections of the mobile UX strategy point to this
  decision; the mobile architecture document remains valid for the native host
  picker, lock screen, and WebView isolation.
- The old scattered responsive rules are retired incrementally as replacement
  compositions ship, reducing risk to desktop and tablet layouts.
