# Mobile web design audit (#1146)

## Scope and method

I inspected the auth-less worktree app at **390 × 844 CSS px** with touch emulation. Routes covered `/login`, `/`, `/work`, `/work?task=1146&tab=changes`, `/stories`, `/releases`, `/agents`, `/settings`, `/checks`, `/inputs`, `/repo`, `/deployments`, `/secrets`, `/dev`, `/client-board`, `/tasks/1146/diff`, `/tasks/1146/conflict-diff`, `/repo/working-diff` and `/repo/commits/075b3cf1d`. I opened Search and More and sampled long task/story text, release status, empty Checks and diff states. Mission Control, Search and principal page families were inspected in both themes.

The document records only rendered findings. Captures cited below are RepoOS task attachments, so they remain available with the report; no evidence depends on ignored worktree files. These browser captures are evidence for the stated viewport, not certification on physical iOS or Android devices.

**Touch-target method:** I measured visible buttons, links, form controls and tabs against the **44 × 44 CSS px** floor. Sampled controls on all regular pages and both sheets meet it after the Search adjustment below. All four full-screen diff routes share a **76 × 28px Back control**; #1151 tracks the 16px height deficit. This corrects the earlier 40px threshold.

**Contrast method:** Computed foreground/nearest-surface pairs for visible headings, body text, links, buttons and labels on Mission Control, Work, task detail, Stories, Settings, Checks and DiffView were at least **4.5:1** in both themes. This DOM-color sample does not certify every icon or status tint. The More backdrop visibly reveals content beneath it; #1145 owns that issue.

## Prioritized findings

| Priority | Route and viewport | Finding and user impact | RepoOS evidence / disposition |
| --- | --- | --- | --- |
| P1 | `/work?task=1146&tab=changes`, 390 × 844, light + dark | The tab strip clips and preview-target helper copy wraps one word at a time. **Title/header alignment is excluded**; #1145 owns the shifted title. | [Task detail light](</api/tasks/1146/attachments/att_3288185f-f19a-4c49-a9e4-cc1bfaa02ae5.png>), [dark](</api/tasks/1146/attachments/att_6efc7e54-a9fb-4e32-97f0-b723de9fad9b.png>); #1147 covers tabs/helper only. |
| P1 | `/settings`, 390 × 844, light + dark | A six-item section grid is followed by a second row-wrap of topic chips before settings content, consuming the first screen. | [Settings light](</api/tasks/1146/attachments/att_f71233b1-a5a3-42ee-93b8-6c567d554094.png>), [dark](</api/tasks/1146/attachments/att_17240e43-207b-4a19-9e85-6bf5c75131ad.png>); #1148. |
| P2 | `/checks`, 390 × 844, light + dark | A five-line intro and two actions squeezed into a side column compete with the tabs. | [Checks light](</api/tasks/1146/attachments/att_e7d4d69a-496d-4efc-b2ae-4b78510123d2.png>), [dark](</api/tasks/1146/attachments/att_558a7105-b050-4b2f-889a-db6879b7231f.png>); #1149. |
| P2 | `/stories`, 390 × 844, light + dark | Truncated story summaries and task names obscure record identity even though progress/status remain visible. | [Stories light](</api/tasks/1146/attachments/att_ca5230a8-67ed-4111-a63a-dc2b49211151.png>), [dark](</api/tasks/1146/attachments/att_6df36a4a-1683-4c03-822c-650e4cb21f64.png>); #1150. |
| P2 | `/tasks/:taskId/diff`, `/tasks/:taskId/conflict-diff`, `/repo/working-diff`, `/repo/commits/:sha`, 390 × 844, light | The shared full-screen DiffView Back control measures 76 × 28px. Its height is 16px below the 44px touch-target floor. The captured routes rendered the empty “No diff available” state, so diff content density was not assessed. | [Task diff](</api/tasks/1146/attachments/att_70c63801-e82f-43d3-8177-b29236a23138.png>), [conflict diff](</api/tasks/1146/attachments/att_07cb3d3a-2d5c-47bd-bd7a-72f4ccb8d5c8.png>), [working diff](</api/tasks/1146/attachments/att_be523a58-813a-4672-bd5b-600336d1c301.png>), [commit diff](</api/tasks/1146/attachments/att_ad8c5752-83b7-4790-a754-6c41baa7caa2.png>); follow-up #1151. |
| P2 | Mission Control `/`, 390 × 844, light + dark | Centered title/URL and right-aligned New task differ from other page headings. **#1145 owns this alignment.** | [Light](</api/tasks/1146/attachments/att_c86d65fc-dbee-4e0f-b33d-11ef27b6c373.png>), [dark](</api/tasks/1146/attachments/att_4886c697-7e10-4a40-b77a-87214da01776.png>); #1145. |
| Fixed in this audit | Search overlay, 390 × 844, light + dark | The search input initially measured 240 × 36px. I added a 44px mobile minimum height; after rebuilding it measures 240 × 44px, and the close target is 44 × 44px. | [Search overlay dark](</api/tasks/1146/attachments/att_91b39c22-9ce0-4507-8b6f-abb238f8bf62.png>), [Search overlay light](</api/tasks/1146/attachments/att_d2841e59-395c-4ce8-b86d-cdc50b6cb2df.png>); `src/ui-app/src/style.css`. |
| Existing work | More sheet and Work bottom overlay, 390 × 844 | Underlying content shows through the More sheet; the idle integration pill competes with the bottom navigation. | [More sheet](</api/tasks/1146/attachments/att_4d736d97-d652-4d02-923d-326a3c3e4822.png>); #1145. |

## Route sweep notes

| Surface | Route / state | Observation |
| --- | --- | --- |
| Login | `/login` | Standalone login route rendered within 390px; no sampled control was below 44 × 44px. [Capture](</api/tasks/1146/attachments/att_47b0da96-5bb2-49fc-a122-0527f9c01b53.png>) |
| Mission Control | `/` | Fits width. Heading alignment is assigned to #1145. Light and dark captures attached above. |
| Work queue | `/work` | Single-column queue is readable in the populated state; long titles wrap naturally. Idle pipeline overlay belongs to #1145. |
| Task detail | `/work?task=1146&tab=changes` | Tab clipping and helper text wrapping; see P1. Title/header work belongs to #1145. |
| Search | Overlay on `/` | Input was 36px high; now 44px. Search field and close target meet the floor. [Dark capture](</api/tasks/1146/attachments/att_91b39c22-9ce0-4507-8b6f-abb238f8bf62.png>), [light capture](</api/tasks/1146/attachments/att_d2841e59-395c-4ce8-b86d-cdc50b6cb2df.png>) |
| More | Sheet on `/work` | Sheet actions meet the floor; backdrop readability issue belongs to #1145. |
| Settings | `/settings` | Repeated section navigation delays access to controls; see P1. |
| Stories | `/stories` | Several long labels truncate; see P2. |
| Releases | `/releases` | Status and branch warning remain readable; warning wraps over several lines, appropriate to its importance. |
| Agents | `/agents` | Secondary tabs and a long notice add density; sampled labels remain legible. |
| Checks | `/checks` | Intro/actions composition is cramped; see P2. |
| Inputs | `/inputs` | Rendered within viewport in sampled state. |
| Context | `/repo` | Rendered within viewport in sampled state. |
| Deployments | `/deployments` | Rendered within viewport in sampled state. |
| Secrets | `/secrets` | Auth-less preview lacks signed-in secret data; this is a preview limitation, not a layout finding. |
| Dev | `/dev` | Rendered within viewport in sampled state. |
| Client board | `/client-board` | Rendered within viewport in sampled state. |
| Task diff | `/tasks/1146/diff` | Empty state; Back is 76 × 28px. |
| Conflict diff | `/tasks/1146/conflict-diff` | Empty state; Back is 76 × 28px. |
| Working diff | `/repo/working-diff` | Empty state; Back is 76 × 28px. |
| Commit diff | `/repo/commits/075b3cf1d` | Empty state; Back is 76 × 28px. |

## Cross-page patterns and recommendations

1. **Page-local layouts still assume desktop width.** The shell and bottom navigation are consistent, but headers, intro/action groups and tab strips need their own phone hierarchy.
2. **Measure touch targets at their rendered bounds.** A route can have no page-level overflow and still expose short controls. Use 44 × 44px as the shared floor; the shared DiffView Back control needs correction.
3. **Prevent local clipping and compressed copy.** Make tabs reachable with a deliberate scroll affordance or compact alternative; stack helper text and controls when the side-by-side layout becomes too narrow.
4. **Show one settings navigation layer at a time.** Prioritize section choice and active controls over repeated navigation above the fold.
5. **Preserve identity in dense lists.** Give long story/task names enough room or a clear expansion affordance.
6. **Keep heading alignment consistent.** Mission Control alignment is included in #1145; task detail title alignment is also owned there.
7. **Check contrast and overlay opacity across themes.** The sampled text pairs pass 4.5:1 in both themes. The More sheet backdrop remains the known exception under #1145.

The Search input is the only small cohesive implementation in this audit. The remaining substantial issues have focused tasks (#1147–#1151); the title alignment, Mission Control alignment and More/pipeline overlays remain with #1145.
