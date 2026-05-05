# Current work

We are currently working on the focused practice feature.

See:

- `plan for focused practice.md`
- `focused practice design decisions.md`

## In progress

## Done

- Remove top-30 cutoff in focused practice pool — `getFocusItems` now returns all qualifying items (score > 0); long tail naturally low-probability via score-weighted sampling.
- "Load more" button in focused practice stats — shows 10 items at a time, button hidden when all shown
- Display focused practice stats on account page (`/profile` when logged in)
  - Backend: `getFocusItems` now returns a `summary` (totalWords, totalBiwords, missRate, averageBurst)
  - Contract: `GetPracticeStatsResponse` includes `summary: PracticeStatsSummary`
  - Frontend: new `FocusedPracticeStats` component shown only when `isAccountPage=true`
