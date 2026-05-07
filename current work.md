# Current work

We are currently working on the focused practice feature.

See:

- `plan for focused practice.md`
- `focused practice design decisions.md`

## In progress

Stats UI improvements (highest-leverage gaps from assessment):

- [x] attempts column + practice volume tile
- [x] graduated items list
- [x] weekly summary snapshots + trendline
- [x] character-level error tracking

## Done

- Retention interleaving: backend exposes `retentionWords`/`retentionBiwords` (graduated set, scored by peakMissRate); frontend allocates ~10% of practice slots to retention with `allocateSlots` (collapses to 0 when no graduated items exist, falls back to all-retention when no struggle items exist). Retention testing without re-creating struggle.
- Recency boost in scoring: items whose `peakMissRateAt` is recent get up to a 50% multiplier on the (miss + slow) base score, fading linearly to baseline over 30 days. Freshly identified weaknesses get more iterations than long-settled ones.
- Feed char substitutions into selection: `getCharStats` now returns both `topSubstitutions` (display) and `charWeights` (max-normalized per-target-char weights). Word/biword scoring adds `0.15 × charAffinity`, where affinity is the mean weight across an item's alpha chars. Items composed of the user's known-bad chars now enter the pool even with low miss rate, so practice is composed around the keys they actually fail on.
- Character-level error tracking: frontend collects per-position substitutions (target → typed) for each typed word in `buildPracticeStats`, restricted to alpha chars (skips digits/punctuation that would already be stripped by normalize). `CompletedEventPracticeStats.chars` carries them; new `userCharSubstitutions` collection persists per-(uid, language, target, typed) counts with same 30-day decay. `getFocusItems` now returns `topSubstitutions` (top 10 by decayed count); rendered as "top mistakes" section in the stats UI.
- Weekly summary snapshots + trendline: new `userPracticeSnapshots` collection, taken opportunistically inside `updateStats` when prior snapshot for uid+lang is ≥ 7 days old (or absent); each snapshot stores the same `PracticeStatsSummary` shape; capped at 26 most recent. New `GET /users/practiceStats/history` endpoint, sparkline trendline UI tiles for miss rate, avg burst, attempts logged, and items tracked.
- Graduated items list: `UserPracticeStat` now persists `peakMissRate` and `peakMissRateAt`, updated lazily inside `updateEntry` when a fresh post-decay miss rate exceeds the prior peak (gated by `PEAK_MIN_ATTEMPTS=5`). `getFocusItems` returns a `graduated[]` of items where peak ≥ 10% and current decayed miss rate < 5% with attempts ≥ 5; rendered in a "graduated" section showing peak vs now, so user gets positive feedback for words they've conquered.
- Surface practice volume + per-item attempts: `summary.totalAttempts` added (sum of decayed attempts on qualifying items), shown as "attempts logged" tile; per-item `attempts` column added to top-struggling table so users can see sample size context for each score.
- Remove top-30 cutoff in focused practice pool — `getFocusItems` now returns all qualifying items (score > 0); long tail naturally low-probability via score-weighted sampling.
- "Load more" button in focused practice stats — shows 10 items at a time, button hidden when all shown
- Display focused practice stats on account page (`/profile` when logged in)
  - Backend: `getFocusItems` now returns a `summary` (totalWords, totalBiwords, missRate, averageBurst)
  - Contract: `GetPracticeStatsResponse` includes `summary: PracticeStatsSummary`
  - Frontend: new `FocusedPracticeStats` component shown only when `isAccountPage=true`
- Bootstrap from filler — removed dead-end; session always starts; shortfall backfills into filler; one-line notice when zero qualifying items; filler uses Zipf over full list when `orderedByFrequency`, uniform top-100 otherwise.
