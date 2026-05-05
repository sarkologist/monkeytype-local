# Current work

We are currently working on the focused practice feature.

See:

- `plan for focused practice.md`
- `focused practice design decisions.md`

## Done

- Display focused practice stats on account page (`/profile` when logged in)
  - Backend: `getFocusItems` now returns a `summary` (totalWords, totalBiwords, missRate, averageBurst)
  - Contract: `GetPracticeStatsResponse` includes `summary: PracticeStatsSummary`
  - Frontend: new `FocusedPracticeStats` component shown only when `isAccountPage=true`
