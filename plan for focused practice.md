# Focused practice plan

## Goal

Persist enough per-result typing detail to build long-term weak-word and weak-combo stats, then generate targeted practice through existing custom mode.

## Agent instructions

- After implementing any focused-practice change, update this file and `focused practice design decisions.md`.
- Keep status/checklists current: mark what shipped, what changed, and what remains.
- Trim shipped sub-plans to a one-line entry under "Shipped" once their work is in.

## Current state

Core feature shipped. See code for design details; this doc tracks what's pending and any new sub-plans.

- Backend: `userPracticeStats` collection, lazy decay, weighted updates, scoring, `GET/POST /users/practiceStats`.
- Frontend: collector, focused-practice generator (custom mode + pipe delimiter), commandline entry points, settings (`focusedPracticeRepeatedTestWeight`, `focusedPracticeWeight`, `focusedPracticeWordCount`, `focusedPracticeFillerProbability`).
- See `focused practice design decisions.md` for invariants.

## Shipped sub-plans

- Stats from focused-practice runs — runs feed back into stats at dampened weight (`focusedPracticeWeight`, default 0.5). Manual QA still pending (see open items).
- Configurable focused-practice item count — `focusedPracticeItemCount` config (3–20, default 10) replaces hardcoded top-10. Session length clamped to 20–100 via formula `2 * perCat * (1 + fillerRatio)`.
- Configurable word count + filler probability — `focusedPracticeWordCount` (10–100, default 50) sets session length directly; `focusedPracticeFillerProbability` (0–1, default 0.3) is the per-word probability of filler. Pool built by score-weighted sampling with replacement; session limit = word count exactly. Replaces rank-based `weightedItems` and the old item-count formula.
- Remove top-N cutoff — dropped `.slice(0, 30)` from `getFocusItems`; full qualifying pool now returned, long tail naturally low-probability via score-weighted sampling.
- Bootstrap from filler — removed dead-end; backfill shortfall into filler so session length always equals `focusedPracticeWordCount`; one-line notice when zero qualifying items; filler uses Zipf over full list when language is `orderedByFrequency`, falls back to uniform top-100 otherwise.

## Pending

### Tests

Frontend:

- [ ] collector includes only generated wordlist tests
- [ ] repeated generated tests emit weighted practiceStats when setting > 0
- [ ] repeated generated tests emit no practiceStats when setting is 0
- [ ] custom/focused practice does not emit practiceStats (non-focused custom)
- [ ] focused-practice run emits `practiceStats` with `weight === Config.focusedPracticeWeight`
- [ ] focused-practice run with `focusedPracticeWeight === 0` emits no `practiceStats`
- [ ] focused-practice run still respects punctuation/numbers/funbox guards
- [ ] missed and slow words aggregate correctly
- [ ] biwords use previous + current target words

Backend:

- [ ] result save updates aggregate docs
- [ ] repeated stats-only update updates aggregate docs but inserts no result
- [ ] practiceStats is not persisted on result documents

Contract/schema:

- [ ] completed event accepts bounded optional practiceStats
- [ ] focus endpoint validates response

### Other

- Manual QA for focused-practice stats feedback: confirm `userPracticeStats` updates with dampened increments and picks shift after sustained improvement.
- Opportunistic pruning for tiny/old `userPracticeStats` docs (or maintenance job if collection grows).

## Open questions

- Repeated-test UI step size not documented.
- Stats-only update rate-limit behavior not explicitly documented.

## Configurable filler ratio

Shipped. All 8 files touched; both hardcoded `0.3` sites replaced; config-event re-init handler added; type-check clean.
