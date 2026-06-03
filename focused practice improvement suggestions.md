# Focused practice improvement suggestions

## Measurement

- Add explicit source and session identifiers to practice stats.
- Persist focused-practice session plans: selected items, role, score, count,
  config, seed, and session id.
- Hold out 10% of eligible weak items from targeted selection for lift
  measurement.
- Track dose response: focused exposures since selection vs miss-rate drop.
- Track retention relapse for graduated items after later probes.
- Compare focused results against neutral generated tests, not only custom
  focused-practice runs.
- Report confidence intervals and sample counts beside assessment metrics.

## Algorithm

- Use source-aware weighting so filler and focused items can be evaluated
  separately.
- Add spaced retention scheduling for graduated items.
- Cluster related weaknesses, such as repeated `look`/`would` biwords.
- Cap overexposed items to avoid grinding one item forever.
- Reserve an exploration quota for uncertain low-sample candidates.
- Tune score weights from observed outcomes.
- Add short probe blocks before or after focused practice.
