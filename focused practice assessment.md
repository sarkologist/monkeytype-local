# Focused practice assessment

Data source: local MongoDB, assessed 2026-06-03. Primary dataset is one
`english_1k` user/language series.

## Sufficiency

Enough data for a provisional assessment:

- 2,317 practice stat docs: 449 words, 1,868 biwords.
- 4 weekly snapshots from 2026-05-07 to 2026-05-31.
- Current decayed qualifying volume: 269 items, 4,790.1 attempts.
- 529 saved `english_1k/custom/custom` results from 2026-05-06 to 2026-06-03.

Not enough for causal proof:

- Results do not explicitly mark focused-practice sessions.
- Practice aggregates are not bucketed by source mode.
- No held-out/control word set.

## Assessment

Focused practice appears to be working.

Aggregate weak-item stats improved:

- Snapshot miss rate fell from 16.1% on 2026-05-07 to 12.4% on 2026-05-31.
- Current decayed miss rate is 12.1%.
- Average burst rose from 126.6 WPM to 136.3 WPM over the same snapshot range.

Focused-like saved results improved:

- First 100 custom results: 102.4 mean WPM, 96.67% mean accuracy.
- Last 100 custom results: 107.7 mean WPM, 96.94% mean accuracy.
- Linear trend across all 529 custom results: +0.344 WPM/day, +0.040 accuracy points/day.

Previously weak items improved:

- 96 items have reached at least 10% peak miss rate and still have 5+ decayed attempts.
- Weighted miss rate on those items is down from 24.6% peak to 17.4% current.
- Median relative improvement across those weak items: 33.9%.
- 4 items graduated below 5% current miss rate: `on`, `and`, `is the`, `would of`.

## Remaining Weaknesses

The main remaining cluster is `look`/`would` biwords:

- `look`: 382.3 attempts, 29.0% current miss rate.
- `they look`: 17.3 attempts, 50.6% miss rate.
- `would would`: 35.8 attempts, 38.2% miss rate.
- `show would`: 16.8 attempts, 37.2% miss rate.
- `look would`: 37.6 attempts, 34.6% miss rate.

## Conclusion

Provisional verdict: focused practice is improving performance, especially on
tracked weak items. The strongest evidence is the snapshot miss-rate drop and
the weak-item peak-to-current recovery. The saved-result WPM trend supports the
same conclusion, but should be treated as supporting evidence because focused
practice is inferred from `custom/custom`, not explicitly labelled.

Best next measurement improvement: store a result/session source flag for
focused practice, then compare focused items against matched non-focused
high-error items.
