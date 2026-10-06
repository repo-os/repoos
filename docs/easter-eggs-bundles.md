# Easter-eggs bundles: landing many small fixes in one task

Written 2026-10-06, out of the first agent-driven project run (opex). #0721 is
the worked example.

A long agent-driven run keeps turning up small, independent, low-risk fixes:
a cosmetic glitch, a stale bit of copy, a timing race in a test, a tiny
UI/data-source correction, a docs follow-up. The temptation is to hotfix each
one straight onto `main`, or to file one tiny task per fix. Both are wrong for
the same reason.

## Why bundle

Every task costs the same fixed overhead regardless of how small the change is:

- **One worktree** and its branch.
- **One `repoos check` run** — minutes of build, typecheck, tests and the
  headless UI smoke test.
- **One review** by a second agent, and possibly a round of review fixes.
- **One close-out** — merge, full gate, and a server reload that briefly takes
  the control plane down. During that window nothing else should start.

So ten one-line fixes filed as ten tasks cost ten times that overhead, and ten
close-out reloads. A bundle pays it once. That is the whole point: `N` items,
`1` worktree, `1` gate run, `1` review, `1` close-out.

Hotfixing straight to `main` is not the alternative. `AGENTS.md` already says
agents never commit to `main` on their own initiative: the branch, the gate and
the review are what make a change safe to land, and a direct commit skips all
three. A stray hand commit on `main` blocks every close-out behind it until it
is fixed. The bundle is how you get the *small* change through the normal,
safe path without paying the per-task overhead per item.

## What qualifies

Small, independent, low-risk, and unrelated to each other except by theme:

- cosmetic and layout fixes;
- copy and wording;
- test-race hardening and test flakiness;
- tiny UI or data-source corrections;
- docs follow-ups a review asked for.

If an item needs a design decision, changes behaviour an acceptance criterion
covers, or could destabilize a subsystem, it is not an easter egg — give it its
own task so it gets its own review attention.

## Rules of thumb

- **3–6 items.** Below that, the overhead saved is marginal; above it the bundle
  becomes hard to review and one failing item blocks too much.
- **One area family.** Keep the bundle inside one area (all `web`, or all
  `server`), so the gate's changed-path selection stays relevant and the diff
  reads as one story.
- **p2/p3.** An easter-egg bundle is not urgent; it is the work you run while a
  big task soaks in review or waits on a dependency, not the work that
  road-blocks one.
- **Never fold easter eggs INTO a release-critical or machinery task.** The big
  task's whole job is to land; a trivial cosmetic item failing its check would
  hold the important change hostage. Keep the bundle separate.
- **Commit per item.** One commit per fix keeps the review readable and makes a
  single problematic item trivial to drop or revert.
- **Mark sources superseded.** Each item records the task it came from; when the
  bundle lands, mark those source tasks superseded so nothing is re-implemented
  later.

## The task template

Create the task with `repoos new` (or the New-task drawer), title it
`Easter eggs bundle: <themes>`, and shape the body like #0721:

- **Problem** — one line naming it as a bundle, then a numbered list of the
  items. Each item: its source task id, the one-line fix, and where the change
  lives.
- **Desired UX** — each item behaves as its own source task describes; no
  behaviour change beyond that.
- **Acceptance criteria** — one test per item, plus `repoos check` passes, plus
  the list of source tasks to mark superseded.
- **Notes for AI** — keep each item small and separate in commits; do not touch
  the subsystems or tasks the bundle deliberately excludes.

## Worked example

#0721 — "Easter eggs bundle: stuck-timer source, needs_input clear on new run,
stale provider balance, agent-review test races":

- **Problem** lists four items from the 2026-10-06 run, each with a source task
  id (#0719, #0716, #0707, and a test-race item) and the fix.
- **Acceptance criteria** asks for one test per item and says to mark #0719,
  #0716 and #0707 superseded when done.
- **Notes for AI** says "keep each item small and separate in commits; do not
  touch the degenerate detector (#0718) or remote validation (#0717)."

Four fixes, one worktree, one gate run, one review, one close-out.
