# Mobile web design audit (#1146)

## Scope and method

Rendered app captures were reviewed at **390 × 844 CSS px** in light mode and
selected dark-mode routes. The reviewed surfaces include Mission Control,
Work, task detail, Search, More, Settings, Stories, Releases, Agents, Checks,
Inputs, Context, Deployments, Secrets, Dev and the client board. Task detail
used `/work?task=1146&tab=changes`; Search and More were inspected as overlays.
Capture files were kept in the task worktree under `.repoos/audit-1146/` and
the focused findings below were attached to their RepoOS follow-up tasks.

This is browser-rendered evidence for the stated viewport, not certification on
physical iOS or Android devices. The sampled page roots fit the viewport width,
and sampled visible controls were at least 40px high. Those checks do not catch
internal clipping or content compressed into unusable columns, which appeared
in the task detail and Checks screens.

## Prioritized findings

| Priority | Route and viewport | Finding and user impact | Evidence / disposition |
| --- | --- | --- | --- |
| P1 | `/work?task=1146&tab=changes`, 390 × 844, light + dark | Task title, identifiers, status and actions share a cramped header; the task tabs continue beyond the viewport. Preview-target helper text wraps one word at a time beside the selector, consuming substantial height. Users have difficulty scanning task identity and reaching the full set of detail tabs. | `.repoos/audit-1146/03-work-task-1146-tab-changes.png`, `dark-task.png`; follow-up #1147 |
| P1 | `/settings`, 390 × 844, light + dark | A six-item settings section grid is followed by a second long row-wrap of topic chips before the selected content. Repeated navigation consumes the first screen and makes the hierarchy unclear. | `.repoos/audit-1146/07-settings.png`, `dark-settings.png`; follow-up #1148 |
| P2 | `/checks`, 390 × 844, light + dark | The long introductory paragraph sits beside two actions in a narrow column. The copy breaks into short lines and the actions lack a clear position in the mobile reading order. | `.repoos/audit-1146/08-checks.png`, `dark-checks.png`; follow-up #1149 |
| P2 | `/stories`, 390 × 844, light + dark | Story summaries and nested task titles truncate early. Progress and status remain visible, but the labels do not always identify the underlying work without opening each story. | `.repoos/audit-1146/04-stories.png`, `dark-stories.png`; follow-up #1150 |
| P2 | `/`, 390 × 844, light | Mission Control title and repository address are centered while the New task action is right aligned. This differs from the left-aligned page pattern and gives the technical URL more prominence than the primary action. | `.repoos/audit-1146/01-control.png`, `15-control-light.png`; retain for a later focused task |
| P3 | Search overlay, 390 × 844, dark + light | The placeholder approaches the close affordance and appears clipped. Verify with a long entered query before changing the field layout; current evidence is insufficient to establish a functional obstruction. | `.repoos/audit-1146/search-overlay.png`, `16-search-dark.png`; monitor |
| Existing work | More sheet and Work, 390 × 844 | More sheet allows underlying page content to show through; the idle integration status pill competes with the page and bottom navigation. | `more-sheet.png`; explicitly covered by #1145, no duplicate filed |

## Route sweep notes

| Surface | Route / state reviewed | Observation |
| --- | --- | --- |
| Mission Control | `/` | Fits width; title and repo URL alignment differ from other page headings. |
| Work queue | `/work` | Single-column queue is readable in the captured populated state; long task titles wrap. Idle integration chrome is tracked by #1145. |
| Task detail | `/work?task=1146&tab=changes` | Header density and tab clipping; see P1. |
| Search | Search overlay | Field and close control fit; placeholder requires a longer-query state check. |
| More | More sheet | Background opacity issue belongs to #1145. |
| Settings | `/settings` | Repeated section navigation delays access to settings content; see P1. |
| Stories | `/stories` | Long labels truncate; see P2. |
| Releases | `/releases` | Status and branch warning remain readable; warning wraps over several lines, appropriate to its importance. |
| Agents | `/agents` | Secondary tabs and a long error notice add density; active tab and notice remain legible in the sampled state. |
| Checks | `/checks` | Intro/action composition is cramped; see P2. |
| Inputs | `/inputs` | Rendered within viewport in sampled state. |
| Context / Repo | `/repo` | Rendered within viewport in sampled state. |
| Deployments | `/deployments` | Rendered within viewport in sampled state. |
| Secrets | `/secrets` | Auth-less preview lacks signed-in secret data; this is a preview limitation, not a layout finding. |
| Dev | `/dev` | Rendered within viewport in sampled state. |
| Client board | `/client-board` | Rendered within viewport in sampled state. |

The sweep includes both light and dark samples for core pages, task detail,
Settings, Stories, Releases, Agents, Checks and Repo/Context. Additional
secondary states such as long typed Search queries, 320px-wide devices, and
signed-in Secrets data should be checked when their follow-ups are implemented.

## Cross-page patterns and recommendations

1. **Design mobile hierarchy inside the page, not only in the global frame.**
   The shell and bottom navigation are consistent, but page-specific title,
   intro, action and tab regions still assume desktop horizontal space.
2. **Prevent local overflow and compression.** A page can fit the viewport
   while its tab strip clips or a helper label collapses into one-word lines.
   Give tab strips a deliberate scroll/fade affordance or a compact alternative;
   stack helper text and controls when a side-by-side layout becomes too narrow.
3. **Show one navigation layer at a time.** Settings should prioritize section
   choice and the active content, rather than presenting a section grid and a
   second topic index in sequence above the controls.
4. **Preserve identity in dense lists.** Use enough title width or a secondary
   line so long story/task names distinguish records without opening each row.
5. **Keep page heading alignment consistent.** Use the same content edge for
   title and primary action; demote technical repository metadata when it is
   not needed for the immediate decision.

No UI implementation was made in this audit. The four substantial page-level
findings have focused tasks (#1147–#1150); Mission Control and Search remain
lower-priority recommendations for future work. The More sheet and idle
pipeline findings remain in #1145's scope.
