# System resource pressure states QA (2026-11)

## Scope

Checked the Control dashboard resource panel and `repoos stats` pressure summary for normal, warning, and critical readings. Synthetic fixtures use stable machine, swap, compressor, available-memory, paging, and heavy-job values so each state can be compared at the same viewport sizes.

## State behavior

| State | Dashboard explanation | Guard meaning |
| --- | --- | --- |
| Normal | No pressure signal is holding work; swap and compressor are context. | No pressure hold. |
| Warning | Warning is advisory; no hold is active. The warning detail identifies elevated swap/compressor use. | Occupancy warnings alone do not hold starts. |
| Critical | New work waits for blocking signals to ease; running agents are not stopped. The detail names sustained paging. | New work is held. |

All three states show swap used, compressor share, and available memory. Critical also shows the active and queued heavy-job counts. The `repoos stats` summary names whether pressure holds work, warns only, or is clear, in addition to the signal ratios and any guard reason.

## Responsive pass

Headless Chromium against `just serve-noauth 7273` from a scratch worktree, using the registered `system:pressureNormal`, `system:pressureWarning`, and `system:pressureCritical` fixtures:

- 1280 × 900: all states rendered; no page or panel horizontal overflow.
- 375 × 900: all states rendered; no page or panel horizontal overflow.
- Scrolled warning capture at 375px: the complete status, ratios, advisory explanation, heavy-job count, and signal detail fit above the fixed bottom navigation.
- All six initial captures returned HTTP 200, showed the expected state, and had no browser console or page errors.

The panel uses the page's normal vertical scrolling on mobile; its lower rows are not all visible in the initial top-of-page viewport. The scrolled capture confirms the full warning explanation remains readable when brought into view.

## Regression coverage

Table-driven component tests verify all three fixture states, status wording, rounded swap/compressor values, the warning's non-blocking meaning, and the critical queued-job count. CLI tests verify the corresponding normal, warning, and critical explanations in `repoos stats`. Focused test run: 14 tests passed across the pressure fixture and resource reporting suites.

This pass validates the rendered UI and copy with synthetic readings. It does not claim a real host was placed under memory pressure.
